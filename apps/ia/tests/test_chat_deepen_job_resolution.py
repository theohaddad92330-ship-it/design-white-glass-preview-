"""#3862.1 (reste, lot I02 07/10) — le lot précédent (branche feat/i02-07-10,
`3829a95f7a`) referme la ligne `chat_deepen_jobs` sur la sortie « aucun outil
appelé » (`chat_orchestrator.py:1809`), mais PAS sur la sortie « round
silencieux » (``note_thread_context`` + texte, `chat_orchestrator.py:1983-1990`)
— une réponse complète qui se termine par CE chemin laissait le bandeau de
reprise affiché après un rechargement, exactement le défaut que #3862 nommait.

Même patron de double que `test_chat_turn_observability_exposure.py` et
`test_chat_deepen_job_report.py` : `_FakeClient` simule le SDK Anthropic
streamé sans réseau, `chat_deepen_job_report.report_resolved` est
monkeypatché pour observer QUAND il est appelé — COMMENT il parle au réseau
est déjà couvert par `test_chat_deepen_job_report.py`.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services import chat_deepen_job_report, chat_orchestrator
from app.services.chat_model_routing import ChatTierContext

USER = "11111111-1111-4111-8111-111111111111"
CONVERSATION = "conv-862"


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

    def stream(self, **_kwargs):
        return _FakeMessageStream(self._responses.pop(0))


class _FakeClient:
    def __init__(self, responses):
        self.messages = _FakeMessages(responses)


def _text(text: str) -> SimpleNamespace:
    return SimpleNamespace(type="text", text=text)


def _tool_use(name: str, tool_input: dict, block_id: str) -> SimpleNamespace:
    return SimpleNamespace(type="tool_use", name=name, input=tool_input, id=block_id)


def _resp(stop_reason: str, content: list) -> SimpleNamespace:
    usage = SimpleNamespace(input_tokens=100, output_tokens=20, cache_read_input_tokens=0, cache_creation_input_tokens=0)
    return SimpleNamespace(stop_reason=stop_reason, content=content, usage=usage)


@pytest.fixture(autouse=True)
def _patch_env(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.delenv("CHAT_TURN_BUDGET_S", raising=False)
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _provider: _DummyThrottle())


def _install_client(monkeypatch, responses) -> None:
    fake = _FakeClient(responses)
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)


def _spy_report_resolved(monkeypatch):
    calls: list[dict] = []

    async def fake_report_resolved(*, user_id, conversation_id):
        calls.append({"user_id": user_id, "conversation_id": conversation_id})
        return True

    monkeypatch.setattr(chat_deepen_job_report, "report_resolved", fake_report_resolved)
    return calls


@pytest.mark.asyncio
async def test_a_clean_silent_round_exit_also_resolves_the_deepen_job(monkeypatch):
    """La réponse complète via un round SILENCIEUX (``note_thread_context`` +
    texte, pas d'absence d'appel d'outil) est tout autant une fin PROPRE que
    le chemin « aucun outil appelé » déjà couvert — l'étude Approfondie
    referme sa ligne ici aussi."""
    _install_client(
        monkeypatch,
        [
            _resp(
                "tool_use",
                [_text("Voici la stratégie complète."), _tool_use("note_thread_context", {"note": "x"}, "t1")],
            )
        ],
    )

    async def _fake_tool(name, tool_input, **_kwargs):
        return {"status": "noted"}

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", _fake_tool)
    calls = _spy_report_resolved(monkeypatch)

    reply, _actions = await chat_orchestrator.run_chat_with_tools(
        "sys",
        "user",
        user_id=USER,
        profile_data=None,
        tier_request="fais-moi toute la stratégie sur ce compte",
        tier_context=ChatTierContext(requested_mode="approfondi"),
        conversation_id=CONVERSATION,
    )

    assert reply == "Voici la stratégie complète."
    assert calls == [{"user_id": USER, "conversation_id": CONVERSATION}]


@pytest.mark.asyncio
async def test_an_ordinary_turn_never_calls_report_resolved(monkeypatch):
    """Hors mode Approfondi : aucune ligne `chat_deepen_jobs` n'a pu être
    ouverte pour ce tour — appeler `report_resolved` serait un aller-retour
    réseau inutile à chaque réponse ordinaire."""
    _install_client(
        monkeypatch,
        [
            _resp(
                "tool_use",
                [_text("Bonjour Louis."), _tool_use("note_thread_context", {"note": "x"}, "t1")],
            )
        ],
    )

    async def _fake_tool(name, tool_input, **_kwargs):
        return {"status": "noted"}

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", _fake_tool)
    calls = _spy_report_resolved(monkeypatch)

    await chat_orchestrator.run_chat_with_tools(
        "sys", "user", user_id=USER, profile_data=None, conversation_id=CONVERSATION
    )

    assert calls == []
