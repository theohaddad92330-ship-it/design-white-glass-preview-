"""#3513 (recette prod 02/10, Y14) — « Faut-il aller chez LVMH ? » : LVMH est
analysé, mais le modèle répondait en texte sans appeler
`get_account_suitability_verdict` (aucune carte). Une consigne dans le prompt
n'est qu'un conseil : le routeur de qualification FORCE désormais l'outil au
premier round. Ce test rejoue le TOUR ENTIER : message → paramètres mis sur le
fil → outil exécuté → réponse."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services import chat_orchestrator
from app.services.chat_tools import CHAT_TOOLS

VERDICT = "get_account_suitability_verdict"


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


class _Messages:
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls: list[dict] = []

    def stream(self, **kwargs):
        self.calls.append({**kwargs, "messages": list(kwargs["messages"])})
        return _Stream(self._responses.pop(0))


def _install(monkeypatch, responses):
    fake = SimpleNamespace(messages=_Messages(responses))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _p: _Throttle())
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)
    return fake.messages


def _resp(stop_reason, content):
    return SimpleNamespace(stop_reason=stop_reason, content=content)


async def _run(message: str):
    return await chat_orchestrator.run_chat_with_tools(
        "sys", message, user_id="u1", profile_data=None, user_message=message
    )


@pytest.mark.asyncio
async def test_x58_3513_the_recipe_question_forces_the_verdict_tool_on_round_one(monkeypatch):
    messages = _install(
        monkeypatch,
        [
            _resp("tool_use", [SimpleNamespace(type="tool_use", name=VERDICT, input={"account_name": "LVMH"}, id="t1")]),
            _resp("end_turn", [SimpleNamespace(type="text", text="Pas maintenant.")]),
        ],
    )
    executed = AsyncMock(return_value={"verdict": "NO_GO_NOW"})
    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", executed)

    reply, actions = await _run("Faut-il aller chez LVMH ?")

    assert messages.calls[0]["tool_choice"] == {"type": "tool", "name": VERDICT}
    # Le round suivant (la réponse) reste libre : un choix forcé en boucle ne
    # laisserait jamais le modèle conclure.
    assert "tool_choice" not in messages.calls[1]
    assert [a["tool"] for a in actions] == [VERDICT]
    executed.assert_awaited_once()
    assert reply == "Pas maintenant."


@pytest.mark.asyncio
async def test_x58_3513_an_ordinary_question_keeps_the_free_choice_of_before(monkeypatch):
    messages = _install(monkeypatch, [_resp("end_turn", [SimpleNamespace(type="text", text="Bonjour.")])])

    await _run("Bonjour")

    assert "tool_choice" not in messages.calls[0]


@pytest.mark.asyncio
async def test_x58_3513_no_forcing_when_the_verdict_tool_is_not_offered(monkeypatch):
    messages = _install(monkeypatch, [_resp("end_turn", [SimpleNamespace(type="text", text="Je ne peux pas.")])])
    monkeypatch.setattr(
        chat_orchestrator,
        "tools_for",
        lambda _families: [t for t in CHAT_TOOLS if t["name"] != VERDICT],
    )

    await _run("Faut-il aller chez LVMH ?")

    assert "tool_choice" not in messages.calls[0]
