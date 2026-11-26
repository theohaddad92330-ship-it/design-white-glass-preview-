"""#2987.56 (épopée #2987, LOT écrivain 28/09) — l'approbation de dépense
pendant une conversation (vocale ou texte) avec Laura.

Deux outils, jamais un seul :

1. `list_expense_reports_awaiting_decision` — LECTURE, la file des notes
   SOUMISES que l'appelant peut décider, sans le montant.
2. `propose_expense_report_decision` — ÉCRITURE (gate `_proposal()`) : relit
   la note AVANT de proposer (jamais une note qui n'est plus dans la file), un
   refus sans motif est SIGNALÉ, jamais deviné.

« Confirmation vocale seule insuffisante pour une dépense importante » (#2434)
est tenue PAR CONSTRUCTION : cet outil ne rend QU'une proposition, jamais un
effet — l'exécution reste le clic de l'utilisateur sur la MÊME route que
l'écran (`POST /expenses/reports/:id/validate|reject`).
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, WRITE_TOOL_NAMES, execute_chat_tool

USER = "11111111-1111-4111-8111-111111111111"


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)


async def _run(name: str, tool_input: dict | None = None) -> dict:
    return await execute_chat_tool(name, tool_input or {}, user_id=USER, profile_data=None)


def test_both_tools_are_registered_before_push_profile() -> None:
    # `push_profile` doit rester le DERNIER outil du catalogue
    # (`test_push_profile_tool.py`) — les deux outils neufs le précèdent.
    names = [tool["name"] for tool in CHAT_TOOLS]
    assert names.index("list_expense_reports_awaiting_decision") < names.index("push_profile")
    assert names.index("propose_expense_report_decision") < names.index("push_profile")


def test_only_the_decision_is_a_write_tool() -> None:
    assert "propose_expense_report_decision" in WRITE_TOOL_NAMES
    assert "list_expense_reports_awaiting_decision" not in WRITE_TOOL_NAMES


@pytest.mark.asyncio
async def test_list_never_leaks_an_amount(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _pending(user_id: str, *, report_id: str | None = None) -> dict:
        assert user_id == USER
        assert report_id is None
        return {
            "allowed": True,
            "items": [
                {
                    "id": "r-1",
                    "reference": "NF-2026-014",
                    "bearerName": "Julie Martin",
                    "accountName": "Orange",
                    "periodMonth": "2026-09",
                }
            ],
        }

    monkeypatch.setattr(bellum_api, "expense_reports_pending_decision", _pending)
    result = await _run("list_expense_reports_awaiting_decision")
    # #2852.6-53 : enveloppe additive — seul `reports` est comparé exactement.
    assert result["reports"] == [
        {
            "expense_report_id": "r-1",
            "reference": "NF-2026-014",
            "bearer_name": "Julie Martin",
            "account_name": "Orange",
            "period_month": "2026-09",
        }
    ]
    assert "amount" not in str(result).lower() and "montant" not in str(result).lower()


@pytest.mark.asyncio
async def test_list_names_a_forbidden_decision_right_rather_than_guessing_an_empty_queue(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _pending(*_a: object, **_k: object) -> dict:
        return {"allowed": False, "items": []}

    monkeypatch.setattr(bellum_api, "expense_reports_pending_decision", _pending)
    result = await _run("list_expense_reports_awaiting_decision")
    assert result["reports"] == []
    assert "droit" in result["note"].lower()


@pytest.mark.asyncio
async def test_list_a_dead_bridge_says_so_rather_than_an_empty_queue(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _pending(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "expense_reports_pending_decision", _pending)
    result = await _run("list_expense_reports_awaiting_decision")
    assert "error" in result


def test_decide_requires_an_expense_report_id() -> None:
    import asyncio

    result = asyncio.run(_run("propose_expense_report_decision", {"decision": "validate"}))
    assert "error" in result
    assert "identifiant" in result["error"].lower()


def test_decide_rejects_an_unknown_decision() -> None:
    import asyncio

    result = asyncio.run(_run("propose_expense_report_decision", {"expense_report_id": "r-1", "decision": "approve"}))
    assert "error" in result


def test_decide_a_rejection_without_a_reason_is_signalled_never_guessed() -> None:
    import asyncio

    result = asyncio.run(_run("propose_expense_report_decision", {"expense_report_id": "r-1", "decision": "reject"}))
    assert "error" in result
    assert "motif" in result["error"].lower()


@pytest.mark.asyncio
async def test_decide_a_report_no_longer_in_the_queue_is_named_never_proposed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _pending(user_id: str, *, report_id: str | None = None) -> dict:
        assert report_id == "r-absent"
        return {"allowed": True, "items": []}

    monkeypatch.setattr(bellum_api, "expense_reports_pending_decision", _pending)
    result = await _run("propose_expense_report_decision", {"expense_report_id": "r-absent", "decision": "validate"})
    assert "error" in result
    assert "proposal" not in result


@pytest.mark.asyncio
async def test_decide_a_valid_report_becomes_a_proposal_never_a_write(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _pending(user_id: str, *, report_id: str | None = None) -> dict:
        assert report_id == "r-1"
        return {
            "allowed": True,
            "items": [
                {
                    "id": "r-1",
                    "reference": "NF-2026-014",
                    "bearerName": "Julie Martin",
                    "accountName": "Orange",
                    "periodMonth": "2026-09",
                }
            ],
        }

    monkeypatch.setattr(bellum_api, "expense_reports_pending_decision", _pending)
    result = await _run("propose_expense_report_decision", {"expense_report_id": "r-1", "decision": "validate"})
    assert result["status"] == "pending_confirmation"
    assert result["proposal"]["action"] == "decide_expense_report"
    assert result["proposal"]["expense_report_id"] == "r-1"
    assert result["proposal"]["decision"] == "validate"
    assert result["proposal"]["bearer_name"] == "Julie Martin"
    assert result["proposal"]["reason"] is None
    assert result["proposal"]["cost_credits"] == 0


@pytest.mark.asyncio
async def test_decide_a_rejection_with_a_reason_carries_it_on_the_proposal(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _pending(*_a: object, **_k: object) -> dict:
        return {
            "allowed": True,
            "items": [
                {
                    "id": "r-1",
                    "reference": "NF-2026-014",
                    "bearerName": "Julie Martin",
                    "accountName": None,
                    "periodMonth": "2026-09",
                }
            ],
        }

    monkeypatch.setattr(bellum_api, "expense_reports_pending_decision", _pending)
    result = await _run(
        "propose_expense_report_decision",
        {"expense_report_id": "r-1", "decision": "reject", "reason": "Justificatif illisible"},
    )
    assert result["proposal"]["decision"] == "reject"
    assert result["proposal"]["reason"] == "Justificatif illisible"
