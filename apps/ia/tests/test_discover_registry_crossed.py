"""Secteurs CROISÉS sur `POST /discover/registry` — le rail unifié (maquette p.20).

Le registre ne sait pas OU-er deux sections NAF en une requête. Pour rendre
« secteur × secteur » exprimable dans UNE recherche sans jamais inventer de
donnée, le routeur l'interroge une fois PAR secteur (en parallèle) et fusionne
les listes par SIREN.

Ce qui est verrouillé ici :

1. ``sectors: [a, b]`` déclenche une sous-recherche par secteur, chacune avec SA
   section NAF ;
2. les entreprises trouvées par plusieurs secteurs ne sont comptées qu'une fois ;
3. ``all`` et les doublons ne sont pas des contraintes — ils sont ignorés ;
4. au-delà de la borne, les secteurs surnuméraires sont ÉCARTÉS et DITS
   (``degraded``), jamais silencieusement honorés ;
5. le chemin mono-secteur (``sector``) reste inchangé.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.routers.discover import MAX_CROSSED_SECTORS

# Une entreprise IT (section J) et une entreprise finance (section K).
ROW_IT = {
    "name": "ACME SOFT",
    "siren": "552081317",
    "nafCode": "62.02A",
    "sector": "Conseil en systèmes et logiciels informatiques",
    "city": "Lyon",
    "department": "69",
    "headcountRange": "100 à 199 salariés",
    "creationDate": "2005-03-14",
}
ROW_FINANCE = {
    "name": "BETA BANQUE",
    "siren": "444556677",
    "nafCode": "64.19Z",
    "sector": "Autres intermédiations monétaires",
    "city": "Lyon",
    "department": "69",
    "headcountRange": "200 à 249 salariés",
    "creationDate": "2001-01-10",
}


@pytest.fixture
def by_section(monkeypatch):
    """Fournisseur registre qui répond SELON la section NAF de la sous-requête —
    c'est ce qui permet de prouver qu'un croisement interroge bien chaque secteur.
    Le repli sans clé ne renvoie rien (le principal suffit)."""
    calls: list[str | None] = []
    rows_by_section: dict[str | None, list[dict]] = {
        "J": [ROW_IT],
        "K": [ROW_FINANCE],
    }

    async def _primary(filters, limit, degraded=None):
        calls.append(filters.naf_section)
        return list(rows_by_section.get(filters.naf_section, []))

    async def _fallback(filters, limit, degraded=None):
        return []

    monkeypatch.setattr("app.routers.discover._registry_search", _primary)
    monkeypatch.setattr("app.routers.discover._fallback_search", _fallback)
    return calls


def _claude(angles: list[dict] | None = None) -> Any:
    return patch(
        "app.routers.discover.call_claude",
        new_callable=AsyncMock,
        return_value=({"angles": angles or []}, None),
    )


def _post(client: TestClient, **filters: Any):
    return client.post("/discover/registry", json={"filters": filters})


def test_two_sectors_query_the_registry_once_per_sector(client, by_section) -> None:
    with _claude():
        body = _post(client, sectors=["it", "finance"], department="69").json()

    # Une sous-recherche par secteur, chacune avec SA section NAF.
    assert sorted(s for s in by_section if s) == ["J", "K"]
    # Les deux entreprises remontent, fusionnées dans une seule liste.
    assert {c["siren"] for c in body["candidates"]} == {"552081317", "444556677"}


def test_a_company_matched_by_several_sectors_is_counted_once(client, monkeypatch) -> None:
    """Une même entité renvoyée par deux secteurs ne doit pas être dédoublée."""

    async def _primary(filters, limit, degraded=None):
        return [ROW_IT]  # les deux secteurs renvoient la MÊME entreprise

    async def _fallback(filters, limit, degraded=None):
        return []

    monkeypatch.setattr("app.routers.discover._registry_search", _primary)
    monkeypatch.setattr("app.routers.discover._fallback_search", _fallback)
    with _claude():
        body = _post(client, sectors=["it", "finance"]).json()

    assert [c["siren"] for c in body["candidates"]] == ["552081317"]


def test_all_and_duplicates_are_not_constraints(client, by_section) -> None:
    with _claude():
        _post(client, sectors=["it", "all", "it", ""]).json()

    # « all »/doublons/vides écartés : une seule sous-recherche, sur la section IT.
    assert [s for s in by_section if s] == ["J"]


def test_sectors_echo_in_the_applied_query(client, by_section) -> None:
    with _claude():
        body = _post(client, sectors=["it", "finance"]).json()

    assert body["query"]["sectors"] == ["it", "finance"]


def test_too_many_sectors_are_dropped_and_said_not_silently_honoured(client, by_section) -> None:
    requested = ["it", "finance", "energy", "industry", "health", "retail", "transport", "public"]
    with _claude():
        body = _post(client, sectors=requested).json()

    # Exactement la borne de sous-recherches, jamais plus.
    assert len([s for s in by_section if s]) == MAX_CROSSED_SECTORS
    # Et les secteurs écartés sont DITS, nommés, cadrés comme une limite de
    # capacité (pas une panne).
    dropped = requested[MAX_CROSSED_SECTORS:]
    assert {
        "source": "discover",
        "reason": "unsupported_filters",
        "kind": "capability",
        "fields": dropped,
    } in body["degraded"]


def test_a_no_match_across_sectors_is_deduplicated(client, monkeypatch) -> None:
    """Deux secteurs sans correspondance ne doivent pas empiler deux fois la même
    entrée ``no_match`` d'une même source."""

    async def _empty(filters, limit, degraded=None):
        return []

    monkeypatch.setattr("app.routers.discover._registry_search", _empty)
    monkeypatch.setattr("app.routers.discover._fallback_search", _empty)
    with patch("app.routers.discover.call_claude", new_callable=AsyncMock) as claude:
        body = _post(client, sectors=["it", "finance"]).json()

    assert body["candidates"] == []
    pappers_no_match = [d for d in body["degraded"] if d["source"] == "pappers" and d["reason"] == "no_match"]
    assert len(pappers_no_match) == 1, "une même panne répétée par secteur n'est dite qu'une fois"
    claude.assert_not_awaited()
