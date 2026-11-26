"""#3198 (LAU-FINAL-204, épopée #3223) — `verifier_status`, le dernier des
deux champs SUPPORT_VISIBLE branchés cette tranche (voir `chat_reasoning_trace
.post_turn_diagnostic_fields`).

Même patron, mêmes fixtures que `test_chat_turn_observability_exposure.py`
(#3196.6) : `verifier_status_sink` est rempli par référence par
`_commercial_verify`, jamais un ajout au tuple `(reply, actions)` — le
contrat documenté d'`actions` ne change pas.
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
    usage = SimpleNamespace(
        input_tokens=100, output_tokens=20, cache_read_input_tokens=0, cache_creation_input_tokens=0
    )
    return SimpleNamespace(stop_reason=stop_reason, content=content, usage=usage)


@pytest.fixture(autouse=True)
def _patch_env(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.delenv("CHAT_TURN_BUDGET_S", raising=False)
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _provider: _DummyThrottle())


def _install_client(monkeypatch, responses) -> None:
    fake = _FakeClient(responses)
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)


@pytest.mark.asyncio
async def test_a_clean_answer_carries_its_verifier_status(monkeypatch):
    _install_client(monkeypatch, [_resp("end_turn", [_text("Bonjour Louis.")])])
    sink: list[str] = []
    reply, actions = await chat_orchestrator.run_chat_with_tools(
        "sys", "user", user_id=USER, profile_data=None, verifier_status_sink=sink
    )

    assert reply == "Bonjour Louis."
    # Le contrat d'`actions` ne change pas : aucun outil réel n'a été appelé.
    assert actions == []
    assert sink == ["pass"]


@pytest.mark.asyncio
async def test_a_clarification_never_calls_the_verifier_the_sink_stays_empty(monkeypatch):
    """Le vérificateur commercial ne juge jamais une QUESTION — même chemin
    que celui déjà documenté par `_run_chat_with_tools` : un sink vide sur ce
    chemin est une absence RÉELLE, jamais un défaut."""
    _install_client(
        monkeypatch,
        [
            _resp(
                "tool_use",
                [_text("Je pars sur Lyon."), _tool_use("ask_clarification", {"question": "Quel périmètre ?"}, "t1")],
            )
        ],
    )

    async def _fake_tool(name, tool_input, **_kwargs):
        return {"status": "clarification", "question": tool_input["question"]}

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", _fake_tool)
    sink: list[str] = []
    await chat_orchestrator.run_chat_with_tools(
        "sys", "user", user_id=USER, profile_data=None, verifier_status_sink=sink
    )

    assert sink == []


@pytest.mark.asyncio
async def test_without_a_sink_nothing_changes(monkeypatch):
    """Un appelant qui ne passe pas `verifier_status_sink` (`None`, le défaut)
    garde le comportement d'avant cette tranche à l'octet."""
    _install_client(monkeypatch, [_resp("end_turn", [_text("ok")])])
    reply, actions = await chat_orchestrator.run_chat_with_tools("sys", "user", user_id=USER, profile_data=None)
    assert reply == "ok"
    assert actions == []


# #2879 (lot X17, #2442.15) — les MOTIFS du verdict sortent par le même patron que
# le statut : la liste de l'appelant, remplie par référence, jamais recalculée.
def test_commercial_verify_fills_the_reasons_sink_with_the_verifier_codes() -> None:
    from app.services.chat_orchestrator import _commercial_verify

    status: list[str] = []
    reasons: list[tuple[str, ...]] = []
    result = _commercial_verify(
        "C'est envoyé, le message est parti.",
        tool_outputs=[],
        status_sink=status,
        reasons_sink=reasons,
    )
    assert status == [result.status]
    assert reasons == [tuple(result.repair_reasons)]
    assert "action_declaree_sans_preuve" in reasons[0]


def test_commercial_verify_without_sinks_is_unchanged() -> None:
    from app.services.chat_orchestrator import _commercial_verify

    assert _commercial_verify("Bonjour.", tool_outputs=[]).status == "pass"
