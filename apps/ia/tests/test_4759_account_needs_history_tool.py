"""#4759 — l'OUTIL de requête d'agrégat des besoins d'un compte est DÉCLARÉ côté IA.

Mesuré le 29/10/2026 : le pont NestJS (`internal/copilot/account/needs-history`) existait, le contexte annonçait
« 45 besoins » par compte, mais `apps/ia` ne déclarait aucun outil pour les lire — Laura disait « aucun résultat
d'outil » et se repliait sur le web. Ce fichier vérifie que `get_account_needs_history` est déclaré, en lecture
seule, qu'il RELAIE la page du pont telle quelle (filtres compris) et que « compte introuvable » ne se lit
jamais « aucun besoin ».
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, WRITE_TOOL_NAMES, execute_chat_tool

USER = "22222222-4222-4222-8222-222222222222"
ACCOUNT = "33333333-4333-8333-8333-333333333333"


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)


async def _run(tool_input: dict) -> dict:
    return await execute_chat_tool("get_account_needs_history", tool_input, user_id=USER, profile_data=None)


def test_registry_exposes_a_read_only_tool() -> None:
    assert "get_account_needs_history" in {t["name"] for t in CHAT_TOOLS}
    assert "get_account_needs_history" not in WRITE_TOOL_NAMES


def test_description_names_the_guards() -> None:
    tool = next(t for t in CHAT_TOOLS if t["name"] == "get_account_needs_history")
    description = str(tool["description"])
    assert tool["input_schema"]["required"] == ["account_id"]
    for prop in ("tech", "zone", "since", "until", "limit", "offset"):
        assert prop in tool["input_schema"]["properties"]
    # Un besoin passé se cite avec son âge calculé, jamais déduit.
    assert "ageLabel" in description
    # Le détail se lit par pages : `hasMore` / `offset`.
    assert "hasMore" in description
    # Une offre retombée reste un besoin vu.
    assert "stillListed" in description


@pytest.mark.asyncio
async def test_relays_the_page_and_the_filters(monkeypatch: pytest.MonkeyPatch) -> None:
    page = {
        "total": 45,
        "offset": 0,
        "limit": 10,
        "hasMore": True,
        "maxCallsPerTurn": 6,
        "aggregate": {"count": 45, "topTechs": ["Java"], "undatedCount": 2},
        "rows": [{"title": "Lead développeur Java (H/F)", "ageLabel": "il y a 11 mois", "stillListed": False}],
    }
    seen: dict = {}

    async def _fake(user_id: str, account_id: str, **filters: object) -> dict:
        seen.update(user_id=user_id, account_id=account_id, **filters)
        return page

    monkeypatch.setattr(bellum_api, "account_needs_history", _fake, raising=False)
    out = await _run({"account_id": ACCOUNT, "tech": "Java", "since": "2025-01-01", "limit": 10})
    assert out["rows"] == page["rows"]
    assert out["total"] == 45
    assert seen == {
        "user_id": USER,
        "account_id": ACCOUNT,
        "tech": "Java",
        "zone": None,
        "since": "2025-01-01",
        "until": None,
        "limit": 10,
        "offset": None,
    }
    assert out["status"] == "success"


@pytest.mark.asyncio
async def test_unknown_account_is_not_an_empty_history(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake(user_id: str, account_id: str, **filters: object) -> dict:
        return {"error": "account_not_found"}

    monkeypatch.setattr(bellum_api, "account_needs_history", _fake, raising=False)
    out = await _run({"account_id": ACCOUNT})
    assert "introuvable" in out["error"]


@pytest.mark.asyncio
async def test_no_rows_is_empty_not_zero_needs(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake(user_id: str, account_id: str, **filters: object) -> dict:
        return {"total": 0, "offset": 0, "limit": 10, "hasMore": False, "aggregate": {"count": 0}, "rows": []}

    monkeypatch.setattr(bellum_api, "account_needs_history", _fake, raising=False)
    out = await _run({"account_id": ACCOUNT, "tech": "COBOL"})
    assert out["status"] == "empty"


@pytest.mark.asyncio
async def test_bridge_down_is_a_provider_error(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake(user_id: str, account_id: str, **filters: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "account_needs_history", _fake, raising=False)
    out = await _run({"account_id": ACCOUNT})
    assert out["error"]
    assert out["status"] != "success"


@pytest.mark.asyncio
async def test_missing_account_id_asks_for_it() -> None:
    out = await _run({})
    assert "compte" in out["error"]


# Les tests ci-dessus remplacent le pont : ils ne voyaient pas que `NeedsHistoryController` EXIGE `workspaceId`
# (`needs-history.controller.ts`) — sans lui, chaque appel rendait 400. Ceux-ci lisent la VRAIE charge envoyée.
WORKSPACE = "44444444-4444-4444-8444-444444444444"


@pytest.mark.asyncio
async def test_the_bridge_sends_the_workspace_the_controller_requires(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import workspace_scope

    calls: list[tuple[str, dict]] = []

    async def fake_post(path: str, payload: dict, **_: object) -> dict:
        calls.append((path, payload))
        return {"rows": [], "total": 0, "hasMore": False}

    async def fake_workspace(user_id: str, sb: object | None = None) -> str | None:
        return WORKSPACE

    monkeypatch.setattr(bellum_api, "_post", fake_post)
    monkeypatch.setattr(workspace_scope, "resolve_workspace_id", fake_workspace)
    await bellum_api.account_needs_history(USER, ACCOUNT, tech="java", since="2025-01-01", limit=5)
    assert calls == [
        (
            "/internal/copilot/account/needs-history",
            {
                "userId": USER,
                "workspaceId": WORKSPACE,
                "accountId": ACCOUNT,
                "tech": "java",
                "since": "2025-01-01",
                "limit": 5,
            },
        )
    ]


@pytest.mark.asyncio
async def test_no_workspace_never_reaches_the_bridge(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import workspace_scope

    calls: list[str] = []

    async def fake_post(path: str, payload: dict, **_: object) -> dict:
        calls.append(path)
        return {}

    async def no_workspace(user_id: str, sb: object | None = None) -> str | None:
        return None

    monkeypatch.setattr(bellum_api, "_post", fake_post)
    monkeypatch.setattr(workspace_scope, "resolve_workspace_id", no_workspace)
    assert await bellum_api.account_needs_history(USER, ACCOUNT) is None
    assert calls == []
