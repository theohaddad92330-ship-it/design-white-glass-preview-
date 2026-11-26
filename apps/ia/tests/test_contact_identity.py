"""Contact identity — Python side.

Mirrors ``apps/api/src/modules/contacts/contact-identity.ts``. Phase 2 merged
Apollo seeds with the Brave+Claude fallback using ``fullName.strip().lower()``
as the key and ``dedup[k] = s`` as the write, which had two bugs: the key was
blind to accents ("Sébastien" ≠ "Sebastien"), and last-write-wins meant a thin
web-scraped seed silently replaced the rich Apollo one — dropping its
``linkedinUrl``, ``apolloId`` and ``apolloDetails`` on the floor.
"""

from __future__ import annotations

from app.services.contact_identity import contact_identity_keys, merge_contact_seeds


def test_accent_variants_share_a_key() -> None:
    a = contact_identity_keys({"fullName": "Sébastien Chauffray"})
    b = contact_identity_keys({"fullName": "Sebastien Chauffray"})
    assert set(a) & set(b)


def test_hyphenated_first_name_matches_spaced() -> None:
    a = contact_identity_keys({"fullName": "Jean-Pierre Dupont"})
    b = contact_identity_keys({"fullName": "Jean Pierre Dupont"})
    assert set(a) & set(b)


def test_registry_name_order_matches_apollo_order() -> None:
    a = contact_identity_keys({"fullName": "DUPONT Jean"})
    b = contact_identity_keys({"fullName": "Jean Dupont"})
    assert set(a) & set(b)


def test_linkedin_url_matches_regardless_of_form() -> None:
    a = contact_identity_keys({"fullName": "P. Onnen", "linkedinUrl": "https://www.linkedin.com/in/paulonnen/"})
    b = contact_identity_keys({"fullName": "Paul Onnen", "linkedinUrl": "http://linkedin.com/in/paulonnen"})
    assert set(a) & set(b)


def test_different_people_do_not_match() -> None:
    a = contact_identity_keys({"fullName": "Jean Dupont"})
    b = contact_identity_keys({"fullName": "Marie Martin"})
    assert not (set(a) & set(b))


def test_unidentifiable_contact_has_no_keys() -> None:
    assert contact_identity_keys({"fullName": "   "}) == []


def test_merge_keeps_the_first_occurrence_position() -> None:
    merged = merge_contact_seeds([
        {"fullName": "Alice Un", "source": "apollo"},
        {"fullName": "Bob Deux", "source": "apollo"},
        {"fullName": "Alice Un", "source": "brave_search"},
    ])
    assert [s["fullName"] for s in merged] == ["Alice Un", "Bob Deux"]


def test_merge_does_not_let_a_thin_seed_overwrite_a_rich_one() -> None:
    """The live regression: Apollo first, Brave second, Brave used to win."""
    merged = merge_contact_seeds([
        {
            "fullName": "Sebastien Chauffray",
            "title": "Chief Technology Officer",
            "linkedinUrl": "https://linkedin.com/in/schauffray",
            "apolloId": "abc123",
            "source": "apollo",
        },
        {"fullName": "Sébastien Chauffray", "title": "CTO", "source": "brave_search"},
    ])

    assert len(merged) == 1
    assert merged[0]["apolloId"] == "abc123"
    assert merged[0]["linkedinUrl"] == "https://linkedin.com/in/schauffray"
    assert merged[0]["source"] == "apollo"


def test_merge_backfills_fields_the_first_seed_lacked() -> None:
    merged = merge_contact_seeds([
        {"fullName": "Jean Dupont", "title": None, "linkedinUrl": None, "source": "pappers"},
        {
            "fullName": "Jean Dupont",
            "title": "Directeur des Systèmes d'Information",
            "linkedinUrl": "https://linkedin.com/in/jdupont",
            "source": "apollo",
        },
    ])

    assert len(merged) == 1
    assert merged[0]["title"] == "Directeur des Systèmes d'Information"
    assert merged[0]["linkedinUrl"] == "https://linkedin.com/in/jdupont"
    # The winning row keeps its own provenance — it is still the Pappers seed,
    # enriched. Attribution must not silently flip.
    assert merged[0]["source"] == "pappers"


def test_merge_prefers_the_more_specific_title() -> None:
    merged = merge_contact_seeds([
        {"fullName": "Jean Dupont", "title": "CTO"},
        {"fullName": "Jean Dupont", "title": "Chief Technology Officer"},
    ])
    assert merged[0]["title"] == "Chief Technology Officer"


def test_merge_ignores_placeholder_titles() -> None:
    merged = merge_contact_seeds([
        {"fullName": "Jean Dupont", "title": "Directeur Financier"},
        {"fullName": "Jean Dupont", "title": "-"},
    ])
    assert merged[0]["title"] == "Directeur Financier"


def test_merge_drops_nameless_seeds() -> None:
    merged = merge_contact_seeds([{"fullName": "  "}, {"fullName": "Jean Dupont"}])
    assert [s["fullName"] for s in merged] == ["Jean Dupont"]


def test_merge_links_via_linkedin_when_names_differ() -> None:
    merged = merge_contact_seeds([
        {"fullName": "Paul Onnen", "linkedinUrl": "https://linkedin.com/in/paulonnen"},
        {"fullName": "P. Onnen", "linkedinUrl": "https://www.linkedin.com/in/paulonnen/", "title": "CTO"},
    ])
    assert len(merged) == 1
    assert merged[0]["title"] == "CTO"


def test_merge_is_stable_and_pure() -> None:
    """Same input → same output, and the caller's dicts are not mutated."""
    original = [
        {"fullName": "Alice Un", "title": None},
        {"fullName": "Alice Un", "title": "DSI"},
    ]
    snapshot = [dict(s) for s in original]
    first = merge_contact_seeds(original)
    second = merge_contact_seeds(original)

    assert first == second
    assert original == snapshot, "merge_contact_seeds must not mutate its input"


# ── Accent preservation ──────────────────────────────────────────────────────
# ``fullName`` was treated as pure provenance: the FIRST seed's spelling was
# frozen, so an Apollo seed that had already dropped the accents kept
# "Sebastien Chauffray" even when a later source supplied "Sébastien". Between
# two spellings of the same normalised name, the accented one is the
# source-faithful one — de-accenting is lossy and one-way.


def test_merge_adopts_the_accented_spelling_from_a_later_seed() -> None:
    merged = merge_contact_seeds([
        {"fullName": "Sebastien Chauffray", "source": "apollo", "apolloId": "abc123"},
        {"fullName": "Sébastien Chauffray", "source": "brave_search"},
    ])

    assert len(merged) == 1
    assert merged[0]["fullName"] == "Sébastien Chauffray"
    # Provenance still belongs to the first seed — only the spelling improved.
    assert merged[0]["source"] == "apollo"
    assert merged[0]["apolloId"] == "abc123"


def test_merge_does_not_strip_accents_already_held() -> None:
    merged = merge_contact_seeds([
        {"fullName": "Sébastien Chauffray", "source": "apollo"},
        {"fullName": "Sebastien Chauffray", "source": "brave_search"},
    ])
    assert merged[0]["fullName"] == "Sébastien Chauffray"


def test_merge_never_relabels_a_contact_matched_on_another_key() -> None:
    """Matched on the LinkedIn URL, not the name: adopting the second seed's
    name would rename the person. Keep the incumbent's."""
    merged = merge_contact_seeds([
        {"fullName": "P. Onnen", "linkedinUrl": "https://linkedin.com/in/paulonnen"},
        {"fullName": "Paul Onnen", "linkedinUrl": "https://www.linkedin.com/in/paulonnen/"},
    ])
    assert len(merged) == 1
    assert merged[0]["fullName"] == "P. Onnen"


def test_merge_invents_no_accent() -> None:
    """Neither source accented the name, so neither does the result."""
    merged = merge_contact_seeds([
        {"fullName": "Sebastien Chauffray"},
        {"fullName": "Sebastien Chauffray"},
    ])
    assert merged[0]["fullName"] == "Sebastien Chauffray"
