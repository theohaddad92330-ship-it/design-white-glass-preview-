"""#2852.6-53 (lot EP8, 02/10) — cinq lectures de plus sur l'enveloppe canonique
de RÉSULTAT D'OUTIL : notes de frais à décider, REX d'un consultant, décisions
de qualification d'un compte, réorientations déclarées, créneaux d'envoi.

Le NO-GO de #2282 : `empty` (la source a répondu, zéro ligne) ne se lit jamais
`not_covered` (pont éteint) ni `permission_denied` (« pas ton droit ») ni
`provider_error` (« pas de réponse »). Chaque test REJOUE le tour de Laura.
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


# ── notes de frais à décider ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_expenses_without_the_decision_right_is_permission_denied_not_empty(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _bridge(monkeypatch, "expense_reports_pending_decision", {"allowed": False, "items": []})
    result = await _run("list_expense_reports_awaiting_decision")
    assert result["reports"] == []
    assert result["status"] == "permission_denied"
    assert result["result_type"] == "expense_report_list"


@pytest.mark.asyncio
async def test_expenses_with_nothing_waiting_is_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    _bridge(monkeypatch, "expense_reports_pending_decision", {"allowed": True, "items": []})
    result = await _run("list_expense_reports_awaiting_decision")
    assert result["reports"] == []
    assert result["status"] == "empty"
    assert result["total_found"] == 0


@pytest.mark.asyncio
async def test_expenses_waiting_are_listed_with_their_count(monkeypatch: pytest.MonkeyPatch) -> None:
    items = [{"id": "e1", "reference": "NDF-1", "bearerName": "A", "accountName": "X", "periodMonth": "2026-09"}]
    _bridge(monkeypatch, "expense_reports_pending_decision", {"allowed": True, "items": items})
    result = await _run("list_expense_reports_awaiting_decision")
    assert [r["expense_report_id"] for r in result["reports"]] == ["e1"]
    assert result["status"] == "success"
    assert result["returned_count"] == 1


@pytest.mark.asyncio
async def test_expenses_bridge_states_are_named(monkeypatch: pytest.MonkeyPatch) -> None:
    _bridge(monkeypatch, "expense_reports_pending_decision", None, configured=False)
    off = await _run("list_expense_reports_awaiting_decision")
    assert off["status"] == "not_covered" and "error" in off
    _bridge(monkeypatch, "expense_reports_pending_decision", None)
    silent = await _run("list_expense_reports_awaiting_decision")
    assert silent["status"] == "provider_error" and "error" in silent


# ── REX d'un consultant ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_feedback_needs_a_consultant_id() -> None:
    result = await _run("get_consultant_push_feedback", {})
    assert "error" in result
    assert result["status"] == "invalid_input"
    assert result["result_type"] == "consultant_feedback_list"


@pytest.mark.asyncio
async def test_feedback_bridge_states_are_named(monkeypatch: pytest.MonkeyPatch) -> None:
    _bridge(monkeypatch, "consultant_feedback", None, configured=False)
    off = await _run("get_consultant_push_feedback", {"consultant_id": "c1"})
    assert off["status"] == "not_covered"
    _bridge(monkeypatch, "consultant_feedback", None)
    silent = await _run("get_consultant_push_feedback", {"consultant_id": "c1"})
    assert silent["status"] == "provider_error"


@pytest.mark.asyncio
async def test_feedback_none_recorded_is_empty_and_recorded_is_success(monkeypatch: pytest.MonkeyPatch) -> None:
    _bridge(monkeypatch, "consultant_feedback", {"feedback": []})
    none = await _run("get_consultant_push_feedback", {"consultant_id": "c1"})
    assert none["feedback"] == [] and none["status"] == "empty"
    _bridge(monkeypatch, "consultant_feedback", {"feedback": [{"opportunity_id": "o1", "outcome": "won"}]})
    some = await _run("get_consultant_push_feedback", {"consultant_id": "c1"})
    assert some["status"] == "success" and some["returned_count"] == 1


# ── décisions de qualification d'un compte ──────────────────────────────────


@pytest.mark.asyncio
async def test_lead_decisions_need_an_account_id() -> None:
    result = await _run("get_qualification_lead_decisions", {})
    assert result["status"] == "invalid_input"
    assert result["result_type"] == "qualification_lead_decisions"


@pytest.mark.asyncio
async def test_lead_decisions_relay_the_payload_and_name_the_states(monkeypatch: pytest.MonkeyPatch) -> None:
    _bridge(monkeypatch, "qualification_lead_decisions", {"decisions": [{"lead": "a"}]})
    ok = await _run("get_qualification_lead_decisions", {"account_id": "a1"})
    assert ok["decisions"] == [{"lead": "a"}] and ok["status"] == "success"
    _bridge(monkeypatch, "qualification_lead_decisions", None)
    silent = await _run("get_qualification_lead_decisions", {"account_id": "a1"})
    assert silent["status"] == "provider_error"
    _bridge(monkeypatch, "qualification_lead_decisions", None, configured=False)
    off = await _run("get_qualification_lead_decisions", {"account_id": "a1"})
    assert off["status"] == "not_covered"


# ── réorientations déclarées ────────────────────────────────────────────────


def _orientations(monkeypatch: pytest.MonkeyPatch, rows: Any = None, *, boom: bool = False) -> None:
    from app.services import ownership, supabase_client

    monkeypatch.setattr(supabase_client, "get_supabase", lambda: object())

    async def fake(_sb: Any, _user: str) -> Any:
        if boom:
            raise RuntimeError("down")
        return rows

    monkeypatch.setattr(ownership, "fetch_orientation_actions", fake)


@pytest.mark.asyncio
async def test_orientations_states_are_named(monkeypatch: pytest.MonkeyPatch) -> None:
    _orientations(monkeypatch, boom=True)
    down = await _run("get_orientations_to_follow")
    assert down["status"] == "provider_error" and "error" in down
    _orientations(monkeypatch, rows=[])
    empty = await _run("get_orientations_to_follow")
    assert empty["orientations"] == [] and empty["status"] == "empty"
    _orientations(monkeypatch, rows=[{"id": "x", "contact_id": "c", "account_id": "a", "result": " Voir Marc "}])
    ok = await _run("get_orientations_to_follow")
    assert ok["status"] == "success" and ok["returned_count"] == 1
    assert ok["orientations"][0]["declared_result"] == "Voir Marc"


# ── créneaux d'envoi ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_send_timing_states_are_named(monkeypatch: pytest.MonkeyPatch) -> None:
    _bridge(monkeypatch, "workspace_timing", None)
    silent = await _run("get_send_timing")
    assert silent["status"] == "provider_error" and "error" in silent
    _bridge(monkeypatch, "workspace_timing", {"error": "x"})
    err = await _run("get_send_timing")
    assert err["status"] == "provider_error"
    _bridge(monkeypatch, "workspace_timing", {"channels": []})
    ok = await _run("get_send_timing")
    assert ok["status"] == "success" and ok["result_type"] == "send_timing"
