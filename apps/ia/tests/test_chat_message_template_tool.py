"""#3427 — Laura choisit un modèle APPROUVÉ de la bibliothèque par canal,
scénario et persona — jamais par ressemblance de mots — et le reprend mot pour
mot ; sans entrée sélectionnable, elle le dit et n'écrit PAS un texte de
remplacement.

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
_NAME = "select_message_template"
_INPUT = {"channel": "linkedin_draft", "scenario_id": "accepted_connection", "persona": "decideur"}

_SELECTED = {
    "selectedId": "e-1",
    "reasons": ["canal, scénario et persona correspondent"],
    "rejected": [{"id": "e-2", "reason": "affirmation sans donnée réelle"}],
    "template": {
        "title": "M1 — Décideur — invitation acceptée",
        "text": "Bonjour {{Prenom}}, ravi d'échanger sur {{domaine}}.",
        "expectedVariables": ["Prenom", "domaine"],
        "version": 1,
        "usageConstraints": [],
    },
}


def _tool() -> dict:
    return next(t for t in CHAT_TOOLS if t["name"] == _NAME)


def test_the_tool_is_declared_before_push_profile_which_stays_last() -> None:
    names = [t["name"] for t in CHAT_TOOLS]
    assert _NAME in names
    assert names[-1] == "push_profile"
    assert _NAME in READ_ONLY_TOOLS


def test_the_description_forbids_rewriting_and_similarity_picking() -> None:
    description = _tool()["description"]
    assert "mot pour mot" in description
    assert "JAMAIS" in description
    assert "ressemblance" in description


@pytest.mark.asyncio
async def test_relays_the_bridge_answer_with_structured_criteria(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict = {}

    async def _select(user_id: str, channel: str, scenario_id: str, persona: str) -> dict:
        seen.update(user_id=user_id, channel=channel, scenario_id=scenario_id, persona=persona)
        return _SELECTED

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "select_message_template", _select)
    assert await execute_chat_tool(_NAME, _INPUT, user_id=_USER, profile_data=None) == _SELECTED
    assert seen == {"user_id": _USER, "channel": "linkedin_draft", "scenario_id": "accepted_connection", "persona": "decideur"}


@pytest.mark.asyncio
async def test_a_missing_criterion_is_refused_before_any_call(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _boom(*_a: object, **_k: object) -> dict:
        raise AssertionError("le pont ne doit pas être appelé sans critères complets")

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "select_message_template", _boom)
    out = await execute_chat_tool(_NAME, {"channel": "linkedin_draft"}, user_id=_USER, profile_data=None)
    assert "error" in out


@pytest.mark.asyncio
async def test_a_silent_or_unwired_bridge_is_an_error_never_an_invented_template(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _silent(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "select_message_template", _silent)
    out = await execute_chat_tool(_NAME, _INPUT, user_id=_USER, profile_data=None)
    assert out == {"error": "La bibliothèque de modèles n'a pas répondu."}

    async def _unavailable(*_a: object, **_k: object) -> dict:
        return {"error": "message_library_unavailable"}

    monkeypatch.setattr(bellum_api, "select_message_template", _unavailable)
    out = await execute_chat_tool(_NAME, _INPUT, user_id=_USER, profile_data=None)
    assert out == {"error": "La bibliothèque de modèles n'a pas répondu."}


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
async def test_the_turn_replayed_laura_reuses_the_approved_text(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _p: _Throttle())
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _select(*_a: object, **_k: object) -> dict:
        return _SELECTED

    monkeypatch.setattr(bellum_api, "select_message_template", _select)

    verbatim = "Bonjour {{Prenom}}, ravi d'échanger sur {{domaine}}. Quels sont les prénom et domaine ?"
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
        "Donne-moi le message approuvé pour une invitation LinkedIn acceptée par un décideur.",
        user_id=_USER,
        profile_data=None,
    )

    assert actions == [{"tool": _NAME, "input": _INPUT, "status": "done"}]
    assert reply == verbatim
    # Le résultat de l'outil est bien revenu au modèle au tour suivant.
    sent_back = str(client.calls[1]["messages"])
    assert "{{domaine}}" in sent_back and "ravi d" in sent_back
    assert "affirmation sans donn" in sent_back


# ── #3437 / #3438 / #3440 — l'ÉTAPE de la séquence ───────────────────────────


def test_the_tool_declares_the_step_as_an_optional_enum() -> None:
    schema = _tool()["input_schema"]
    assert schema["properties"]["step"]["enum"] == ["invitation", "M1", "M2", "M3"]
    assert "step" not in schema["required"]


@pytest.mark.asyncio
async def test_the_requested_step_reaches_the_bridge_and_the_answer_comes_back_unchanged(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: dict = {}
    answer = {**_SELECTED, "template": {**_SELECTED["template"], "step": "M2"}}

    async def _select(user_id: str, channel: str, scenario_id: str, persona: str, **kwargs: object) -> dict:
        seen.update(channel=channel, scenario_id=scenario_id, persona=persona, **kwargs)
        return answer

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "select_message_template", _select)
    out = await execute_chat_tool(_NAME, {**_INPUT, "step": "M2"}, user_id=_USER, profile_data=None)
    assert out == answer
    assert seen["step"] == "M2"


@pytest.mark.asyncio
async def test_no_step_means_the_bridge_is_called_exactly_as_before(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict = {}

    async def _select(*args: object, **kwargs: object) -> dict:
        seen.update(args=args, kwargs=kwargs)
        return _SELECTED

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "select_message_template", _select)
    await execute_chat_tool(_NAME, _INPUT, user_id=_USER, profile_data=None)
    assert seen["kwargs"] == {}
    assert len(seen["args"]) == 4


@pytest.mark.asyncio
async def test_an_unknown_step_is_refused_before_any_call(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _boom(*_a: object, **_k: object) -> dict:
        raise AssertionError("une étape inconnue ne part pas au pont")

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "select_message_template", _boom)
    out = await execute_chat_tool(_NAME, {**_INPUT, "step": "M9"}, user_id=_USER, profile_data=None)
    assert "error" in out
