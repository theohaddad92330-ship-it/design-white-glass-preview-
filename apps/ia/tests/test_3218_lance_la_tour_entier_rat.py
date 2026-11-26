"""#3218 (lot RAT, recette NF 10/10, prod b5c1ee1480) — BNP Paribas : « Lance maintenant
l'analyse approfondie » → question de périmètre ; « lance-la » → 2e question, rien lancé.

POURQUOI LE TEST RAN PASSAIT ET LA PROD ÉCHOUAIT — journal IA du 10/10 19:52:44, cid 81f373ad :
le tour « lance-la » a rendu `tools_called: ()`. Le modèle (openai/gpt-5.6-luna) n'a APPELÉ AUCUN
OUTIL : la branche `scope_accepted_default` de `plan_account_analysis` (testée par RAN en appelant
`_analysis_card` directement) n'a jamais tourné. Une consigne dans le résultat d'un outil ne sert à
rien si l'outil n'est pas appelé.

Ce test rejoue le TOUR ENTIER (`run_chat_with_tools`, fil posé comme le fait `chat.py`) : sur un
acquiescement court après la question de périmètre, l'orchestrateur FORCE `plan_account_analysis`
au premier round, puis `start_account_analysis` dès que la préparation rend un jeton."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services import chat_orchestrator
from app.services.chat_requested_mode import set_turn_thread

PLAN = "plan_account_analysis"
START = "start_account_analysis"

_SCOPE_QUESTION = (
    "BNP Paribas est un groupe trop large pour une seule analyse : sur quel périmètre veux-tu cadrer ?"
)


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


def _tool_use(name, tool_input, call_id):
    return SimpleNamespace(type="tool_use", name=name, input=tool_input, id=call_id)


async def _executor(name, tool_input, **_kw):
    if name == PLAN:
        return {
            "action": START,
            "company": "BNP Paribas",
            "plan_token": "tok-bnp",
            "cost_credits": 8,
            "status": "scope_accepted_default",
            "instruction": "…",
        }
    if name == START:
        return {"status": "started", "job_id": "job-1"}
    return {}


@pytest.mark.asyncio
async def test_rat_3218_lance_la_forces_plan_then_start_on_the_real_turn(monkeypatch):
    set_turn_thread(
        "lance-la",
        [
            {"role": "user", "content": "Lance maintenant l'analyse approfondie de BNP Paribas"},
            {"role": "assistant", "content": _SCOPE_QUESTION},
        ],
    )
    messages = _install(
        monkeypatch,
        [
            _resp("tool_use", [_tool_use(PLAN, {"company": "BNP Paribas"}, "t1")]),
            _resp("tool_use", [_tool_use(START, {"company": "BNP Paribas", "plan_token": "tok-bnp"}, "t2")]),
            _resp("end_turn", [SimpleNamespace(type="text", text="Analyse lancée sur BNP Paribas.")]),
        ],
    )
    executed = AsyncMock(side_effect=_executor)
    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", executed)

    _reply, actions = await chat_orchestrator.run_chat_with_tools(
        "sys", "lance-la", user_id="u1", profile_data=None, user_message="lance-la"
    )

    assert messages.calls[0]["tool_choice"] == {"type": "tool", "name": PLAN}
    assert messages.calls[1]["tool_choice"] == {"type": "tool", "name": START}
    assert "tool_choice" not in messages.calls[2]
    assert [a["tool"] for a in actions] == [PLAN, START]


@pytest.mark.asyncio
async def test_rat_3218_a_question_without_scope_context_keeps_the_free_choice(monkeypatch):
    set_turn_thread("ok", [{"role": "assistant", "content": "Veux-tu que je résume ce compte ?"}])
    messages = _install(monkeypatch, [_resp("end_turn", [SimpleNamespace(type="text", text="D'accord.")])])

    await chat_orchestrator.run_chat_with_tools("sys", "ok", user_id="u1", profile_data=None, user_message="ok")

    assert "tool_choice" not in messages.calls[0]


@pytest.mark.asyncio
async def test_rat_3218_the_scope_question_is_recognised_without_a_question_mark(monkeypatch):
    # Le texte persisté du tour précédent est celui RÉPARÉ par le vérificateur (19:52:22, REPAIR
    # densite_reponse_incoherente) : il peut perdre son « ? ». Les pistes de périmètre suffisent.
    set_turn_thread(
        "vas-y",
        [
            {"role": "user", "content": "Analyse BNP Paribas"},
            {"role": "assistant", "content": "Trois périmètres possibles chez BNP Paribas, choisis-en un."},
        ],
    )
    messages = _install(monkeypatch, [_resp("end_turn", [SimpleNamespace(type="text", text="…")])])

    await chat_orchestrator.run_chat_with_tools("sys", "vas-y", user_id="u1", profile_data=None, user_message="vas-y")

    assert messages.calls[0]["tool_choice"] == {"type": "tool", "name": PLAN}


@pytest.mark.asyncio
async def test_rat_3218_a_yes_to_something_else_than_an_analysis_forces_nothing(monkeypatch):
    # Forcer un outil est un geste : « oui » à « un message pour la direction ? » ne prépare aucune analyse.
    set_turn_thread(
        "oui",
        [
            {"role": "user", "content": "Qui contacter chez BNP Paribas ?"},
            {"role": "assistant", "content": "Veux-tu un message pour la direction des achats ?"},
        ],
    )
    messages = _install(monkeypatch, [_resp("end_turn", [SimpleNamespace(type="text", text="…")])])

    await chat_orchestrator.run_chat_with_tools("sys", "oui", user_id="u1", profile_data=None, user_message="oui")

    assert "tool_choice" not in messages.calls[0]
