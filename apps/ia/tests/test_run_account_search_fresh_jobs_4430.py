"""#4430 (Louis 21/10) — Laura propose des comptes : son moteur (Découvrir) reçoit l'ESPACE de la personne,
seul sésame des offres fraîches (plafond quotidien par espace). Sans espace résolu : cache seul."""

from __future__ import annotations

from typing import Any

import pytest

from app.services import workspace_scope
from app.services.chat_tools import execute_chat_tool


class _Response:
    def __init__(self) -> None:
        self.candidates: list[dict[str, Any]] = []
        self.degraded: list[dict[str, Any]] = []
        self.query: dict[str, Any] = {}
        self.recommendedSort = "balanced"


def _stub(monkeypatch: pytest.MonkeyPatch, workspace: str | None) -> list[Any]:
    seen: list[Any] = []

    async def _fake(req: Any) -> Any:
        seen.append(req)
        return _Response()

    async def _resolve(user_id: str, sb: Any | None = None) -> str | None:
        return workspace

    monkeypatch.setattr("app.routers.discover.discover_registry", _fake)
    monkeypatch.setattr(workspace_scope, "resolve_workspace_id", _resolve)
    return seen


@pytest.mark.asyncio
async def test_laura_passes_the_resolved_space_to_the_engine(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = _stub(monkeypatch, "ws-42")
    await execute_chat_tool("run_account_search", {"department": "75"}, user_id="u-1", profile_data=None)
    # La première lecture porte l'espace ; le palier régional de #4408.1 lit sans lui
    # (une réponse = UN plafond), donc on compte les espaces au lieu des appels.
    assert seen and seen[0].spaceKey == "ws-42"
    assert [req.spaceKey for req in seen if req.spaceKey] == ["ws-42"]


@pytest.mark.asyncio
async def test_without_a_resolved_space_laura_pays_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = _stub(monkeypatch, None)
    await execute_chat_tool("run_account_search", {"department": "75"}, user_id="u-1", profile_data=None)
    # Aucune lecture ne paie — ni la demandee, ni le palier regional de #4408.1.
    assert seen and [req.spaceKey for req in seen if req.spaceKey] == []


@pytest.mark.asyncio
async def test_two_sector_groups_share_one_answer_ceiling(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = _stub(monkeypatch, "ws-42")
    await execute_chat_tool(
        "run_account_search",
        {"department": "75", "sectors": ["Banque & assurance", "Industrie"]},
        user_id="u-1",
        profile_data=None,
    )
    # Une réponse = un plafond de 10 : seul le premier groupe porte l'espace.
    assert sum(1 for req in seen if req.spaceKey) <= 1


def test_an_item_read_from_the_cache_tells_laura_the_date_of_its_offers() -> None:
    from app.services.chat_tools import _search_item

    item = _search_item({"siren": "552032534", "name": "FREE SAS", "jobsAsOf": "2026-10-19"})
    assert item is not None and item["jobs_as_of"] == "2026-10-19"
    fresh = _search_item({"siren": "552032534", "name": "FREE SAS", "skillFreshFill": True})
    assert fresh is not None and fresh["fresh_collection"] is True and "jobs_as_of" not in fresh
    plain = _search_item({"siren": "552032534", "name": "FREE SAS"})
    assert plain is not None and "jobs_as_of" not in plain and "fresh_collection" not in plain
