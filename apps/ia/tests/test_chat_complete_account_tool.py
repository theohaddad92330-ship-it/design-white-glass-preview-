"""#4055.4 / .6 / .7 — les deux outils de lecture : « complète ce compte » et les secteurs du portefeuille."""

from __future__ import annotations

from typing import Any

import pytest

from app.services import account_completion_tools as tools
from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool

USER = "user-1"
ACCOUNT = "11111111-1111-4111-8111-111111111111"


@pytest.fixture(autouse=True)
def _bridge(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def owned(account_id: str, user_id: str, columns: str = "*") -> dict[str, Any] | None:
        return {"id": account_id, "company_name": "Thales"} if account_id == ACCOUNT else None

    monkeypatch.setattr(tools, "_owned_account", owned)


def _wire(monkeypatch: pytest.MonkeyPatch, *, signals: Any, contacts: Any, chart: Any, needs: Any) -> None:
    async def _signals(user_id: str, account_id: str | None = None) -> Any:
        return signals

    async def _contacts(user_id: str, account_id: str, **kwargs: Any) -> Any:
        return contacts

    async def _chart(user_id: str, account_id: str) -> Any:
        return chart

    async def _needs(user_id: str, **kwargs: Any) -> Any:
        return needs

    monkeypatch.setattr(bellum_api, "account_signals", _signals)
    monkeypatch.setattr(bellum_api, "account_contacts", _contacts)
    monkeypatch.setattr(bellum_api, "account_org_chart", _chart)
    monkeypatch.setattr(bellum_api, "find_needs", _needs)


def test_both_tools_are_in_the_catalog_before_push_profile() -> None:
    names = [str(t["name"]) for t in CHAT_TOOLS]
    assert names.index("complete_account") < names.index("push_profile") == len(names) - 1
    assert "get_portfolio_sectors" in names


async def test_what_is_missing_is_listed_and_every_collection_is_only_proposed(monkeypatch: pytest.MonkeyPatch) -> None:
    _wire(
        monkeypatch,
        signals={"accounts": []},
        contacts={"contacts": [{"full_name": "Hélène Martin", "group": "relay"}], "truncated": False},
        chart={"status": "ok", "people": [{"full_name": "Hélène Martin"}, {"full_name": "Marc Durand", "title": "DSI"}]},
        needs={"data": [{"account_name": "THALES", "title": "Dev Go"}]},
    )
    out = await execute_chat_tool("complete_account", {"account_id": ACCOUNT}, user_id=USER, profile_data=None)
    assert out["missing"] == ["signals", "decision_makers"]
    assert out["present"] == [{"kind": "needs", "count": 1}, {"kind": "org_chart", "count": 2}]
    assert all(c["launched"] is False for c in out["proposed_collections"])
    people = out["detected_outside_base"]["people"]
    assert [p["full_name"] for p in people] == ["Marc Durand"] and people[0]["status"] == "outside_base"


async def test_a_silent_bridge_is_not_a_missing_item(monkeypatch: pytest.MonkeyPatch) -> None:
    _wire(monkeypatch, signals=None, contacts=None, chart=None, needs=None)
    out = await execute_chat_tool("complete_account", {"account_id": ACCOUNT}, user_id=USER, profile_data=None)
    assert out["missing"] == [] and out["complete"] is False
    assert out["not_read"] == ["signals", "needs", "decision_makers", "org_chart"]
    assert "detected_outside_base" not in out


async def test_zero_decision_makers_in_a_truncated_list_proves_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    _wire(
        monkeypatch,
        signals={"accounts": [{"signals": [1]}]},
        contacts={"contacts": [{"full_name": "A", "group": "relay"}], "truncated": True},
        chart={"status": "no_graph"},
        needs={"data": []},
    )
    out = await execute_chat_tool("complete_account", {"account_id": ACCOUNT}, user_id=USER, profile_data=None)
    assert "decision_makers" in out["not_read"] and "decision_makers" not in out["missing"]
    assert out["missing"] == ["needs", "org_chart"]


async def test_an_unknown_account_or_a_missing_id_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    _wire(monkeypatch, signals={}, contacts={}, chart={}, needs={})
    foreign = await execute_chat_tool("complete_account", {"account_id": "other"}, user_id=USER, profile_data=None)
    assert foreign["error"] and "missing" not in foreign
    blank = await execute_chat_tool("complete_account", {}, user_id=USER, profile_data=None)
    assert blank["error"]


async def test_sectors_count_every_page_and_say_when_the_portfolio_is_larger(monkeypatch: pytest.MonkeyPatch) -> None:
    async def page(user_id: str, **kwargs: Any) -> dict[str, Any]:
        offset = kwargs.get("offset") or 0
        rows = [{"company_name": f"C{offset + i}", "sector": "Banque" if i % 2 else "Énergie"} for i in range(25)]
        return {"accounts": rows, "total": 60}

    monkeypatch.setattr(bellum_api, "workspace_accounts", page)
    out = await execute_chat_tool("get_portfolio_sectors", {}, user_id=USER, profile_data=None)
    assert out["accounts_read"] == 75 and out["complete"] is True
    assert out["portfolio_total"] == 60
    assert {s["sector"] for s in out["sectors"]} == {"Banque", "Énergie"}


async def test_sectors_of_a_silent_bridge_is_an_error_not_an_empty_list(monkeypatch: pytest.MonkeyPatch) -> None:
    async def silent(user_id: str, **kwargs: Any) -> None:
        return None

    monkeypatch.setattr(bellum_api, "workspace_accounts", silent)
    out = await execute_chat_tool("get_portfolio_sectors", {}, user_id=USER, profile_data=None)
    assert out["error"] and "sectors" not in out
