"""Deterministic entity parentId tree (annexe organigramme p6).

Groupe→Filiale→BU inferred from the structural TYPE hierarchy + name-containment —
never from the undocumented Pappers edge direction, never fabricated. An entity with
no derivable parent stays honestly unattached (parentId None).
"""

from __future__ import annotations

from app.services.entities import assign_entity_parents


def _e(name: str, type_: str) -> dict:
    return {"name": name, "type": type_}


def test_group_root_has_no_parent() -> None:
    out = assign_entity_parents([_e("TF1 Groupe", "groupe")])
    assert out[0]["parentId"] is None


def test_filiale_attaches_to_group_by_shared_brand_token() -> None:
    out = assign_entity_parents([_e("TF1 Groupe", "groupe"), _e("TF1 Pub", "filiale")])
    by = {e["name"]: e for e in out}
    assert by["TF1 Groupe"]["parentId"] is None
    assert by["TF1 Pub"]["parentId"] == "TF1 Groupe"


def test_lone_subsidiary_falls_back_to_the_single_group_root() -> None:
    # LCL shares no distinctive token with "Crédit Agricole" → the single-root fallback
    # attaches it to the sole group (an account has one root), never a guess.
    out = assign_entity_parents([_e("Crédit Agricole SA", "groupe"), _e("LCL", "filiale")])
    by = {e["name"]: e for e in out}
    assert by["LCL"]["parentId"] == "Crédit Agricole SA"


def test_no_fallback_when_two_group_roots_are_ambiguous() -> None:
    out = assign_entity_parents([_e("Groupe A", "groupe"), _e("Groupe B", "groupe"), _e("Zeta", "filiale")])
    by = {e["name"]: e for e in out}
    assert by["Zeta"]["parentId"] is None  # ambiguous root → honest None


def test_closest_tier_wins_over_the_group() -> None:
    out = assign_entity_parents(
        [_e("TF1 Groupe", "groupe"), _e("TF1 Pub", "filiale"), _e("TF1 Pub Data", "bu")]
    )
    by = {e["name"]: e for e in out}
    # "TF1 Pub Data" shares tokens with BOTH the group (tf1) and the filiale (tf1+pub) —
    # the closer, stronger-overlap filiale wins.
    assert by["TF1 Pub Data"]["parentId"] == "TF1 Pub"


def test_bu_without_a_name_link_stays_unattached() -> None:
    out = assign_entity_parents([_e("TF1 Groupe", "groupe"), _e("TF1 Pub", "filiale"), _e("Data", "bu")])
    by = {e["name"]: e for e in out}
    assert by["Data"]["parentId"] is None  # tier ≥ 2, no name match → honest None (no fallback)


def test_non_structural_types_get_no_parent_field() -> None:
    out = assign_entity_parents(
        [_e("TF1 Groupe", "groupe"), _e("2009 Koala Finance", "SPV"), _e("Paris", "site"), _e("Homonyme", "homonyme")]
    )
    by = {e["name"]: e for e in out}
    for name in ("2009 Koala Finance", "Paris", "Homonyme"):
        assert "parentId" not in by[name]  # untouched — not in the operating tree


def test_is_pure_and_deterministic() -> None:
    ents = [_e("TF1 Groupe", "groupe"), _e("TF1 Pub", "filiale")]
    out1 = assign_entity_parents(ents)
    out2 = assign_entity_parents(ents)
    assert [e.get("parentId") for e in out1] == [e.get("parentId") for e in out2]
    assert "parentId" not in ents[0] and "parentId" not in ents[1]  # input never mutated
