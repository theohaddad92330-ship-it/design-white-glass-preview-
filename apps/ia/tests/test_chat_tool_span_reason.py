"""#3391.5 — diagnostic interne : POURQUOI un outil a été appelé.

Le span `tool:<nom>` ne portait que le nom. Il porte désormais sa raison
structurée : le mode (lecture / écriture), les CLÉS de l'entrée que le modèle a
posées, et si l'outil est silencieux. Jamais une VALEUR : une entrée d'outil
recopie la demande de la personne (doctrine #2442.3, journal sans contenu).
"""

from __future__ import annotations

import asyncio
from contextlib import contextmanager
from unittest.mock import AsyncMock

from app.services import chat_orchestrator
from app.services.chat_orchestrator import _ToolCall, tool_call_span_metadata


def test_metadata_names_keys_never_values() -> None:
    meta = tool_call_span_metadata("find_accounts", {"query": "ESN banque Lyon", "limit": 5})
    assert meta["tool"] == "find_accounts"
    assert meta["input_keys"] == ["limit", "query"]
    assert "ESN banque Lyon" not in repr(meta)
    assert meta["mode"] in ("read", "write")


def test_write_tool_is_marked_write_and_silent_tool_silent() -> None:
    write = next(iter(chat_orchestrator.WRITE_TOOL_NAMES))
    assert tool_call_span_metadata(write, {})["mode"] == "write"
    silent = chat_orchestrator._SILENT_TOOL_NAMES[0]
    assert tool_call_span_metadata(silent, {})["silent"] is True
    assert tool_call_span_metadata("find_accounts", {})["silent"] is False


def test_non_dict_input_gives_empty_keys() -> None:
    assert tool_call_span_metadata("find_accounts", None)["input_keys"] == []


def test_execute_one_tool_opens_span_with_reason(monkeypatch) -> None:
    seen: list[tuple[str, dict | None]] = []

    @contextmanager
    def fake_span(name, *, metadata=None):
        seen.append((name, metadata))
        yield

    monkeypatch.setattr(chat_orchestrator.langfuse_client, "span", fake_span)
    monkeypatch.setattr(
        chat_orchestrator, "execute_chat_tool_resilient", AsyncMock(return_value={"ok": True})
    )

    async def run() -> None:
        await chat_orchestrator._execute_one_tool(
            _ToolCall(id="t1", name="find_accounts", input={"query": "secret"}),
            user_id="u",
            profile_data=None,
            crm_connected=False,
            crm_provider="",
            semaphore=asyncio.Semaphore(1),
            emit=AsyncMock(),
        )

    asyncio.run(run())
    assert seen and seen[0][0] == "tool:find_accounts"
    assert seen[0][1]["input_keys"] == ["query"]
    assert "secret" not in repr(seen[0][1])
