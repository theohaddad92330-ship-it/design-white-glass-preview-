"""People-Search fallback that fixes the « identité incomplète » catch-22.

When a contact is a role-persona placeholder (« Isabelle · Global Head of
Procurement ») or first-name-only, People-Match can't resolve it. The fallback
searches ``organization + title`` for the REAL named person, then re-matches on
the resolved identity. Apollo is fully mocked here.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

import app.services.apollo as apollo
from app.models.contacts import ApolloEnrichmentResult, ApolloSearchHit
from app.services.apollo import _pick_search_candidate, enrich_person_with_fallback

# ─── _pick_search_candidate (pure) ───────────────────────────────────────────


def test_pick_candidate_ignores_placeholder_first_name() -> None:
    hits = [
        ApolloSearchHit(first_name="Marie-Claire", last_name="Durand"),
        ApolloSearchHit(first_name="Paul", last_name="Martin"),
    ]
    # The placeholder « Isabelle » matches nobody → the top real hit wins.
    picked = _pick_search_candidate(hits, "Isabelle")
    assert picked is not None and picked.first_name == "Marie-Claire"


def test_pick_candidate_prefers_matching_first_name() -> None:
    hits = [
        ApolloSearchHit(first_name="Other", last_name="Person"),
        ApolloSearchHit(first_name="Olgierd", last_name="Nowak"),
    ]
    # A real first name (« Olgierd ») should pick that person, not the top hit.
    picked = _pick_search_candidate(hits, "Olgierd")
    assert picked is not None and picked.last_name == "Nowak"


def test_pick_candidate_requires_a_full_name() -> None:
    # A hit with only a first name is a placeholder — never surfaced as real.
    assert _pick_search_candidate([ApolloSearchHit(first_name="Isabelle", last_name="")], "Isabelle") is None
    assert _pick_search_candidate([], "Isabelle") is None


# ─── enrich_person_with_fallback ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_incomplete_identity_resolves_via_search(monkeypatch: pytest.MonkeyPatch) -> None:
    search = AsyncMock(
        return_value=[
            ApolloSearchHit(
                first_name="Marie-Claire",
                last_name="Durand",
                title="Global Head of Procurement",
                organization_name="BNP Paribas",
                linkedin_url="https://linkedin.com/in/mcdurand",
            ),
        ]
    )
    reveal = AsyncMock(
        return_value=ApolloEnrichmentResult(
            matched=True,
            email="mc.durand@bnp.fr",
            email_status="verified",
            linkedin_url="https://linkedin.com/in/mcdurand",
        )
    )
    monkeypatch.setattr(apollo, "search_people", search)
    monkeypatch.setattr(apollo, "enrich_person", reveal)

    result = await enrich_person_with_fallback(
        first_name="Isabelle",  # role-persona placeholder — must NOT bias the search
        organization_name="BNP Paribas",
        title="Global Head of Procurement",
    )

    # Real identity resolved + email revealed.
    assert result.matched
    assert result.first_name == "Marie-Claire"
    assert result.last_name == "Durand"
    assert result.email == "mc.durand@bnp.fr"

    # The search targeted organization + title; the placeholder first name was
    # never used as a filter.
    assert search.call_args.kwargs["company_name"] == "BNP Paribas"
    assert search.call_args.kwargs["person_titles"] == ["Global Head of Procurement"]
    # Reveal used the resolved LinkedIn key, not the placeholder name.
    assert reveal.call_args.kwargs.get("linkedin_url") == "https://linkedin.com/in/mcdurand"


@pytest.mark.asyncio
async def test_people_match_first_when_full_name(monkeypatch: pytest.MonkeyPatch) -> None:
    match = AsyncMock(
        return_value=ApolloEnrichmentResult(
            matched=True, first_name="Jean", last_name="Dupont", email="jean@acme.fr"
        )
    )
    search = AsyncMock(return_value=[])
    monkeypatch.setattr(apollo, "enrich_person", match)
    monkeypatch.setattr(apollo, "search_people", search)

    result = await enrich_person_with_fallback(
        first_name="Jean", last_name="Dupont", organization_name="Acme"
    )

    assert result.email == "jean@acme.fr"
    match.assert_awaited_once()
    # Match hit on a full name → the role-search fallback must never run.
    search.assert_not_awaited()


@pytest.mark.asyncio
async def test_search_completes_identity_even_when_email_reveal_empty(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Real prénom-seul contact (Olgierd) — search resolves the last name; the
    # email reveal comes up empty, but the completed identity is still a success.
    search = AsyncMock(
        return_value=[ApolloSearchHit(first_name="Olgierd", last_name="Nowak", title="RGM")]
    )
    monkeypatch.setattr(apollo, "search_people", search)
    monkeypatch.setattr(apollo, "enrich_person", AsyncMock(return_value=ApolloEnrichmentResult(matched=False)))

    result = await enrich_person_with_fallback(
        first_name="Olgierd", organization_name="COMUTO", title="Regional General Manager CEE"
    )

    assert result.matched
    assert result.first_name == "Olgierd"
    assert result.last_name == "Nowak"
    assert result.email is None


@pytest.mark.asyncio
async def test_returns_empty_when_search_finds_nobody(monkeypatch: pytest.MonkeyPatch) -> None:
    search = AsyncMock(return_value=[])
    monkeypatch.setattr(apollo, "search_people", search)
    monkeypatch.setattr(apollo, "enrich_person", AsyncMock())

    result = await enrich_person_with_fallback(
        first_name="Isabelle", organization_name="BNP Paribas", title="Head of Procurement"
    )

    # No candidate ⇒ honest empty, never invented.
    assert result.matched is False
    assert result.email is None


@pytest.mark.asyncio
async def test_no_role_and_no_last_name_stays_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    search = AsyncMock(return_value=[])
    match = AsyncMock(return_value=ApolloEnrichmentResult(matched=False))
    monkeypatch.setattr(apollo, "search_people", search)
    monkeypatch.setattr(apollo, "enrich_person", match)

    # First name + org only (no last name, no title) — nothing reliable to match
    # or search on. Never attempts a doomed fuzzy match on a placeholder.
    result = await enrich_person_with_fallback(first_name="Isabelle", organization_name="BNP Paribas")

    assert result.matched is False
    search.assert_not_awaited()
    match.assert_not_awaited()


# ─── Org scoping — the P0 unblock (retour Théo) ──────────────────────────────


@pytest.mark.asyncio
async def test_search_scoped_by_account_apollo_org_id(monkeypatch: pytest.MonkeyPatch) -> None:
    # The role search must scope by the ACCOUNT's Apollo org id, never the messy
    # entity label alone (« Groupe TF1 » → 0 hits before this fix).
    search = AsyncMock(
        return_value=[ApolloSearchHit(first_name="Julien", last_name="Vidal", title="Directeur des Sports")]
    )
    monkeypatch.setattr(apollo, "search_people", search)
    monkeypatch.setattr(apollo, "enrich_person", AsyncMock(return_value=ApolloEnrichmentResult(matched=False)))
    monkeypatch.setattr(apollo, "salesql_is_enabled", lambda: False)

    result = await enrich_person_with_fallback(
        first_name="Julien",  # placeholder — role-persona
        organization_name="Groupe TF1",
        organization_id="54abc",
        organization_domain="tf1.fr",
        title="Directeur des Sports",
    )

    assert result.matched and result.last_name == "Vidal"
    # Both strong anchors propagate to People-Search.
    assert search.call_args.kwargs["organization_ids"] == ["54abc"]
    assert search.call_args.kwargs["organization_domains"] == ["tf1.fr"]


@pytest.mark.asyncio
async def test_search_scoped_by_domain_without_org_id(monkeypatch: pytest.MonkeyPatch) -> None:
    search = AsyncMock(return_value=[ApolloSearchHit(first_name="Marie-Aude", last_name="Morel", title="Administrateur")])
    monkeypatch.setattr(apollo, "search_people", search)
    monkeypatch.setattr(apollo, "enrich_person", AsyncMock(return_value=ApolloEnrichmentResult(matched=False)))
    monkeypatch.setattr(apollo, "salesql_is_enabled", lambda: False)

    result = await enrich_person_with_fallback(
        first_name="Marie-Aude", organization_name="Groupe TF1", organization_domain="tf1.fr", title="Administrateur"
    )

    assert result.matched and result.last_name == "Morel"
    assert search.call_args.kwargs["organization_ids"] is None
    assert search.call_args.kwargs["organization_domains"] == ["tf1.fr"]


# ─── SalesQL cascade (env-gated second source) ───────────────────────────────


@pytest.mark.asyncio
async def test_salesql_fills_email_when_apollo_has_none(monkeypatch: pytest.MonkeyPatch) -> None:
    # Apollo resolves the real identity (search) but the email reveal is empty;
    # SalesQL then fills the email from the resolved LinkedIn URL. Merged present-only.
    search = AsyncMock(
        return_value=[
            ApolloSearchHit(
                first_name="Marie-Aude",
                last_name="Morel",
                title="Administrateur",
                linkedin_url="https://linkedin.com/in/mamorel",
            )
        ]
    )
    monkeypatch.setattr(apollo, "search_people", search)
    monkeypatch.setattr(apollo, "enrich_person", AsyncMock(return_value=ApolloEnrichmentResult(matched=False)))
    monkeypatch.setattr(apollo, "salesql_is_enabled", lambda: True)
    salesql = AsyncMock(
        return_value=ApolloEnrichmentResult(matched=True, email="ma.morel@tf1.fr", email_status="verified")
    )
    monkeypatch.setattr(apollo, "salesql_enrich_person", salesql)

    result = await enrich_person_with_fallback(
        first_name="Marie-Aude", organization_name="Groupe TF1", organization_domain="tf1.fr", title="Administrateur"
    )

    assert result.matched
    assert result.last_name == "Morel"  # Apollo identity kept
    assert result.email == "ma.morel@tf1.fr"  # SalesQL email merged in
    # SalesQL was queried on the resolved LinkedIn URL.
    assert salesql.call_args.kwargs["linkedin_url"] == "https://linkedin.com/in/mamorel"


@pytest.mark.asyncio
async def test_salesql_finds_person_when_apollo_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    # Apollo match + search both miss, but the contact carries a LinkedIn URL →
    # SalesQL resolves email/identity from it.
    monkeypatch.setattr(apollo, "search_people", AsyncMock(return_value=[]))
    monkeypatch.setattr(apollo, "enrich_person", AsyncMock(return_value=ApolloEnrichmentResult(matched=False)))
    monkeypatch.setattr(apollo, "salesql_is_enabled", lambda: True)
    salesql = AsyncMock(
        return_value=ApolloEnrichmentResult(
            matched=True, first_name="Julien", last_name="Bataille", email="j.bataille@tf1.fr"
        )
    )
    monkeypatch.setattr(apollo, "salesql_enrich_person", salesql)

    result = await enrich_person_with_fallback(
        linkedin_url="https://linkedin.com/in/jbataille",
        organization_name="Groupe TF1",
        organization_domain="tf1.fr",
        title="Directeur des Sports",
    )

    assert result.matched
    assert result.email == "j.bataille@tf1.fr"
    assert result.last_name == "Bataille"


@pytest.mark.asyncio
async def test_salesql_not_called_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(apollo, "search_people", AsyncMock(return_value=[]))
    monkeypatch.setattr(apollo, "enrich_person", AsyncMock(return_value=ApolloEnrichmentResult(matched=False)))
    monkeypatch.setattr(apollo, "salesql_is_enabled", lambda: False)
    salesql = AsyncMock()
    monkeypatch.setattr(apollo, "salesql_enrich_person", salesql)

    result = await enrich_person_with_fallback(
        linkedin_url="https://linkedin.com/in/x", organization_name="Groupe TF1", title="Directeur des Sports"
    )

    assert result.matched is False
    salesql.assert_not_awaited()  # env-gated no-op — never called without the key


@pytest.mark.asyncio
async def test_salesql_skipped_when_apollo_already_has_email_and_phone(monkeypatch: pytest.MonkeyPatch) -> None:
    # Apollo full match with an email AND a phone → nothing left to fill, SalesQL
    # must not run (no wasted credit).
    monkeypatch.setattr(
        apollo,
        "enrich_person",
        AsyncMock(
            return_value=ApolloEnrichmentResult(matched=True, email="jean@acme.fr", phone="+33 1 23 45 67 89")
        ),
    )
    monkeypatch.setattr(apollo, "search_people", AsyncMock(return_value=[]))
    monkeypatch.setattr(apollo, "salesql_is_enabled", lambda: True)
    salesql = AsyncMock()
    monkeypatch.setattr(apollo, "salesql_enrich_person", salesql)

    result = await enrich_person_with_fallback(
        first_name="Jean", last_name="Dupont", organization_name="Acme"
    )

    assert result.email == "jean@acme.fr"
    assert result.phone == "+33 1 23 45 67 89"
    salesql.assert_not_awaited()


@pytest.mark.asyncio
async def test_salesql_still_runs_when_apollo_has_email_but_no_phone(monkeypatch: pytest.MonkeyPatch) -> None:
    # #3022 (retour bêta) — reproduit le bug rapporté : Apollo résout l'email
    # (son reveal EST demandé) mais jamais le téléphone (`_build_enrich_payload`,
    # webhook hors scope) ; avant le correctif, `not result.email` seul était
    # faux ici (l'email est présent) et SalesQL — seul membre de la cascade
    # capable de compléter le téléphone — n'était donc JAMAIS appelé, même si le
    # téléphone manquait toujours. `not result.phone` fait tourner ce leg tant
    # que le téléphone manque, quel que soit l'état de l'email.
    monkeypatch.setattr(
        apollo,
        "enrich_person",
        AsyncMock(return_value=ApolloEnrichmentResult(matched=True, email="jean@acme.fr", phone=None)),
    )
    monkeypatch.setattr(apollo, "search_people", AsyncMock(return_value=[]))
    monkeypatch.setattr(apollo, "salesql_is_enabled", lambda: True)
    salesql = AsyncMock(
        return_value=ApolloEnrichmentResult(matched=True, phone="+33 6 12 34 56 78")
    )
    monkeypatch.setattr(apollo, "salesql_enrich_person", salesql)

    result = await enrich_person_with_fallback(
        first_name="Jean", last_name="Dupont", organization_name="Acme"
    )

    # SalesQL DID run despite the email already being present…
    salesql.assert_awaited_once()
    # …and the cascade now has BOTH: Apollo's email kept, SalesQL's phone merged in.
    assert result.email == "jean@acme.fr"
    assert result.phone == "+33 6 12 34 56 78"
