"""#3211.9 (épopée #3234) — « une action sans résultat doit demander ou
inférer un outcome ».

On ne l'INFÈRE jamais : `list_actions_awaiting_outcome` nomme les actions
échues dont aucun résultat n'a été déclaré, et Laura POSE LA QUESTION. La règle
de portée (« en retard », espace actif) vit côté NestJS ; l'outil relaie TEL QUEL.

Recette /chat — la question exacte à poser : « Quelles actions sont échues sans
que je t'aie dit ce qu'elles ont donné ? ».
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services import bellum_api, chat_orchestrator
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool

_USER = "33333333-3333-4333-8333-333333333333"
_NAME = "list_actions_awaiting_outcome"

_AWAITING = {
    "actions": [
        {
            "id": "a-1",
            "label": "Relancer Delphine après le comité",
            "companyName": "Stelya",
            "dueDate": "2026-09-22",
            "channel": "email",
            "ownerName": None,
        }
    ],
    "truncated": False,
}


def _tool() -> dict:
    return next(t for t in CHAT_TOOLS if t["name"] == _NAME)


def test_the_tool_is_declared_before_push_profile_which_stays_last() -> None:
    names = [t["name"] for t in CHAT_TOOLS]
    assert _NAME in names
    assert names[-1] == "push_profile"


def test_the_description_forbids_inferring_an_outcome() -> None:
    description = _tool()["description"]
    # Laura demande, elle ne devine pas ; « fait » n'est pas un résultat.
    assert "JAMAIS" in description and "résultat" in description
    assert "n'écris rien" in description


@pytest.mark.asyncio
async def test_relays_the_bridge_answer_as_is(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _awaiting(user_id: str) -> dict:
        assert user_id == _USER
        return _AWAITING

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "actions_awaiting_outcome", _awaiting)
    out = await execute_chat_tool(_NAME, {}, user_id=_USER, profile_data=None)
    # Le contenu du pont est relayé tel quel ; l'enveloppe (#2852) s'y ajoute.
    assert {key: out[key] for key in _AWAITING} == _AWAITING
    assert out["status"] == "success"


@pytest.mark.asyncio
async def test_a_silent_bridge_is_an_error_never_an_empty_list(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _silent(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "actions_awaiting_outcome", _silent)
    out = await execute_chat_tool(_NAME, {}, user_id=_USER, profile_data=None)
    assert out["error"] == "Les actions n'ont pas répondu."
    assert out["status"] == "provider_error"


@pytest.mark.asyncio
async def test_an_unwired_service_is_a_clear_error(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _unavailable(*_a: object, **_k: object) -> dict:
        return {"error": "actions_awaiting_outcome_unavailable"}

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "actions_awaiting_outcome", _unavailable)
    out = await execute_chat_tool(_NAME, {}, user_id=_USER, profile_data=None)
    assert out["error"] == "Les actions n'ont pas répondu."
    assert out["status"] == "provider_error"


# ── Le tour rejoué : entrée → outil appelé → réponse ─────────────────────────


class _Stream:
    def __init__(self, response: SimpleNamespace) -> None:
        self._response = response

    async def __aenter__(self) -> _Stream:
        return self

    async def __aexit__(self, *_exc: object) -> bool:
        return False

    async def __aiter__(self):
        for block in self._response.content:
            if block.type == "text":
                yield SimpleNamespace(type="text", text=block.text)

    async def get_final_message(self) -> SimpleNamespace:
        return self._response


class _Client:
    def __init__(self, responses: list[SimpleNamespace]) -> None:
        self.calls: list[dict] = []
        self._responses = list(responses)
        self.messages = self

    def stream(self, **kwargs: object) -> _Stream:
        self.calls.append(kwargs)
        return _Stream(self._responses.pop(0))


class _Throttle:
    async def __aenter__(self) -> None:
        return None

    async def __aexit__(self, *_exc: object) -> bool:
        return False


@pytest.mark.asyncio
async def test_the_turn_replayed_laura_asks_the_outcome_instead_of_guessing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _p: _Throttle())
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _awaiting(*_a: object, **_k: object) -> dict:
        return _AWAITING

    monkeypatch.setattr(bellum_api, "actions_awaiting_outcome", _awaiting)

    question = "Relancer Delphine après le comité : qu'est-ce que ça a donné ?"
    client = _Client(
        [
            SimpleNamespace(
                stop_reason="tool_use",
                content=[SimpleNamespace(type="tool_use", name=_NAME, input={}, id="toolu_1")],
            ),
            SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text=question)]),
        ]
    )
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: client)

    reply, actions = await chat_orchestrator.run_chat_with_tools(
        "sys",
        "Quelles actions sont échues sans que je t'aie dit ce qu'elles ont donné ?",
        user_id=_USER,
        profile_data=None,
    )

    assert actions == [{"tool": _NAME, "input": {}, "status": "done"}]
    assert reply == question
    # Le résultat de l'outil est bien revenu au modèle au tour suivant.
    sent_back = str(client.calls[1]["messages"])
    assert "Relancer Delphine après le comité" in sent_back
    assert "Stelya" in sent_back
