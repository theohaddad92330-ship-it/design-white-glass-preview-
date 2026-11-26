"""Typed event streaming (v2, increment 3).

stream_analysis_graph drives astream(stream_mode="updates") and yields a typed
GraphEvent per phase plus a terminal run_completed/run_failed carrying the
telemetry summary. Resume re-runs emit phase_skipped for completed phases.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from langgraph.checkpoint.memory import MemorySaver

import app.graph.nodes as nodes
from app.graph.builder import build_analysis_graph, stream_analysis_graph
from app.models.agent_envelope import AgentStatus
from app.models.contacts import ContactsResponse
from app.models.plan import PlanResponse
from app.models.research import ResearchResponse


def _classify(status: AgentStatus, contacts: list[dict] | None = None):
    return SimpleNamespace(
        status=status,
        data=SimpleNamespace(model_dump=lambda **_k: {"contacts": contacts or []}) if status == AgentStatus.SUCCESS else None,
        error=SimpleNamespace(debug_message="boom"),
        meta=None,
    )


@pytest.fixture
def ok_phases(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        nodes,
        "_research",
        AsyncMock(return_value=ResearchResponse(data={"businessDescription": "Banque", "executives": []})),
    )
    monkeypatch.setattr(nodes, "_contacts", AsyncMock(return_value=ContactsResponse(data={"contacts": []})))
    monkeypatch.setattr(nodes, "_plan", AsyncMock(return_value=PlanResponse(data={"actionPlan": {"strategy": "S"}})))
    # research_node concurrently prefetches Apollo hits — stub it (no network).
    monkeypatch.setattr(nodes, "prefetch_apollo_hits", AsyncMock(return_value=[]))

    class _Cls:
        run = AsyncMock(return_value=_classify(AgentStatus.SUCCESS, [{"fullName": "A"}]))

    monkeypatch.setattr(nodes, "ClassifierAgent", _Cls)


async def _collect(gen):
    return [e async for e in gen]


@pytest.mark.asyncio
async def test_stream_emits_phase_then_run_completed(ok_phases) -> None:
    graph = build_analysis_graph(checkpointer=MemorySaver(), judge=False)
    events = await _collect(
        stream_analysis_graph({"company_name": "X", "profile_data": {}}, thread_id="s-1", graph=graph)
    )

    assert [(e.type, e.phase) for e in events] == [
        ("phase_completed", "research"),
        ("phase_completed", "contacts"),
        ("phase_completed", "classify"),
        ("phase_completed", "plan"),
        ("run_completed", None),
    ]
    # Progress climbs and the terminal event carries the telemetry summary.
    assert [e.progress for e in events] == [25, 50, 75, 100, 100]
    assert "summary" in events[-1].data
    assert events[-1].data["summary"]["phases"]


@pytest.mark.asyncio
async def test_stream_emits_failure_events(monkeypatch, ok_phases) -> None:
    class _Cls:
        run = AsyncMock(return_value=_classify(AgentStatus.TERMINAL_FAILURE))

    monkeypatch.setattr(nodes, "ClassifierAgent", _Cls)
    graph = build_analysis_graph(checkpointer=MemorySaver(), judge=False)

    events = await _collect(
        stream_analysis_graph({"company_name": "X", "profile_data": {}}, thread_id="s-2", graph=graph)
    )
    types = [e.type for e in events]
    assert "phase_failed" in types
    assert types[-1] == "run_failed"
    failed = next(e for e in events if e.type == "phase_failed")
    assert failed.phase == "classify"
    # plan never completed.
    assert not any(e.type == "phase_completed" and e.phase == "plan" for e in events)


@pytest.mark.asyncio
async def test_phase_failed_nests_the_error_like_run_failed(monkeypatch, ok_phases) -> None:
    """``phase_failed`` must carry the cause under ``data["error"]``.

    Regression: it used to splat the error dict FLAT into ``data`` while
    ``run_failed`` nested it under ``data["error"]``. The NestJS worker reads
    ``ev.data.error?.message`` for both, so the flat shape made the lookup
    undefined and every failure fell back to the generic phase name — that is
    the literal source of the useless production message
    ``"Analysis failed in phase research: research failed"``.

    ``phase_failed`` is emitted DURING the stream and the worker throws on it
    immediately, so it always wins the race against the (correctly-shaped)
    terminal ``run_failed`` — the real cause was never reachable.
    """

    class _Cls:
        run = AsyncMock(return_value=_classify(AgentStatus.TERMINAL_FAILURE))

    monkeypatch.setattr(nodes, "ClassifierAgent", _Cls)
    graph = build_analysis_graph(checkpointer=MemorySaver(), judge=False)

    events = await _collect(
        stream_analysis_graph({"company_name": "X", "profile_data": {}}, thread_id="s-nested", graph=graph)
    )

    failed = next(e for e in events if e.type == "phase_failed")
    run_failed = next(e for e in events if e.type == "run_failed")

    # Both terminals expose the cause at the SAME path the worker reads.
    assert failed.data["error"]["message"] == "boom"
    assert failed.data["error"]["phase"] == "classify"
    assert run_failed.data["error"]["message"] == "boom"
    # And the flat leak is gone: the error's OWN fields must not also sit at the
    # top level, which is what made the worker's `data.error.message` lookup miss.
    # `summary` is a separate payload (the run's telemetry, added so a mid-phase
    # death still reports which upstream broke), not a leaked error field.
    assert not {"message", "code", "phase", "user_message", "debug_message"} & set(failed.data)
    assert set(failed.data) == {"error", "summary"}


@pytest.mark.asyncio
async def test_resume_stream_emits_phase_skipped(monkeypatch, ok_phases) -> None:
    # First run fails at classify, then resume.
    fail_then_ok = AsyncMock(
        side_effect=[_classify(AgentStatus.TERMINAL_FAILURE), _classify(AgentStatus.SUCCESS, [{"fullName": "A"}])]
    )

    class _Cls:
        run = fail_then_ok

    monkeypatch.setattr(nodes, "ClassifierAgent", _Cls)
    graph = build_analysis_graph(checkpointer=MemorySaver(), judge=False)

    await _collect(stream_analysis_graph({"company_name": "X", "profile_data": {}}, thread_id="s-3", graph=graph))
    resume_events = await _collect(
        stream_analysis_graph({"error": None, "failed_phase": None}, thread_id="s-3", graph=graph)
    )

    skipped = [e.phase for e in resume_events if e.type == "phase_skipped"]
    assert "research" in skipped and "contacts" in skipped
    assert any(e.type == "phase_completed" and e.phase == "plan" for e in resume_events)
    assert resume_events[-1].type == "run_completed"
