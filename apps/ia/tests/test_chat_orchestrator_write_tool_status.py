"""#2879/#2983 (28/09/2026, lot V36) — `_execute_one_tool` doit :

1. dire à `execute_chat_tool_resilient` si l'outil appelé écrit ou dépense
   (`is_write_tool`), pour qu'il ne retente jamais un tel outil ;
2. traduire un `outcome: "unknown"` (timeout sur un outil d'écriture, doctrine
   « un timeout n'est pas un échec ») en `entry["status"] == "unknown"` —
   jamais `"error"`/`"failed"`.

Testé directement sur `_execute_one_tool`, en monkeypatchant
`execute_chat_tool_resilient` — pas la boucle de tour complète (déjà couverte
par `test_chat_tool_round_concurrency.py`)."""

from __future__ import annotations

import asyncio

from app.services import chat_orchestrator

USER = "11111111-1111-4111-8111-111111111111"


async def _noop_emit(_event: dict) -> None:
    return None


def test_a_write_tool_is_flagged_as_is_write_tool_to_the_resilient_executor(monkeypatch) -> None:
    seen: dict = {}

    async def fake_resilient(name, tool_input, *, is_write_tool, **kw):
        seen["is_write_tool"] = is_write_tool
        return {"proposal": {"ok": True}}

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool_resilient", fake_resilient)

    # `propose_settings_update` est dans `WRITE_TOOL_NAMES` (chat_tools.py).
    call = chat_orchestrator._ToolCall(id="t1", name="propose_settings_update", input={})
    asyncio.run(
        chat_orchestrator._execute_one_tool(
            call,
            user_id=USER,
            profile_data=None,
            crm_connected=False,
            crm_provider="none",
            semaphore=asyncio.Semaphore(1),
            emit=_noop_emit,
        )
    )
    assert seen["is_write_tool"] is True


def test_a_read_tool_is_flagged_as_not_a_write_tool(monkeypatch) -> None:
    seen: dict = {}

    async def fake_resilient(name, tool_input, *, is_write_tool, **kw):
        seen["is_write_tool"] = is_write_tool
        return {"ok": True}

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool_resilient", fake_resilient)

    call = chat_orchestrator._ToolCall(id="t2", name="get_account_briefing", input={})
    asyncio.run(
        chat_orchestrator._execute_one_tool(
            call,
            user_id=USER,
            profile_data=None,
            crm_connected=False,
            crm_provider="none",
            semaphore=asyncio.Semaphore(1),
            emit=_noop_emit,
        )
    )
    assert seen["is_write_tool"] is False


def test_an_unknown_outcome_becomes_the_unknown_status_never_error(monkeypatch) -> None:
    async def fake_resilient(name, tool_input, *, is_write_tool, **kw):
        return {
            "error": "Le temps a manqué pour confirmer si cette action a bien été appliquée.",
            "error_code": "timeout",
            "retryable": False,
            "outcome": "unknown",
        }

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool_resilient", fake_resilient)

    call = chat_orchestrator._ToolCall(id="t3", name="propose_settings_update", input={})
    entry, output, is_error = asyncio.run(
        chat_orchestrator._execute_one_tool(
            call,
            user_id=USER,
            profile_data=None,
            crm_connected=False,
            crm_provider="none",
            semaphore=asyncio.Semaphore(1),
            emit=_noop_emit,
        )
    )
    assert entry["status"] == "unknown"
    assert is_error is True  # jamais "done", mais jamais peint comme un échec ordinaire
    assert output["outcome"] == "unknown"


def test_a_plain_error_still_maps_to_the_error_status(monkeypatch) -> None:
    async def fake_resilient(name, tool_input, *, is_write_tool, **kw):
        return {"error": "Vous n'avez pas accès à cette ressource.", "error_code": "permission", "retryable": False}

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool_resilient", fake_resilient)

    call = chat_orchestrator._ToolCall(id="t4", name="get_account_briefing", input={})
    entry, _output, is_error = asyncio.run(
        chat_orchestrator._execute_one_tool(
            call,
            user_id=USER,
            profile_data=None,
            crm_connected=False,
            crm_provider="none",
            semaphore=asyncio.Semaphore(1),
            emit=_noop_emit,
        )
    )
    assert entry["status"] == "error"
    assert is_error is True
