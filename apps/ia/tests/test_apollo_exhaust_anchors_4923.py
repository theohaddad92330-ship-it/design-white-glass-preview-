"""#4923.9 — les passes « rôles de tête » interrogent TOUTES les ancres (id, domaine,
nom) et fusionnent ; la recherche générale garde sa cascade (arrêt au premier jeu ≥ 25)."""

from __future__ import annotations

import os
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.services.apollo import search_people_with_status


def _person(i: int, org: str) -> dict:
    return {
        "id": f"p{i}",
        "first_name": f"P{i}",
        "last_name": "X",
        "title": "Head of Data",
        "organization": {"name": org},
        "linkedin_url": f"https://linkedin.com/in/p{i}",
    }


def _resp(people: list[dict]) -> httpx.Response:
    return httpx.Response(
        200,
        json={"people": people, "pagination": {"total_entries": len(people), "total_pages": 1, "page": 1}},
        request=httpx.Request("POST", "https://x.io"),
    )


def _client(batches: list[list[dict]]) -> AsyncMock:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.post = AsyncMock(side_effect=[_resp(b) for b in batches])
    return client


@pytest.mark.asyncio
async def test_exhaust_anchors_queries_every_anchor_and_merges() -> None:
    # id → 30 personnes d'AXA France ; domaine → 3 d'AXA Group (dont le Head of Data) ; nom → 1.
    client = _client([[_person(i, "AXA France") for i in range(30)], [_person(100 + i, "AXA Group") for i in range(3)], [_person(200, "AXA XL")]])
    with patch.dict(os.environ, {"APOLLO_API_KEY": "k", "REDIS_URL": ""}):
        contacts, _status, _total = await search_people_with_status(
            "AXA",
            person_titles=["Head of Data"],
            organization_ids=["org_1"],
            organization_domains=["axa.com"],
            http_client=client,
            exhaust_anchors=True,
        )
    assert client.post.call_count == 3
    assert len(contacts) == 34
    # Le contact trouvé par le seul NOM reste « employeur non vérifié » (#3911.1).
    by_id = {c.id: c for c in contacts}
    assert by_id["p200"].employer_unverified is True
    assert not by_id["p100"].employer_unverified


@pytest.mark.asyncio
async def test_default_cascade_still_stops_at_the_first_sufficient_anchor() -> None:
    client = _client([[_person(i, "AXA France") for i in range(30)]])
    with patch.dict(os.environ, {"APOLLO_API_KEY": "k", "REDIS_URL": ""}):
        contacts, _s, _t = await search_people_with_status(
            "AXA",
            organization_ids=["org_1"],
            organization_domains=["axa.com"],
            http_client=client,
        )
    assert client.post.call_count == 1
    assert len(contacts) == 30
