"""`POST /discover/registry` — « Exclure les sociétés cotées » AGIT côté recherche (#4361.2).

Décision Louis 20/10/2026 : un interrupteur séparé, qui se combine avec n'importe
quelle tranche. La liste doit RETIRER la société prouvée cotée — pas la masquer à
l'écran — et DIRE ce qu'elle n'a pas pu établir (« non mesuré » n'est jamais « non
coté », doctrine).

Source de la preuve : l'index public des sociétés dont la cotation est ouverte
(`listed_companies.py`), lié au SIREN. Il est INCOMPLET par nature : une société
absente n'est pas « non cotée », elle est « cotation non établie ».
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.services.data_sources import listed_companies

LISTED = {
    "name": "GROUPE COTE SA",
    "siren": "542051180",
    "nafCode": "62.01Z",
    "sector": "Programmation informatique",
    "city": "Courbevoie",
    "department": "92",
    "headcountRange": "1 000 à 1 999 salariés",
    "creationDate": "1990-01-01",
}

PRIVATE_1 = {
    "name": "ETI FAMILIALE SAS",
    "siren": "444556677",
    "nafCode": "62.01Z",
    "sector": "Programmation informatique",
    "city": "Lyon",
    "department": "69",
    "headcountRange": "250 à 499 salariés",
    "creationDate": "2001-03-14",
}

PRIVATE_2 = {
    "name": "AUTRE ETI SAS",
    "siren": "333445566",
    "nafCode": "62.01Z",
    "sector": "Programmation informatique",
    "city": "Nantes",
    "department": "44",
    "headcountRange": "500 à 999 salariés",
    "creationDate": "2004-06-01",
}


@pytest.fixture
def registry(monkeypatch):
    class _Stub:
        rows: list[dict] = []

        async def __call__(self, filters, limit, degraded=None):
            return list(type(self).rows)

    stub = _Stub()
    _Stub.rows = []
    monkeypatch.setattr("app.routers.discover._registry_search", stub)
    return _Stub


@pytest.fixture
def fallback(monkeypatch):
    class _Stub:
        rows: list[dict] = []

        async def __call__(self, filters, limit, degraded=None):
            return list(type(self).rows)

    stub = _Stub()
    _Stub.rows = []
    monkeypatch.setattr("app.routers.discover._fallback_search", stub)
    return _Stub


def _claude() -> Any:
    return patch(
        "app.routers.discover.call_claude",
        new_callable=AsyncMock,
        return_value=({"angles": []}, None),
    )


def _index(value: frozenset[str] | None) -> Any:
    return patch("app.routers.discover.listed_sirens", new_callable=AsyncMock, return_value=value)


def _post(client, **filters: Any):
    payload = {"filters": {"freetext": "ESN dans le 69", **filters}, "profile_data": {}}
    with _claude():
        return client.post("/discover/registry", json=payload)


# ── 1. L'interrupteur retire la société prouvée cotée — et sans lui elle reste ──


def test_listed_company_leaves_the_list_with_the_switch(client, registry, fallback) -> None:
    registry.rows = [LISTED, PRIVATE_1, PRIVATE_2]

    with _index(frozenset({"542051180"})):
        res = _post(client, excludeListed=True)

    assert res.status_code == 200, res.text
    assert {c["siren"] for c in res.json()["candidates"]} == {"444556677", "333445566"}


def test_listed_company_stays_without_the_switch(client, registry, fallback) -> None:
    registry.rows = [LISTED, PRIVATE_1]

    with _index(frozenset({"542051180"})):
        res = _post(client)

    body = res.json()
    assert {c["siren"] for c in body["candidates"]} == {"542051180", "444556677"}
    # Un filtre qui n'a pas tourné n'a pas de compteur (jamais « 0 retirée »).
    assert body.get("listingFilter") is None


# ── 2. Le résultat DIT ce qu'il a retiré et ce qu'il n'a pas pu établir ──


def test_counter_names_removed_and_unknown(client, registry, fallback) -> None:
    registry.rows = [LISTED, PRIVATE_1, PRIVATE_2]

    with _index(frozenset({"542051180"})):
        res = _post(client, excludeListed=True)

    info = res.json()["listingFilter"]
    assert info == {"applied": True, "excludedCount": 1, "unknownCount": 2, "sourceAvailable": True}


def test_unknown_listing_is_kept_never_called_unlisted(client, registry, fallback) -> None:
    """Absente de l'index ≠ non cotée : elle reste, et le compteur ne la range
    pas dans les « non cotées »."""
    registry.rows = [PRIVATE_1]

    with _index(frozenset({"542051180"})):
        res = _post(client, excludeListed=True)

    body = res.json()
    assert [c["siren"] for c in body["candidates"]] == ["444556677"]
    assert body["listingFilter"]["excludedCount"] == 0
    assert body["listingFilter"]["unknownCount"] == 1


def test_silent_source_removes_nothing_and_says_so(client, registry, fallback) -> None:
    registry.rows = [LISTED, PRIVATE_1]

    with _index(None):
        res = _post(client, excludeListed=True)

    body = res.json()
    assert {c["siren"] for c in body["candidates"]} == {"542051180", "444556677"}
    assert body["listingFilter"] == {
        "applied": True,
        "excludedCount": 0,
        "unknownCount": 2,
        "sourceAvailable": False,
    }


def test_switch_composes_with_a_headcount_band(client, registry, fallback) -> None:
    """« Se combine avec n'importe quelle tranche » : la tranche part au registre
    comme avant, l'interrupteur agit sur ce qu'il rend."""
    registry.rows = [LISTED, PRIVATE_1]

    with _index(frozenset({"542051180"})):
        res = _post(client, excludeListed=True, headcountMin=250, headcountMax=4999)

    assert res.status_code == 200, res.text
    body = res.json()
    assert [c["siren"] for c in body["candidates"]] == ["444556677"]
    assert body["query"]["headcountMin"] == 250
    assert body["query"]["headcountMax"] == 4999


# ── 3. L'index des sociétés cotées ────────────────────────────────────────


def _sparql(*sirens: str) -> dict:
    return {"results": {"bindings": [{"siren": {"type": "literal", "value": s}} for s in sirens]}}


async def test_index_reads_sirens_and_drops_malformed(monkeypatch) -> None:
    monkeypatch.setattr(listed_companies, "_cache", None)
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json=_sparql("542051180", "12345", "", "380129866")))
    async with httpx.AsyncClient(transport=transport) as client:
        found = await listed_companies.listed_sirens(client=client)

    assert found == frozenset({"542051180", "380129866"})


async def test_index_failure_is_unknown_not_empty(monkeypatch) -> None:
    monkeypatch.setattr(listed_companies, "_cache", None)
    transport = httpx.MockTransport(lambda request: httpx.Response(503))
    async with httpx.AsyncClient(transport=transport) as client:
        found = await listed_companies.listed_sirens(client=client)

    assert found is None


async def test_empty_answer_is_a_silent_source(monkeypatch) -> None:
    """Un index sans aucune société cotée n'existe pas : c'est une source muette."""
    monkeypatch.setattr(listed_companies, "_cache", None)
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json=_sparql()))
    async with httpx.AsyncClient(transport=transport) as client:
        found = await listed_companies.listed_sirens(client=client)

    assert found is None
