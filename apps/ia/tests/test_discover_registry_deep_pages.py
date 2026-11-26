"""`POST /discover/registry` — #4016 L7 : Découvrir sans palier (décision Louis 11/10/2026).

Le volume de la capacité commerciale (10 / 25 / 50) n'est plus qu'un PREMIER LOT :
« Voir plus » relance la recherche avec un ``limit`` plus grand. Pour que ce
« plus » existe, la source gratuite est lue sur AUTANT DE PAGES que le ``limit``
en demande — de vraies pages du registre, jamais la même page relue.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.routers.discover import MAX_REGISTRY_LIMIT, MAX_REGISTRY_PAGES
from app.services.data_sources.recherche_entreprises import LIST_PAGE_MAX


def _row(index: int) -> dict:
    return {
        "name": f"SOCIETE {index:04d} SAS",
        "siren": f"{100000000 + index}",
        "nafCode": "30.30Z",
        "sector": "Construction aéronautique et spatiale",
        "city": "TOULOUSE",
        "department": "31",
        "headcountRange": "50 à 99 salariés",
        "headcountTranche": "21",
        "legalCategory": "5710",
    }


class _Registry:
    """Un registre de ``total`` lignes, servi par pages de ``LIST_PAGE_MAX``."""

    def __init__(self, total: int) -> None:
        self.rows = [_row(i) for i in range(total)]
        self.pages: list[int] = []

    def page_of(self, page: int) -> list[dict]:
        start = (page - 1) * LIST_PAGE_MAX
        return [dict(row) for row in self.rows[start : start + LIST_PAGE_MAX]]

    async def first(self, filters, limit, degraded=None):
        return self.page_of(1)

    async def page(self, filters, limit, degraded=None, *, page: int = 1):
        self.pages.append(page)
        return self.page_of(page)


@pytest.fixture
def registry(monkeypatch):
    def install(total: int) -> _Registry:
        source = _Registry(total)
        monkeypatch.setattr("app.routers.discover._registry_search", AsyncMock(return_value=[]))
        monkeypatch.setattr("app.routers.discover._fallback_search", source.first)
        monkeypatch.setattr("app.routers.discover._fallback_search_page", source.page)
        return source

    return install


def _post(client: TestClient, limit: int) -> dict[str, Any]:
    with patch("app.routers.discover.call_claude", new_callable=AsyncMock, return_value=({"angles": []}, None)):
        # Plusieurs codes NAF : la source gratuite passe devant (#2490.4).
        response = client.post("/discover/registry", json={"filters": {"nafCode": "30.30Z,29.10Z"}, "limit": limit})
    assert response.status_code == 200, response.text
    return response.json()


def test_the_first_batch_reads_only_the_first_page(client: TestClient, registry) -> None:
    """Témoin : le premier lot (≤ une page) ne coûte pas un appel de plus."""
    source = registry(200)

    body = _post(client, 20)

    assert source.pages == []
    assert len(body["candidates"]) == 20


def test_see_more_reads_as_many_real_pages_as_the_limit_needs(client: TestClient, registry) -> None:
    source = registry(200)

    body = _post(client, 100)

    assert source.pages == [2, 3, 4]
    sirens = [c["siren"] for c in body["candidates"]]
    assert len(sirens) == 100
    assert len(set(sirens)) == 100


def test_the_paging_stops_when_the_registry_runs_out(client: TestClient, registry) -> None:
    source = registry(60)

    body = _post(client, 150)

    # Page 3 n'est pas pleine : le registre est épuisé, on ne lit pas la page 4.
    assert source.pages == [2, 3]
    assert len(body["candidates"]) == 60


def test_the_depth_is_bounded(client: TestClient, registry) -> None:
    """Une borne TECHNIQUE (budget de temps de la requête), pas un palier produit."""
    source = registry(10_000)

    _post(client, 10_000)

    assert max(source.pages) <= MAX_REGISTRY_PAGES
    assert MAX_REGISTRY_LIMIT >= 200
    assert MAX_REGISTRY_PAGES * LIST_PAGE_MAX >= MAX_REGISTRY_LIMIT


def test_signals_mode_accepts_the_same_see_more_depth() -> None:
    """Le mode Signaux suit la même borne : le contrat API envoie jusqu'à
    ``DISCOVER_MAX_LIMIT`` (200) ; un 422 ici ferait tomber « Voir plus »."""
    from pydantic import ValidationError

    from app.routers.discover_signals import DiscoverSignalsRequest

    assert DiscoverSignalsRequest(limit=MAX_REGISTRY_LIMIT).limit == MAX_REGISTRY_LIMIT
    with pytest.raises(ValidationError):
        DiscoverSignalsRequest(limit=MAX_REGISTRY_LIMIT + 1)
