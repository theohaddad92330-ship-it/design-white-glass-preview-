"""#3422.20 — « message trop générique » : Laura passe le texte soumis dans la
checklist « avant d'envoyer » (la MÊME règle que l'écran), nomme chaque contrôle
qui échoue et ne dit « prêt » que si tout est vérifié et conforme.

Recette /chat — la question exacte à poser : « Donne-moi le message approuvé
pour une invitation LinkedIn acceptée par un décideur. ».
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.access.rights_matrix import READ_ONLY_TOOLS
from app.services import bellum_api, chat_orchestrator
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool

_USER = "33333333-3333-4333-8333-333333333333"
_NAME = "check_message_before_send"
_INPUT = {"body": "Bonjour, je me permets de vous contacter afin de vous présenter notre expertise Java.", "step": 1}

_ANSWER = {
    "checks": [
        {"id": "easy_question", "rule": "Une question facile", "verdict": "fail", "detail": "aucune question"},
        {"id": "length", "rule": "Longueur", "verdict": "pass", "detail": "ok"},
    ],
    "failures": [{"id": "easy_question", "rule": "Une question facile", "verdict": "fail", "detail": "aucune question"}],
    "notCheckable": [],
    "readyToSend": False,
}


def _tool() -> dict:
    return next(t for t in CHAT_TOOLS if t["name"] == _NAME)


def test_the_tool_is_declared_before_push_profile_which_stays_last() -> None:
    names = [t["name"] for t in CHAT_TOOLS]
    assert _NAME in names
    assert names[-1] == "push_profile"
    assert _NAME in READ_ONLY_TOOLS


def test_the_description_forbids_declaring_ready_without_the_check() -> None:
    description = _tool()["description"]
    assert "JAMAIS" in description
    assert "n'envoies rien" in description


@pytest.mark.asyncio
async def test_relays_the_bridge_answer_as_is(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict = {}

    async def _check(user_id: str, body: str, step: int | None, persona: str | None, terms: list[str] | None = None) -> dict:
        seen.update(user_id=user_id, body=body, step=step, persona=persona, terms=terms)
        return _ANSWER

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "pre_send_check", _check)
    assert await execute_chat_tool(_NAME, _INPUT, user_id=_USER, profile_data=None) == _ANSWER
    assert seen["body"] == _INPUT["body"] and seen["step"] == 1 and seen["user_id"] == _USER


@pytest.mark.asyncio
async def test_an_empty_body_is_refused_before_any_call(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _boom(*_a: object, **_k: object) -> dict:
        raise AssertionError("pas d'appel sans texte")

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "pre_send_check", _boom)
    assert "error" in await execute_chat_tool(_NAME, {"body": "  "}, user_id=_USER, profile_data=None)


@pytest.mark.asyncio
async def test_a_silent_bridge_is_an_error_never_a_ready_verdict(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _silent(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "pre_send_check", _silent)
    out = await execute_chat_tool(_NAME, _INPUT, user_id=_USER, profile_data=None)
    assert out == {"error": "La checklist avant envoi n'a pas répondu."}


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
async def test_the_turn_replayed_laura_names_the_failing_check(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _p: _Throttle())
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _check(*_a: object, **_k: object) -> dict:
        return _ANSWER

    monkeypatch.setattr(bellum_api, "pre_send_check", _check)

    verbatim = "Pas prêt : il n'y a aucune question facile à laquelle répondre."
    client = _Client(
        [
            SimpleNamespace(
                stop_reason="tool_use",
                content=[SimpleNamespace(type="tool_use", name=_NAME, input=_INPUT, id="toolu_1")],
            ),
            SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text=verbatim)]),
        ]
    )
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: client)

    reply, actions = await chat_orchestrator.run_chat_with_tools(
        "sys",
        "Vérifie ce message avant que je l'envoie : « Bonjour, je me permets de vous contacter afin de vous présenter notre expertise Java. »",
        user_id=_USER,
        profile_data=None,
    )

    assert actions == [{"tool": _NAME, "input": _INPUT, "status": "done"}]
    assert reply == verbatim
    # Le résultat de l'outil est bien revenu au modèle au tour suivant.
    sent_back = str(client.calls[1]["messages"])
    assert "easy_question" in sent_back and "aucune question" in sent_back


@pytest.mark.asyncio
async def test_recipient_terms_travel_to_the_bridge(monkeypatch: pytest.MonkeyPatch) -> None:
    """#3436 — l'entreprise et la personne visées partent avec le texte."""
    seen: dict = {}

    async def _check(user_id: str, body: str, step: int | None, persona: str | None, terms: list[str] | None = None) -> dict:
        seen["terms"] = terms
        return _ANSWER

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "pre_send_check", _check)
    await execute_chat_tool(
        _NAME, {**_INPUT, "recipient_terms": ["Société Générale", " Claire ", ""]}, user_id=_USER, profile_data=None
    )
    assert seen["terms"] == ["Société Générale", "Claire"]
