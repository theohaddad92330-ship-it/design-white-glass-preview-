"""#4611.10 / .3 — le TOUR entier, sur le vrai chemin de `run_chat_with_tools` (même harnais que #3939).

Le refus qui tient tous les autres : « où en est la carte ? » ne part PAS sans résultat d'outil. Quand la lecture
échoue, le modèle n'est même pas rappelé pour raconter : la réponse est « je n'ai pas pu lire ». Quand elle
réussit, la carte de l'outil part avec ses chiffres — celle que le modèle aurait écrite lui-même est remplacée.
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services import chat_orchestrator
from app.services.chat_requested_mode import set_turn_thread
from app.services.work_progress_tool import GET_WORK_PROGRESS_TOOL_NAME as TOOL

ASK = "où en est la carte ?"


class _Throttle:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_a):
        return False


class _Stream:
    def __init__(self, response):
        self._response = response

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc):
        return False

    async def __aiter__(self):
        for block in self._response.content:
            if block.type == "text":
                yield SimpleNamespace(type="text", text=block.text)

    async def get_final_message(self):
        return self._response


def _install(monkeypatch, responses, tool_output):
    calls: list[dict] = []

    class _Messages:
        def stream(self, **kwargs):
            calls.append({**kwargs, "messages": list(kwargs["messages"])})
            return _Stream(responses.pop(0))

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _p: _Throttle())
    monkeypatch.setattr(
        chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: SimpleNamespace(messages=_Messages())
    )
    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", AsyncMock(return_value=tool_output))
    set_turn_thread(ASK, [])
    return calls


def _tool_use():
    return SimpleNamespace(
        stop_reason="tool_use",
        content=[SimpleNamespace(type="tool_use", name=TOOL, input={}, id="t1")],
    )


async def _turn(message: str = ASK):
    return await chat_orchestrator.run_chat_with_tools(
        "sys", message, user_id="u1", profile_data=None, user_message=message
    )


_PROGRESS_OUTPUT = {
    "status": "progress",
    "read_at": "2026-10-28T10:00:00.000Z",
    "window_days": 7,
    "families": [
        {
            "family": "analysis",
            "label": "Analyses",
            "counters": {"launched": 15, "done": 10, "failed": None, "running": 3},
            "unmeasured": {"failed": "la lecture a échoué"},
            "since": "2026-10-26T09:00:00.000Z",
            "last_activity_at": None,
            "failures": [],
        }
    ],
}


def test_the_progress_question_forces_the_tool_at_round_zero_only() -> None:
    tools = [{"name": TOOL}]
    f = chat_orchestrator._forced_work_progress_kwargs
    assert f(0, ASK, tools) == {"force_tool": TOOL}
    assert f(1, ASK, tools) == {}
    assert f(0, "lance l'analyse de Thales", tools) == {}
    assert f(0, ASK, []) == {}


@pytest.mark.asyncio
async def test_a_failed_read_ends_the_turn_with_i_could_not_read_and_the_model_never_narrates(monkeypatch) -> None:
    calls = _install(
        monkeypatch,
        [
            _tool_use(),
            SimpleNamespace(
                stop_reason="end_turn", content=[SimpleNamespace(type="text", text="Dix contacts sur 1212.")]
            ),
        ],
        {"error": "Je n'ai pas pu lire l'avancement du travail lancé depuis ici : je ne te raconte rien de mémoire."},
    )
    reply, actions = await _turn()
    assert calls[0]["tool_choice"] == {"type": "tool", "name": TOOL}
    # UN seul appel modèle : le second, celui qui aurait raconté, n'a jamais lieu.
    assert len(calls) == 1
    assert "pas pu lire" in reply
    assert "1212" not in reply and not any(ch.isdigit() for ch in reply)
    assert [a["tool"] for a in actions] == [TOOL]


@pytest.mark.asyncio
async def test_a_timed_out_read_says_unknown_and_does_not_tell_to_retry(monkeypatch) -> None:
    calls = _install(
        monkeypatch,
        [_tool_use()],
        {"error": "délai", "outcome": "unknown", "retryable": False},
    )
    reply, _actions = await _turn()
    assert len(calls) == 1
    assert "ne sais pas" in reply
    assert "relance" not in reply.lower()


@pytest.mark.asyncio
async def test_without_the_tool_exposed_the_turn_is_refused_before_any_model_call(monkeypatch) -> None:
    calls = _install(monkeypatch, [], {})
    real_tools_for = chat_orchestrator.tools_for
    monkeypatch.setattr(
        chat_orchestrator,
        "tools_for",
        lambda families: [tool for tool in real_tools_for(families) if tool["name"] != TOOL],
    )
    reply, actions = await _turn()
    assert calls == []
    assert "pas pu lire" in reply
    assert actions == []


@pytest.mark.asyncio
async def test_a_successful_read_sends_the_tool_card_with_its_figures(monkeypatch) -> None:
    own_card = (
        "```bellum-block\n"
        + json.dumps({"type": "comparison", "columns": ["a", "b"], "rows": [{"label": "x", "cells": ["99", "98"]}]})
        + "\n```"
    )
    calls = _install(
        monkeypatch,
        [
            _tool_use(),
            SimpleNamespace(
                stop_reason="end_turn",
                content=[SimpleNamespace(type="text", text=f"Voici où ça en est.\n\n{own_card}")],
            ),
        ],
        _PROGRESS_OUTPUT,
    )
    reply, actions = await _turn()
    assert len(calls) == 2
    assert '"cells": ["15", "10", null, "3"]' in reply
    # La carte du modèle (ses propres chiffres) est remplacée, jamais doublée.
    assert "99" not in reply and reply.count("```bellum-block") == 1
    assert "progress_block" not in actions[0]


@pytest.mark.asyncio
async def test_another_question_is_untouched_by_the_gate(monkeypatch) -> None:
    calls = _install(
        monkeypatch,
        [SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text="Bonjour !")])],
        {},
    )
    reply, _actions = await _turn("Bonjour")
    assert reply == "Bonjour !"
    assert "tool_choice" not in calls[0]
