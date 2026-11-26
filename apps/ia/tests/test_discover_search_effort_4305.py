"""#4305.2 — la recherche DIT son effort : combien de sources interrogées, ce qui l'a arrêtée.

Le compteur d'appels existait (journalisé seulement, #4305) : il manquait l'appelant qui le met dans
`query.searchEffort`. Jamais un crédit, jamais un fournisseur — deux faits : un nombre et une cause."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.routers.discover import _search_effort
from app.services.company_filters import DegradeReason, degraded_entry
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


@pytest.fixture
def registry(monkeypatch):
    rows = [_row(i) for i in range(200)]

    def page_of(page: int) -> list[dict]:
        start = (page - 1) * LIST_PAGE_MAX
        return [dict(row) for row in rows[start : start + LIST_PAGE_MAX]]

    async def first(filters, limit, degraded=None):
        return page_of(1)

    async def page(filters, limit, degraded=None, *, page: int = 1):
        return page_of(page)

    monkeypatch.setattr("app.routers.discover._registry_search", AsyncMock(return_value=[]))
    monkeypatch.setattr("app.routers.discover._fallback_search", first)
    monkeypatch.setattr("app.routers.discover._fallback_search_page", page)


def _post(client: TestClient, limit: int) -> dict:
    with patch("app.routers.discover.call_claude", new_callable=AsyncMock, return_value=({"angles": []}, None)):
        response = client.post("/discover/registry", json={"filters": {"nafCode": "30.30Z,29.10Z"}, "limit": limit})
    assert response.status_code == 200, response.text
    return response.json()


def test_the_response_carries_the_effort_of_the_search(client: TestClient, registry) -> None:
    effort = _post(client, 100)["query"]["searchEffort"]
    assert effort["sourcesQueried"] == 4  # page 1 + pages 2, 3, 4 : le même compteur que le journal
    assert effort["stoppedBy"] == "limit"  # le volume demandé est atteint


def test_effort_never_names_a_provider_nor_a_credit(client: TestClient, registry) -> None:
    effort = _post(client, 20)["query"]["searchEffort"]
    assert set(effort) == {"sourcesQueried", "stoppedBy"}
    assert isinstance(effort["sourcesQueried"], int)
    assert effort["stoppedBy"] in {"limit", "time", "exhausted"}


def test_stopped_by_time_budget_is_named() -> None:
    degraded = [degraded_entry("recherche-entreprises", DegradeReason.TIME_BUDGET)]
    assert _search_effort(3, candidates=12, limit=50, degraded=degraded) == {"sourcesQueried": 3, "stoppedBy": "time"}


def test_signals_time_budget_does_not_claim_the_list_was_cut() -> None:
    degraded = [degraded_entry("discover-signals", DegradeReason.TIME_BUDGET)]
    assert _search_effort(4, candidates=100, limit=100, degraded=degraded)["stoppedBy"] == "limit"


def test_source_ran_dry_is_exhausted_not_limit() -> None:
    assert _search_effort(2, candidates=7, limit=50, degraded=[]) == {"sourcesQueried": 2, "stoppedBy": "exhausted"}


def test_no_call_means_no_effort_never_a_zero() -> None:
    assert _search_effort(0, candidates=0, limit=50, degraded=[]) is None
