"""#3399 (lot RAW, recette G4 prod 11/10) — « Quel compte attaquer en premier ? » ⇒ prose, 0 carte,
AUCUN outil ; « Où investir » ⇒ carte `account_ranking` 20 lignes (via `get_portfolio_priorities`).

POURQUOI RAT NE REPRODUISAIT PAS : son test (`test_3399_tour_entier_rat.py`) faisait APPELER
`get_portfolio_priorities` par le faux modèle — la chaîne aval est saine. En prod, le modèle n'appelle
rien. Et le routeur d'intention l'en détourne : « quel compte attaquer en premier » est un marqueur de
`comparer` (`intent_router.py`), dont l'outil à préférer est `compare_accounts` — qui exige des comptes
NOMMÉS. Sans nom, le modèle répond en prose. Même remède que #3513 et #3218 : la règle vit dans le
CHEMIN — au premier round, `get_portfolio_priorities` est FORCÉ."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services import chat_orchestrator
from app.services.chat_requested_mode import set_turn_thread
from app.services.compilers.intent_router import asks_which_account_to_attack_first

PRIORITIES = "get_portfolio_priorities"


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


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "message",
    ["Quel compte attaquer en premier ?", "Où investir cette semaine ?", "Which account should I prioritize?"],
)
async def test_raw_3399_the_portfolio_question_forces_the_priorities_tool(monkeypatch, message):
    set_turn_thread(message, [])
    messages = _install(
        monkeypatch,
        [
            _resp("tool_use", [SimpleNamespace(type="tool_use", name=PRIORITIES, input={}, id="t1")]),
            _resp("end_turn", [SimpleNamespace(type="text", text="Voici tes priorités.")]),
        ],
    )
    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", AsyncMock(return_value={"now": [], "toWatch": []}))

    await chat_orchestrator.run_chat_with_tools("sys", message, user_id="u1", profile_data=None, user_message=message)

    assert messages.calls[0]["tool_choice"] == {"type": "tool", "name": PRIORITIES}
    # Les rounds suivants restent libres : le modèle conclut.
    assert "tool_choice" not in messages.calls[1]


@pytest.mark.parametrize(
    "message",
    [
        # Des comptes NOMMÉS à départager : c'est `compare_accounts`, jamais le portefeuille entier.
        "Quel compte attaquer en premier entre Société Générale et BNP ?",
        "Peux-tu comparer mes comptes Société Générale et BNP ?",
        # Un compte nommé à qualifier : c'est le verdict (#3513).
        "Faut-il aller chez LVMH ?",
        "Bonjour",
    ],
)
def test_raw_3399_the_detector_says_no_outside_the_portfolio_question(message):
    assert asks_which_account_to_attack_first(message) is None


@pytest.mark.asyncio
async def test_raw_3399_a_named_comparison_keeps_the_free_choice(monkeypatch):
    message = "Peux-tu comparer mes comptes Société Générale et BNP ?"
    set_turn_thread(message, [])
    messages = _install(monkeypatch, [_resp("end_turn", [SimpleNamespace(type="text", text="…")])])

    await chat_orchestrator.run_chat_with_tools("sys", message, user_id="u1", profile_data=None, user_message=message)

    assert "tool_choice" not in messages.calls[0]
