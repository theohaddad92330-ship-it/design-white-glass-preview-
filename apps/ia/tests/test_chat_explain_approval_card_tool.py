"""Épopée #2857 (#2201.31) — Laura EXPLIQUE une carte de validation en attente.

Une LECTURE, sur le MÊME patron que #2367.11
(`test_chat_consultant_feedback_tool.py`) : le pont NestJS
(`WorkflowRunnerService.explainApprovalRequest`) fait déjà l'APPARTENANCE
(espace de la demande) — l'outil IA ne fait que relayer.

Trois propriétés à tenir :
 1. Un identifiant manquant est refusé AVANT le réseau.
 2. Sans configuration du pont, l'outil DIT qu'il n'a pas accès — jamais un
    JSON qui se lirait comme une explication.
 3. Une demande introuvable ou hors de l'espace de l'appelant (le pont rend
    `{"error": ...}`) ne fait JAMAIS fuiter la demande d'un autre espace —
    l'outil dit « introuvable ».
"""

from __future__ import annotations

import pytest

from app.services import bellum_api, chat_tools

USER = "11111111-1111-4111-8111-111111111111"
APPROVAL = "44444444-4444-4444-8444-444444444444"


@pytest.fixture(autouse=True)
def _clear_bridge_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("API_INTERNAL_URL", raising=False)
    monkeypatch.delenv("INTERNAL_API_SECRET", raising=False)


async def _run(name: str, payload: dict | None = None) -> dict:
    return await chat_tools.execute_chat_tool(name, payload or {}, user_id=USER, profile_data=None)


def test_the_tool_is_declared_and_appended_never_inserted() -> None:
    names = [tool["name"] for tool in chat_tools.CHAT_TOOLS]
    assert "explain_approval_card" in names
    assert names.index("explain_approval_card") > names.index("get_crm_presence")


@pytest.mark.asyncio
async def test_asks_for_the_approval_id_before_any_network_call(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _explode(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("aucun appel réseau ne doit partir sans identifiant")

    monkeypatch.setattr(bellum_api, "approval_explain", _explode)
    result = await _run("explain_approval_card")
    assert "error" in result
    assert "carte" in result["error"].lower()


@pytest.mark.asyncio
async def test_says_it_has_no_access_rather_than_an_invented_explanation(monkeypatch: pytest.MonkeyPatch) -> None:
    # Le pont non configuré : `is_configured()` reste `False` (aucune variable
    # d'environnement posée par `_clear_bridge_env`).
    result = await _run("explain_approval_card", {"approval_request_id": APPROVAL})
    assert "error" in result
    assert "accès" in result["error"].lower()


@pytest.mark.asyncio
async def test_an_approval_outside_the_caller_workspace_never_leaks_another_workspace_request(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def not_found(*_args: object, **_kwargs: object) -> dict[str, object]:
        # Le pont rend `{"error": ...}` — exactement ce que
        # `CopilotBridgeController.approvalExplain` rend sur une demande hors
        # de l'espace de l'appelant, ou introuvable.
        return {"error": "Approval request not found."}

    monkeypatch.setattr(bellum_api, "approval_explain", not_found)
    result = await _run("explain_approval_card", {"approval_request_id": APPROVAL})
    assert "error" in result
    assert "introuvable" in result["error"].lower()


@pytest.mark.asyncio
async def test_relays_the_already_stored_facts_as_is(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def explanation(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {
            "state": "pending",
            "summary": "Créer une tâche CRM de relance chez Acme.",
            "requiredLevel": "n2_user_approval",
            "reason": "Le contact a répondu positivement hier.",
            "requestedBy": USER,
            "assignedTo": None,
            "snoozedUntil": None,
            "expiresAt": "2026-10-01T00:00:00.000Z",
            "createdAt": "2026-09-25T00:00:00.000Z",
            "decidedBy": None,
            "decidedAt": None,
        }

    monkeypatch.setattr(bellum_api, "approval_explain", explanation)
    result = await _run("explain_approval_card", {"approval_request_id": APPROVAL})
    assert result["summary"] == "Créer une tâche CRM de relance chez Acme."
    assert result["reason"] == "Le contact a répondu positivement hier."
    assert result["requiredLevel"] == "n2_user_approval"


@pytest.mark.asyncio
async def test_makes_zero_network_calls_when_the_bridge_is_unconfigured(monkeypatch: pytest.MonkeyPatch) -> None:
    def _explode(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("aucun appel réseau ne doit partir sans configuration")

    monkeypatch.setattr("httpx.AsyncClient", _explode)
    assert (
        await bellum_api._post(
            "/internal/copilot/approvals/explain", {"userId": USER, "approvalRequestId": APPROVAL}
        )
        is None
    )
