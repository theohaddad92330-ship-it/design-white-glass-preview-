"""#3443 — Laura lit l'EXEMPLE DE COMPORTEMENT (dialogue d'appel à froid fourni
par l'issue) via `select_message_template` en mode `inspiration` : elle en
reprend le déroulé, jamais les mots, et ne cite jamais une affirmation non
vérifiée comme un fait.

Recette /chat — la question exacte à poser : « Prépare-moi un appel à froid
pour le responsable Data d'un compte où je n'ai aucun partenariat confirmé : un
projet est documenté, aucune preuve de budget. Inspire-toi de l'exemple
d'appel à froid de la bibliothèque, sans le réciter. »
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services import bellum_api, chat_orchestrator
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool

_USER = "33333333-3333-4333-8333-333333333333"
_NAME = "select_message_template"
_INPUT = {"channel": "call_brief", "scenario_id": "cold_approach", "persona": "manager", "mode": "inspiration"}

_BEHAVIOR = {
    "mode": "inspiration",
    "examples": [
        {
            "id": "e-9",
            "title": "Appel à froid — Responsable Data — refus transformé en apprentissage",
            "text": "COMMERCIAL : Est-ce que vous m’accordez 30 secondes pour vous expliquer pourquoi je vous appelle ?",
            "usage": "behavior_only",
            "unverifiedClaims": ["références comparables"],
            "usageConstraints": ["Exemple de comportement, pas à réciter"],
        }
    ],
    "reasons": ["canal=call_brief", "scénario=cold_approach", "persona=manager"],
    "rejected": [],
    "rejectedTotal": 0,
    "instruction": "Exemples de comportement : tu en reprends le déroulé, jamais les mots.",
}


def test_the_tool_describes_the_inspiration_mode_without_a_new_tool() -> None:
    tool = next(t for t in CHAT_TOOLS if t["name"] == _NAME)
    assert tool["input_schema"]["properties"]["mode"]["enum"] == ["verbatim", "inspiration"]
    assert "required" in tool["input_schema"] and "mode" not in tool["input_schema"]["required"]
    assert "comportement" in tool["description"].lower()
    assert [t["name"] for t in CHAT_TOOLS][-1] == "push_profile"


@pytest.mark.asyncio
async def test_the_mode_travels_to_the_bridge_and_defaults_to_verbatim(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[str | None] = []

    async def _select(user_id: str, channel: str, scenario_id: str, persona: str, mode: str | None = None) -> dict:
        seen.append(mode)
        return _BEHAVIOR

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "select_message_template", _select)
    await execute_chat_tool(_NAME, _INPUT, user_id=_USER, profile_data=None)
    await execute_chat_tool(_NAME, {k: v for k, v in _INPUT.items() if k != "mode"}, user_id=_USER, profile_data=None)
    assert seen == ["inspiration", None]


@pytest.mark.asyncio
async def test_an_unknown_mode_is_refused_before_any_call(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _boom(*_a: object, **_k: object) -> dict:
        raise AssertionError("le pont ne doit pas être appelé avec un mode inconnu")

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "select_message_template", _boom)
    out = await execute_chat_tool(_NAME, {**_INPUT, "mode": "libre"}, user_id=_USER, profile_data=None)
    assert "error" in out


class _Stream:
    def __init__(self, response: SimpleNamespace) -> None:
        self._response = response

    async def __aenter__(self) -> "_Stream":
        return self

    async def __aexit__(self, *_exc: object) -> bool:
        return False

    def __aiter__(self) -> "_Stream":
        return self

    async def __anext__(self) -> object:
        raise StopAsyncIteration

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
async def test_the_turn_replayed_laura_reads_the_example_as_behavior_only(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _p: _Throttle())
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _select(*_a: object, **_k: object) -> dict:
        return _BEHAVIOR

    monkeypatch.setattr(bellum_api, "select_message_template", _select)
    answer = "Ouvre par la permission de 30 secondes, pose une question, respecte le cadre achats."
    client = _Client(
        [
            SimpleNamespace(
                stop_reason="tool_use",
                content=[SimpleNamespace(type="tool_use", name=_NAME, input=_INPUT, id="toolu_1")],
            ),
            SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text=answer)]),
        ]
    )
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: client)

    reply, actions = await chat_orchestrator.run_chat_with_tools(
        "sys",
        "Prépare-moi un appel à froid pour le responsable Data d'un compte où je n'ai aucun partenariat "
        "confirmé : un projet est documenté, aucune preuve de budget. Inspire-toi de l'exemple d'appel à "
        "froid de la bibliothèque, sans le réciter.",
        user_id=_USER,
        profile_data=None,
    )

    assert actions == [{"tool": _NAME, "input": _INPUT, "status": "done"}]
    assert reply == answer
    sent_back = str(client.calls[1]["messages"])
    # L'exemple, son marquage « comportement seulement » et son affirmation non vérifiée reviennent au modèle.
    assert "behavior_only" in sent_back
    assert "références comparables" in sent_back
    assert "jamais les mots" in sent_back
