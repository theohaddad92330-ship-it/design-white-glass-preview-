"""#2852.6-53 (lot X14, 02/10) — la famille « pilotage / back-office » sur
l'enveloppe canonique de RÉSULTAT D'OUTIL, plus la pagination #2852.25/.26 sur
un appelant réel (`get_overdue_payments` + `cursor`).

Chaque test REJOUE le tour de Laura (`execute_chat_tool`) : `empty` (la source a
répondu, zéro ligne) ≠ `not_covered` (pont éteint) ≠ `permission_denied` (pas
ton droit) ≠ `provider_error` (pas de réponse).
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services import bellum_api, chat_tools

USER = "11111111-1111-4111-8111-111111111111"


async def _run(name: str, payload: dict | None = None) -> dict:
    return await chat_tools.execute_chat_tool(name, payload or {}, user_id=USER, profile_data=None)


def _bridge(monkeypatch: pytest.MonkeyPatch, fn: str, value: Any, *, configured: bool = True) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: configured)

    async def fake(*_args: Any, **_kwargs: Any) -> Any:
        return value

    monkeypatch.setattr(bellum_api, fn, fake)


FINANCE = [
    ("get_revenue", "revenue_breakdown", "revenue_breakdown"),
    ("get_confirmed_revenue", "confirmed_revenue", "confirmed_revenue"),
    ("get_capacity", "capacity", "capacity"),
    ("get_forecast_horizons", "forecast_horizons", "forecast_horizons"),
]
READS = FINANCE + [
    ("get_pipeline", "pipeline_summary", "pipeline_summary"),
    ("get_portfolio_priorities", "portfolio_priorities", "portfolio_priorities"),
    ("get_channel_performance", "channel_performance", "channel_performance"),
    ("list_accounts_to_act", "accounts_to_act", "accounts_to_act"),
    ("list_actions_awaiting_outcome", "actions_awaiting_outcome", "actions_awaiting_outcome"),
    ("get_overdue_payments", "overdue_payments", "overdue_payments"),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("tool,bridge_fn,result_type", READS)
async def test_bridge_off_is_not_covered_never_an_answer(
    monkeypatch: pytest.MonkeyPatch, tool: str, bridge_fn: str, result_type: str
) -> None:
    _bridge(monkeypatch, bridge_fn, None, configured=False)
    result = await _run(tool)
    assert result["status"] == "not_covered"
    assert result["result_type"] == result_type
    assert "error" in result


@pytest.mark.asyncio
@pytest.mark.parametrize("tool,bridge_fn,result_type", READS)
async def test_bridge_silent_is_provider_error(
    monkeypatch: pytest.MonkeyPatch, tool: str, bridge_fn: str, result_type: str
) -> None:
    _bridge(monkeypatch, bridge_fn, None, configured=True)
    result = await _run(tool)
    assert result["status"] == "provider_error"
    assert result["result_type"] == result_type


@pytest.mark.asyncio
@pytest.mark.parametrize("tool,bridge_fn,result_type", FINANCE)
async def test_finance_forbidden_is_permission_denied_not_zero_euro(
    monkeypatch: pytest.MonkeyPatch, tool: str, bridge_fn: str, result_type: str
) -> None:
    _bridge(monkeypatch, bridge_fn, {"error": "finance_forbidden"})
    result = await _run(tool)
    assert result["status"] == "permission_denied"
    assert result["error_code"] == "finance_forbidden"
    assert "droit" in result["error"]


@pytest.mark.asyncio
async def test_pipeline_success_relays_bridge_content_and_names_status(monkeypatch: pytest.MonkeyPatch) -> None:
    _bridge(monkeypatch, "pipeline_summary", {"columns": [{"stage": "qualif", "amount_cents": None}]})
    result = await _run("get_pipeline")
    assert result["status"] == "success"
    assert result["columns"][0]["amount_cents"] is None  # jamais un 0 inventé


@pytest.mark.asyncio
async def test_accounts_to_act_empty_list_is_empty_not_error(monkeypatch: pytest.MonkeyPatch) -> None:
    _bridge(monkeypatch, "accounts_to_act", {"accounts": [], "truncated": False})
    result = await _run("list_accounts_to_act")
    assert result["status"] == "empty"
    assert "error" not in result


@pytest.mark.asyncio
async def test_similar_cases_needs_an_account_id(monkeypatch: pytest.MonkeyPatch) -> None:
    _bridge(monkeypatch, "similar_cases", {})
    result = await _run("find_similar_cases")
    assert result["status"] == "invalid_input"


@pytest.mark.asyncio
async def test_focus_review_unknown_account_is_empty_not_provider_error(monkeypatch: pytest.MonkeyPatch) -> None:
    _bridge(monkeypatch, "focus_review", {"error": "account_not_found"})
    result = await _run("get_focus_review", {"account_id": "acc-1"})
    assert result["status"] == "empty"
    assert "introuvable" in result["error"]


# ── pagination #2852.25/.26 : `cursor` → `next_cursor`, appelant réel ─────────


def _overdue(n: int) -> dict:
    return {"items": [{"invoice": f"F-{i}", "days_late": i} for i in range(n)]}


@pytest.mark.asyncio
async def test_overdue_first_page_names_the_next_cursor(monkeypatch: pytest.MonkeyPatch) -> None:
    _bridge(monkeypatch, "overdue_payments", _overdue(45))
    page = await _run("get_overdue_payments")
    assert len(page["items"]) == 20
    assert page["truncated"] is True
    assert page["status"] == "partial"
    assert page["total_found"] == 45
    assert page["next_cursor"] == "20"


@pytest.mark.asyncio
async def test_overdue_walks_every_page_exactly_once(monkeypatch: pytest.MonkeyPatch) -> None:
    _bridge(monkeypatch, "overdue_payments", _overdue(45))
    seen: list[str] = []
    cursor: str | None = None
    for _ in range(5):
        page = await _run("get_overdue_payments", {"cursor": cursor} if cursor else {})
        seen += [row["invoice"] for row in page["items"]]
        cursor = page.get("next_cursor")
        if cursor is None:
            break
    assert seen == [f"F-{i}" for i in range(45)]
    assert page["truncated"] is False
    assert "next_cursor" not in page


@pytest.mark.asyncio
async def test_overdue_bad_cursor_is_invalid_input_never_page_one(monkeypatch: pytest.MonkeyPatch) -> None:
    _bridge(monkeypatch, "overdue_payments", _overdue(45))
    for bad in ("abc", "-3", "999"):
        result = await _run("get_overdue_payments", {"cursor": bad})
        assert result["status"] == "invalid_input", bad


@pytest.mark.asyncio
async def test_overdue_cursor_is_declared_in_the_tool_schema() -> None:
    tool = next(t for t in chat_tools.CHAT_TOOLS if t["name"] == "get_overdue_payments")
    assert "cursor" in tool["input_schema"]["properties"]


# ── #2852 (recette Y9, 02/10) — la BONNE PÉRIODE ─────────────────────────────
# « Aucun impayé trouvé… septembre 2026 » : sans mois, la lecture ne portait que
# sur le mois précédent, et « CA du mois » lisait lui aussi le mois précédent.


@pytest.mark.asyncio
async def test_overdue_without_month_asks_the_bridge_for_the_whole_stock_and_keeps_period_month(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: dict[str, Any] = {}

    async def fake(_user_id: str, *, month: str | None = None) -> dict[str, Any]:
        seen["month"] = month
        return {
            "month": None,
            "months": ["2026-08", "2026-09"],
            "items": [{"periodMonth": "2026-08", "missionLabel": "Mission A", "dueOn": "2026-09-30"}],
        }

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "overdue_payments", fake)
    result = await _run("get_overdue_payments")
    assert seen["month"] is None  # jamais un mois inventé : le pont lit le stock
    assert result["status"] == "success"
    assert result["items"][0]["periodMonth"] == "2026-08"
    assert result["months"] == ["2026-08", "2026-09"]


@pytest.mark.asyncio
async def test_overdue_with_a_named_month_forwards_exactly_that_month(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, Any] = {}

    async def fake(_user_id: str, *, month: str | None = None) -> dict[str, Any]:
        seen["month"] = month
        return {"month": month, "months": [month], "items": []}

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "overdue_payments", fake)
    result = await _run("get_overdue_payments", {"month": "2026-07"})
    assert seen["month"] == "2026-07"
    assert result["status"] == "empty"


def test_month_parameters_say_which_month_a_question_means() -> None:
    by_name = {tool["name"]: tool for tool in chat_tools.CHAT_TOOLS}
    for name in ("get_revenue", "get_confirmed_revenue"):
        description = by_name[name]["input_schema"]["properties"]["month"]["description"]
        assert "EN COURS" in description  # « ce mois-ci » ≠ le mois précédent
        assert "précédent" in description
    overdue = by_name["get_overdue_payments"]["input_schema"]["properties"]["month"]["description"]
    assert "TOUS les mois" in overdue and "periodMonth" in overdue
