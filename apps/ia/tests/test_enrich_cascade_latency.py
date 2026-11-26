"""Latence de la cascade d'enrichissement contact (bouton « Enrichir »).

La cascade est ENTIÈREMENT séquentielle (People-Match → People-Search → org
broadening → SalesQL) et chaque leg peut lui-même faire la queue derrière le
throttle Apollo partagé. Sans borne, un contact introuvable faisait défiler une
douzaine d'appels HTTP avant de répondre — la requête bloquée du bouton pouvait
tenir ~60 s.

Trois garanties vérifiées ici :

1. **Un seul pool HTTP** pour toute la cascade (avant : un ``AsyncClient`` neuf
   par leg ⇒ une poignée de handshakes TLS pour rien).
2. **Un budget de temps** : les legs OPTIONNELS s'arrêtent quand il est épuisé,
   et la réponse le DIT (``truncated``) — une cascade tronquée n'est pas une
   absence de données, et l'API ne doit pas la transformer en cooldown 30 jours.
3. **L'élargissement d'org est borné** (2 candidats) : les variantes lointaines
   coûtent 2 appels chacune et ne matchent presque jamais.
"""
from __future__ import annotations

import os
from typing import Any
from unittest.mock import patch

import pytest

from app.models.contacts import ApolloEnrichmentResult
from app.services import apollo
from app.services.apollo import (
    DEFAULT_ENRICH_BUDGET_S,
    _broaden_org_names,
    _enrich_budget_s,
    enrich_person_with_fallback,
)


def _hit() -> ApolloEnrichmentResult:
    return ApolloEnrichmentResult(
        matched=True, first_name="Owen", last_name="Renard",
        email="owen@dirigo.fr", title="Business Development Manager",
    )


class TestBudgetEnv:
    """Le budget est réglable, mais un réglage cassé ne doit pas mutiler la
    cascade : 0 / négatif / non numérique ⇒ défaut (comme le rate limiter)."""

    def test_default_when_unset(self) -> None:
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("ENRICH_CASCADE_BUDGET_S", None)
            assert _enrich_budget_s() == DEFAULT_ENRICH_BUDGET_S

    def test_explicit_value_wins(self) -> None:
        with patch.dict(os.environ, {"ENRICH_CASCADE_BUDGET_S": "12.5"}):
            assert _enrich_budget_s() == 12.5

    @pytest.mark.parametrize("raw", ["0", "-3", "", "beaucoup"])
    def test_invalid_falls_back_to_default(self, raw: str) -> None:
        # 0 doit rester un défaut, pas « aucune recherche » : un opérateur qui
        # pose 0 dans Railway ne doit pas casser l'enrichissement en silence.
        with patch.dict(os.environ, {"ENRICH_CASCADE_BUDGET_S": raw}):
            assert _enrich_budget_s() == DEFAULT_ENRICH_BUDGET_S


class TestBroadenCap:
    def test_capped_at_two_candidates(self) -> None:
        # « Groupe TF1 France » produit 3 variantes brutes (sans préfixe, sans
        # suffixe, token de tête) — on n'en tente que 2.
        out = _broaden_org_names("Groupe TF1 France (ou Studio TF1)")
        assert len(out) <= 2

    def test_still_broadens_to_the_parent_brand(self) -> None:
        # La borne ne doit pas tuer le cas qui justifie la fonctionnalité.
        assert "TF1" in _broaden_org_names("Studio TF1")


@pytest.mark.asyncio
async def test_one_http_client_shared_across_the_whole_cascade() -> None:
    """Tous les legs reçoivent le MÊME client (keep-alive, un seul handshake)."""
    seen: list[Any] = []

    async def fake_enrich_person(**kwargs: Any) -> ApolloEnrichmentResult:
        seen.append(kwargs.get("http_client"))
        return ApolloEnrichmentResult(matched=False)

    async def fake_resolve(**kwargs: Any) -> None:
        seen.append(kwargs.get("http_client"))
        return None

    async def fake_salesql(**kwargs: Any) -> ApolloEnrichmentResult:
        seen.append(kwargs.get("http_client"))
        return ApolloEnrichmentResult(matched=False)

    with patch.dict(os.environ, {"APOLLO_API_KEY": "k"}), \
            patch.object(apollo, "enrich_person", side_effect=fake_enrich_person), \
            patch.object(apollo, "_resolve_by_search", side_effect=fake_resolve), \
            patch.object(apollo, "salesql_is_enabled", return_value=True), \
            patch.object(apollo, "salesql_enrich_person", side_effect=fake_salesql):
        await enrich_person_with_fallback(
            first_name="Owen", last_name="Renard", organization_name="Dirigo",
            organization_domain="dirigo.fr", title="Business Development Manager",
        )

    assert len(seen) >= 3, "les 3 legs (match, search, salesql) doivent avoir tourné"
    assert all(client is not None for client in seen), "aucun leg ne doit ouvrir son propre client"
    assert len({id(client) for client in seen}) == 1, "un seul pool HTTP pour la cascade"


@pytest.mark.asyncio
async def test_provided_client_is_reused_and_not_closed() -> None:
    """Un appelant qui fournit son client garde la main dessus."""
    import httpx

    caller_client = httpx.AsyncClient(timeout=5)
    seen: list[Any] = []

    async def fake_enrich_person(**kwargs: Any) -> ApolloEnrichmentResult:
        seen.append(kwargs.get("http_client"))
        return _hit()

    with patch.dict(os.environ, {"APOLLO_API_KEY": "k"}), \
            patch.object(apollo, "enrich_person", side_effect=fake_enrich_person):
        result = await enrich_person_with_fallback(
            first_name="Owen", last_name="Renard", organization_name="Dirigo",
            http_client=caller_client,
        )

    assert result.matched is True
    assert seen == [caller_client]
    assert caller_client.is_closed is False
    await caller_client.aclose()


@pytest.mark.asyncio
async def test_budget_stops_the_broadening_loop_and_says_so() -> None:
    """Chaque recherche « coûte » 20 s sur une horloge injectée : la 1re passe,
    la 1re variante élargie passe, la 2e est refusée — et le résultat est marqué
    tronqué (l'API ne doit pas l'écrire comme « rien trouvé »)."""
    clock = {"t": 0.0}
    calls: list[str] = []

    def fake_monotonic() -> float:
        return clock["t"]

    async def fake_resolve(*, organization_name: str, **_: Any) -> None:
        calls.append(organization_name)
        clock["t"] += 20.0
        return None

    with patch.dict(os.environ, {"APOLLO_API_KEY": "k"}), \
            patch.object(apollo, "_monotonic", side_effect=fake_monotonic), \
            patch.object(apollo, "_resolve_by_search", side_effect=fake_resolve):
        result = await enrich_person_with_fallback(
            first_name="Owen", organization_name="Groupe TF1 France",
            title="Directeur des Sports", budget_s=25.0,
        )

    assert calls == ["Groupe TF1 France", "TF1 France"], calls
    assert result.matched is False
    assert result.truncated is True


@pytest.mark.asyncio
async def test_budget_skips_salesql_when_exhausted() -> None:
    """SalesQL est un leg optionnel : hors budget, il ne part pas du tout."""
    clock = {"t": 0.0}

    def fake_monotonic() -> float:
        return clock["t"]

    async def fake_enrich_person(**_: Any) -> ApolloEnrichmentResult:
        clock["t"] += 40.0  # le People-Match a mangé tout le budget
        return ApolloEnrichmentResult(matched=False)

    salesql_calls: list[dict[str, Any]] = []

    async def fake_salesql(**kwargs: Any) -> ApolloEnrichmentResult:
        salesql_calls.append(kwargs)
        return _hit()

    with patch.dict(os.environ, {"APOLLO_API_KEY": "k"}), \
            patch.object(apollo, "_monotonic", side_effect=fake_monotonic), \
            patch.object(apollo, "enrich_person", side_effect=fake_enrich_person), \
            patch.object(apollo, "salesql_is_enabled", return_value=True), \
            patch.object(apollo, "salesql_enrich_person", side_effect=fake_salesql):
        result = await enrich_person_with_fallback(
            first_name="Owen", last_name="Renard", organization_name="Dirigo",
            organization_domain="dirigo.fr", budget_s=25.0,
        )

    assert salesql_calls == []
    assert result.matched is False
    assert result.truncated is True


@pytest.mark.asyncio
async def test_first_leg_always_runs_even_with_a_tiny_budget() -> None:
    """Le budget borne les legs OPTIONNELS ; il ne doit jamais empêcher la
    tentative principale (sinon un clic ne fait littéralement rien)."""
    calls: list[dict[str, Any]] = []

    async def fake_enrich_person(**kwargs: Any) -> ApolloEnrichmentResult:
        calls.append(kwargs)
        return _hit()

    with patch.dict(os.environ, {"APOLLO_API_KEY": "k"}), \
            patch.object(apollo, "enrich_person", side_effect=fake_enrich_person):
        result = await enrich_person_with_fallback(
            first_name="Owen", last_name="Renard", organization_name="Dirigo",
            title="Business Development Manager", budget_s=0.0001,
        )

    assert len(calls) == 1
    assert result.matched is True
    # Rien n'a été sauté : un match immédiat n'est pas une cascade tronquée.
    assert result.truncated is False


@pytest.mark.asyncio
async def test_full_cascade_within_budget_is_not_marked_truncated() -> None:
    """Budget respecté ⇒ comportement d'avant, à l'identique, `truncated` faux."""
    clock = {"t": 0.0}

    def fake_monotonic() -> float:
        clock["t"] += 0.5
        return clock["t"]

    async def fake_resolve(**_: Any) -> None:
        return None

    async def fake_enrich_person(**_: Any) -> ApolloEnrichmentResult:
        return ApolloEnrichmentResult(matched=False)

    with patch.dict(os.environ, {"APOLLO_API_KEY": "k"}), \
            patch.object(apollo, "_monotonic", side_effect=fake_monotonic), \
            patch.object(apollo, "enrich_person", side_effect=fake_enrich_person), \
            patch.object(apollo, "_resolve_by_search", side_effect=fake_resolve), \
            patch.object(apollo, "salesql_is_enabled", return_value=False):
        result = await enrich_person_with_fallback(
            first_name="Owen", last_name="Renard", organization_name="Studio TF1",
            title="Directeur des Sports",
        )

    assert result.matched is False
    assert result.truncated is False
