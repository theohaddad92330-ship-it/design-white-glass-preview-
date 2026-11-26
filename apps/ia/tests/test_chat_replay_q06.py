"""Lot Q06 (30/09) — TOURS REJOUÉS de bout en bout dans le chat de Laura.

Règle de Louis (30/09 soir) : un comportement de Laura ne se ferme que sur une
réponse observée dans /chat. Faute d'appel Claude vivant en CI, le tour est
REJOUÉ : entrée de la personne → appel d'outil du modèle → exécuteur d'outil
(simulé) → réponse du modèle (simulée) → verdict du vérificateur, avec le
prompt RÉEL reçu par le modèle capturé à chaque appel. Ce que ces tests
prouvent : ce que Laura REÇOIT et comment sa réponse est JUGÉE. Ce qu'ils ne
prouvent pas : que le modèle vivant obéit — c'est la question de recette posée
dans le commentaire de l'issue.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services import chat_orchestrator

USER = "11111111-1111-4111-8111-111111111111"


class _DummyThrottle:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_a):
        return False


class _FakeMessageStream:
    def __init__(self, response):
        self._response = response

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc):
        return False

    async def __aiter__(self):
        for block in getattr(self._response, "content", None) or []:
            if getattr(block, "type", None) == "text":
                yield SimpleNamespace(type="text", text=block.text)

    async def get_final_message(self):
        return self._response


class _FakeMessages:
    def __init__(self, responses):
        self._responses = list(responses)
        #: ce que le MODÈLE reçoit à chaque appel (prompt système, messages, outils).
        self.calls: list[dict] = []

    def stream(self, **kwargs):
        self.calls.append(kwargs)
        return _FakeMessageStream(self._responses.pop(0))


class _FakeClient:
    def __init__(self, responses):
        self.messages = _FakeMessages(responses)


def _text(text: str) -> SimpleNamespace:
    return SimpleNamespace(type="text", text=text)


def _tool_use(name: str, tool_input: dict, block_id: str) -> SimpleNamespace:
    return SimpleNamespace(type="tool_use", name=name, input=tool_input, id=block_id)


def _resp(stop_reason: str, content: list) -> SimpleNamespace:
    usage = SimpleNamespace(
        input_tokens=100, output_tokens=20, cache_read_input_tokens=0, cache_creation_input_tokens=0
    )
    return SimpleNamespace(stop_reason=stop_reason, content=content, usage=usage)


@pytest.fixture(autouse=True)
def _patch_env(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.delenv("CHAT_TURN_BUDGET_S", raising=False)
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _provider: _DummyThrottle())


def _install_client(monkeypatch, responses) -> _FakeClient:
    fake = _FakeClient(responses)
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)
    return fake




def _prompt_of(call: dict) -> str:
    system = call["system"]
    if isinstance(system, str):
        return system
    return " ".join(block.get("text", "") for block in system if isinstance(block, dict))


@pytest.mark.asyncio
async def test_3436_2_replay_a_historical_observation_stated_as_current_is_flagged(monkeypatch):
    """Entrée : « Devoteam recrute-t-il des freelances ? » → outil de briefing →
    réponse qui présente l'observation historique comme une pratique actuelle."""
    client = _install_client(
        monkeypatch,
        [
            _resp("tool_use", [_tool_use("get_account_briefing", {"account": "Devoteam"}, "t1")]),
            _resp("end_turn", [_text("Oui, Devoteam recrute actuellement des freelances sur le cloud.")]),
        ],
    )

    async def _fake_tool(name, tool_input, **_kwargs):
        return {"account": "Devoteam", "market_observations": ["missions freelance observées en 2025"]}

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", _fake_tool)
    sink: list[str] = []
    reply, actions = await chat_orchestrator.run_chat_with_tools(
        "sys", "Devoteam recrute-t-il des freelances ?", user_id=USER, profile_data=None, verifier_status_sink=sink
    )

    assert [a["tool"] for a in actions] == ["get_account_briefing"]
    assert sink == ["repair"]
    assert len(client.messages.calls) == 2


@pytest.mark.asyncio
async def test_3436_2_replay_the_same_observation_named_as_an_observation_passes(monkeypatch):
    _install_client(
        monkeypatch,
        [
            _resp("tool_use", [_tool_use("get_account_briefing", {"account": "Devoteam"}, "t1")]),
            _resp(
                "end_turn",
                [_text("Bellum a observé des missions freelance chez Devoteam en 2025 ; je ne peux pas le poser comme actuel.")],
            ),
        ],
    )

    async def _fake_tool(name, tool_input, **_kwargs):
        return {"account": "Devoteam"}

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", _fake_tool)
    sink: list[str] = []
    await chat_orchestrator.run_chat_with_tools(
        "sys", "Devoteam recrute-t-il des freelances ?", user_id=USER, profile_data=None, verifier_status_sink=sink
    )
    assert sink == ["pass"]


@pytest.mark.asyncio
async def test_3399_replay_a_recommendation_turn_reaches_the_model_with_the_six_questions(monkeypatch):
    """Entrée : « Quel compte attaquer en premier ? » → outil de priorités →
    le modèle reçoit le format à six questions À CHAQUE appel du tour (celui
    qui choisit l'outil ET celui qui rédige)."""
    from app.prompts.bellum_advisor import build_system_prompt

    system = build_system_prompt({}, {}, "", "")
    client = _install_client(
        monkeypatch,
        [
            _resp("tool_use", [_tool_use("get_portfolio_priorities", {}, "t1")]),
            _resp("end_turn", [_text("Commence par Thales : ...")]),
        ],
    )

    async def _fake_tool(name, tool_input, **_kwargs):
        return {"priorities": [{"account": "Thales", "why": "signal récent"}]}

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", _fake_tool)
    reply, actions = await chat_orchestrator.run_chat_with_tools(
        system, "Quel compte attaquer en premier ?", user_id=USER, profile_data=None
    )

    assert [a["tool"] for a in actions] == ["get_portfolio_priorities"]
    assert len(client.messages.calls) == 2
    for call in client.messages.calls:
        prompt = _prompt_of(call)
        for question in (
            "POURQUOI CE COMPTE",
            "LE MOMENT",
            "SUR QUEL PÉRIMÈTRE",
            "AVEC QUELLE PERSONNE",
            "AVEC QUELLE PREUVE",
        ):
            assert question in prompt, f"« {question} » n'atteint pas le modèle"
