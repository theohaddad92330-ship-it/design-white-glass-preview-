"""#3983.3 (#3705.3) — Laura DIT la base d'une géographie : siège ou implantation.

`run_account_search` rend, pour chaque compte, `location` — « siège à Paris
(75), 3 établissements en Auvergne-Rhône-Alpes » — quand le registre prouve
quelque chose sur la zone demandée. `site_basis` choisit la base du FILTRE :
`headquarters` = siège dans la zone ; `presence` (défaut) = au moins un
établissement actif dans la zone. L'effectif LOCAL d'un site n'est pas dans la
source : l'item le NOMME dans `not_evaluated`, il ne l'invente pas.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services import chat_tools
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool

TOOL_NAME = "run_account_search"


def _geo(**overrides: Any) -> dict[str, Any]:
    geo: dict[str, Any] = {
        "basis": "establishment",
        "headquarters": {"city": "PARIS", "department": "75"},
        "siteCount": 3,
        "sites": [],
        "zoneRegion": "84",
    }
    geo.update(overrides)
    return geo


def _candidate(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {"siren": "552032534", "name": "FREE SAS", "city": "Lyon", "department": "69"}
    base.update(overrides)
    return base


class _Response:
    def __init__(self, candidates: list[dict[str, Any]]) -> None:
        self.candidates = candidates
        self.degraded: list[dict[str, Any]] = []
        self.query: dict[str, Any] = {}
        self.recommendedSort = "balanced"


def _stub(monkeypatch: pytest.MonkeyPatch, candidates: list[dict[str, Any]]) -> list[Any]:
    seen: list[Any] = []

    async def _fake(req: Any) -> Any:
        seen.append(req)
        return _Response(candidates)

    monkeypatch.setattr("app.routers.discover.discover_registry", _fake)
    return seen


def test_the_schema_offers_site_basis() -> None:
    tool = next(t for t in CHAT_TOOLS if t["name"] == TOOL_NAME)
    prop = tool["input_schema"]["properties"]["site_basis"]
    assert prop["enum"] == ["headquarters", "presence"]
    assert "site_basis" in chat_tools.REFINABLE_SEARCH_CRITERIA[TOOL_NAME]


@pytest.mark.asyncio
async def test_the_item_says_the_basis(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub(monkeypatch, [_candidate(geography=_geo())])
    out = await execute_chat_tool(TOOL_NAME, {"department": "69"}, user_id="u-1", profile_data=None)
    item = out["items"][0]
    assert item["location"] == "siège à Paris (75), 3 établissements en Auvergne-Rhône-Alpes"
    # « Équipe » : l'effectif local n'est pas dans la source — dit, pas inventé.
    assert any("effectif" in line and "établissement" in line for line in item["not_evaluated"])
    assert not any("headcount_local" in key for key in item)


@pytest.mark.asyncio
async def test_no_geography_means_no_location_and_no_team_note(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub(monkeypatch, [_candidate()])
    out = await execute_chat_tool(TOOL_NAME, {"department": "69"}, user_id="u-1", profile_data=None)
    item = out["items"][0]
    assert "location" not in item
    assert "not_evaluated" not in item


@pytest.mark.asyncio
async def test_headquarters_basis_reaches_the_registry_filters(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = _stub(monkeypatch, [_candidate()])
    out = await execute_chat_tool(
        TOOL_NAME, {"department": "69", "site_basis": "headquarters"}, user_id="u-1", profile_data=None
    )
    assert seen[0].filters.siteBasis == "headquarters"
    assert out["criteria"]["site_basis"] == "headquarters"


@pytest.mark.asyncio
async def test_presence_basis_is_the_default_and_adds_no_filter(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = _stub(monkeypatch, [_candidate()])
    out = await execute_chat_tool(TOOL_NAME, {"department": "69"}, user_id="u-1", profile_data=None)
    assert seen[0].filters.siteBasis is None
    assert "site_basis" not in out["criteria"]


@pytest.mark.asyncio
async def test_site_basis_without_a_zone_is_named_not_silently_dropped(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = _stub(monkeypatch, [_candidate()])
    out = await execute_chat_tool(
        TOOL_NAME, {"sectors": ["telecom"], "site_basis": "headquarters"}, user_id="u-1", profile_data=None
    )
    assert seen[0].filters.siteBasis is None
    assert "zone" in out["site_basis_not_applied_reason"]
