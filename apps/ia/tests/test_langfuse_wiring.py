"""Câblage Langfuse : chaque appel Claude devient une génération, chaque tour de
copilote et chaque run d'analyse une trace, chaque phase / outil un span.

Le point d'entrée est ``_log_usage`` — le même goulot que les compteurs de coût
et le registre par run : un chemin d'appel qui compte son coût trace aussi sa
génération, sans site d'instrumentation supplémentaire à oublier.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.prompts.registry import prompt_version_for
from app.services import chat_orchestrator
from app.services import langfuse_client as lf
from app.services.claude_service import CallMetadata, TokenUsage, _log_usage


@pytest.fixture(autouse=True)
def _clean_state(monkeypatch):
    for var in ("LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "LANGFUSE_CAPTURE_CONTENT", "LANGFUSE_DISABLED"):
        monkeypatch.delenv(var, raising=False)
    lf._reset_for_tests()
    yield
    lf._reset_for_tests()


def _enable(monkeypatch):
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-lf-test")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk-lf-test")


def _bodies(event_type: str) -> list[dict]:
    return [e["body"] for e in lf._pending_events() if e["type"] == event_type]


def _usage() -> TokenUsage:
    return TokenUsage(
        input_tokens=100,
        output_tokens=25,
        model="claude-sonnet-5",
        cost_usd=0.0031,
        cache_read_tokens=10,
        cache_creation_tokens=0,
    )


# ── _log_usage → génération ───────────────────────────────────────────────────


def test_log_usage_emet_une_generation(monkeypatch):
    _enable(monkeypatch)
    _log_usage(_usage(), CallMetadata(prompt_name="bellum_facts", correlation_id="cid-1"), duration_s=2.0)

    gens = _bodies("generation-create")
    assert len(gens) == 1
    assert gens[0]["name"] == "bellum_facts"
    assert gens[0]["model"] == "claude-sonnet-5"
    assert gens[0]["usageDetails"]["input"] == 100
    assert gens[0]["usageDetails"]["output"] == 25
    assert gens[0]["costDetails"]["total"] == 0.0031


def test_log_usage_sans_cles_reste_muet(monkeypatch):
    _log_usage(_usage(), CallMetadata(prompt_name="bellum_facts"))
    assert lf._pending_events() == []


# ── tour de copilote → trace + spans d'outils ─────────────────────────────────


class _DummyThrottle:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_a):
        return False


def _chat_usage() -> SimpleNamespace:
    return SimpleNamespace(
        input_tokens=50, output_tokens=10, cache_read_input_tokens=0, cache_creation_input_tokens=0
    )


def _text_resp(text: str) -> SimpleNamespace:
    return SimpleNamespace(
        stop_reason="end_turn", content=[SimpleNamespace(type="text", text=text)], usage=_chat_usage()
    )


def _tool_resp(name: str) -> SimpleNamespace:
    return SimpleNamespace(
        stop_reason="tool_use",
        content=[SimpleNamespace(type="tool_use", name=name, input={}, id="toolu_1")],
        usage=_chat_usage(),
    )


class _FakeMessageStream:
    """Le contexte streamé minimal — LA MÊME réponse qu'avant ce lot, livrée
    par `.stream()` au lieu de `.create()` (LOT STREAM, 12/09/2026)."""

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


class _FakeClient:
    def __init__(self, responses):
        self._responses = list(responses)

    @property
    def messages(self):
        return self

    def stream(self, **_kwargs):
        return _FakeMessageStream(self._responses.pop(0))


@pytest.mark.asyncio
async def test_un_tour_de_copilote_est_une_trace_avec_ses_spans(monkeypatch):
    _enable(monkeypatch)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _p: _DummyThrottle())
    monkeypatch.setattr(
        chat_orchestrator.anthropic,
        "AsyncAnthropic",
        lambda **_kw: _FakeClient([_tool_resp("compare_accounts"), _text_resp("Voilà.")]),
    )
    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", AsyncMock(return_value={"ok": True}))

    reply, actions = await chat_orchestrator.run_chat_with_tools(
        "sys", "user", user_id="u1", profile_data=None
    )

    assert reply == "Voilà."
    traces = _bodies("trace-create")
    # UNE trace pour le tour — comptée par son identifiant, pas par le nombre
    # d'événements : la trace est ré-émise sous le MÊME id quand son issue est
    # connue (upsert Langfuse), comme pour `update_current_trace`.
    assert len({t["id"] for t in traces}) == 1
    assert traces[0]["name"] == "chat_turn"
    assert traces[0]["userId"] == "u1"
    # L'issue du tour — la métadonnée « outcome vérifié » des exigences
    # d'observabilité. Un outil a été exécuté : le tour a AGI.
    assert traces[-1]["metadata"]["outcome"] == "acted"
    # Les deux allers-retours Anthropic sont des générations DANS la trace.
    gens = _bodies("generation-create")
    assert len(gens) == 2
    assert {g["traceId"] for g in gens} == {traces[0]["id"]}
    # L'exécution de l'outil est un span nommé — c'est lui qui dit où part le
    # temps d'un tour (la panne du 15-16/08 n'avait laissé aucune trace).
    spans = _bodies("span-create")
    assert [s["name"] for s in spans] == ["tool:compare_accounts"]
    assert spans[0]["traceId"] == traces[0]["id"]


@pytest.mark.asyncio
async def test_le_tour_de_copilote_porte_la_version_du_prompt_advisor(monkeypatch):
    """Défaut A : une réponse doit dire quel prompt l'a produite.

    Le système du copilote est TOUJOURS le prompt `advisor` (`chat.py` construit
    `system` via `bellum_advisor.build_system_prompt` avant d'appeler
    `run_chat_with_tools`) — donc la trace `chat_turn` porte son empreinte, la
    même que celle stampée dans la réponse HTTP (`chat.py:313`). Le test relit
    l'événement ``trace-create`` réellement mis en file, pas le fait qu'une
    fonction a été appelée.
    """
    _enable(monkeypatch)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _p: _DummyThrottle())
    monkeypatch.setattr(
        chat_orchestrator.anthropic,
        "AsyncAnthropic",
        lambda **_kw: _FakeClient([_text_resp("Voilà.")]),
    )

    reply, _actions = await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None)

    assert reply == "Voilà."
    traces = _bodies("trace-create")
    assert traces, "aucune trace émise — la génération n'a pas déclenché l'émission"
    expected = prompt_version_for("advisor")
    assert expected is not None
    assert traces[-1]["metadata"]["prompt_version"] == expected


# ── run d'analyse → trace + span par phase ────────────────────────────────────


@pytest.mark.asyncio
async def test_une_phase_du_graphe_est_un_span(monkeypatch):
    from app.graph.builder import _with_phase_timeout

    _enable(monkeypatch)

    async def node(_state):
        lf.record_generation(name="bellum_facts", model="m", input_tokens=1, output_tokens=1)
        return {"ok": True}

    with lf.bind_trace("analysis_run"):
        result = await _with_phase_timeout("phase_research", node)({})

    assert result == {"ok": True}
    spans = _bodies("span-create")
    assert [s["name"] for s in spans] == ["phase_research"]
    traces = _bodies("trace-create")
    assert spans[0]["traceId"] == traces[0]["id"]


@pytest.mark.asyncio
async def test_une_phase_en_timeout_marque_son_span_en_erreur(monkeypatch):
    from app.graph.builder import PHASE_TIMEOUTS_S, _with_phase_timeout

    _enable(monkeypatch)
    monkeypatch.setitem(PHASE_TIMEOUTS_S, "phase_research", 0.05)

    async def node(_state):
        await asyncio.sleep(5)

    with lf.bind_trace("analysis_run"):
        result = await _with_phase_timeout("phase_research", node)({})

    assert result["error"]["code"] == "PHASE_TIMEOUT"
    spans = _bodies("span-create")
    assert len(spans) == 1
    assert spans[0]["level"] == "ERROR"


@pytest.mark.asyncio
async def test_stream_analysis_graph_ouvre_la_trace_du_run(monkeypatch):
    from app.graph import builder

    _enable(monkeypatch)

    class _StubGraph:
        async def astream(self, _inputs, config=None, stream_mode=None):
            # Simule l'appel Claude d'une phase : la génération doit atterrir
            # DANS la trace du run, pas dans une trace orpheline.
            lf.record_generation(name="bellum_facts", model="m", input_tokens=1, output_tokens=1)
            yield {"phase_research": {"envelopes": [], "research": {}}}

        async def aget_state(self, _config):
            return SimpleNamespace(values={})

    events = [ev async for ev in builder.stream_analysis_graph({}, thread_id="t-1", graph=_StubGraph())]

    assert events  # le flux a produit au moins un événement de phase
    traces = _bodies("trace-create")
    assert len(traces) == 1
    assert traces[0]["name"] == "analysis_run"
    assert traces[0]["metadata"]["thread_id"] == "t-1"
    gens = _bodies("generation-create")
    assert gens and gens[0]["traceId"] == traces[0]["id"]
