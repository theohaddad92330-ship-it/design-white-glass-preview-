"""Checkpointer + resume semantics (v2, increment 2).

The checkpointer persists state after every phase, so a run that failed
mid-pipeline can be resumed: completed phases short-circuit on their ``completed``
marker and only the failed phase + downstream re-run. Verified in-process with a
``MemorySaver`` (the Postgres saver is a drop-in storage backend).
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from langgraph.checkpoint.memory import MemorySaver

import app.graph.nodes as nodes
from app.graph.builder import (
    build_analysis_graph,
    get_analysis_state,
    resume_analysis_graph,
    run_analysis_graph,
)
from app.graph.checkpoint import make_checkpointer, pg_url
from app.models.agent_envelope import AgentStatus
from app.models.contacts import ContactsResponse
from app.models.plan import PlanResponse
from app.models.research import ResearchResponse


def _classify_env(status: AgentStatus, contacts: list[dict] | None = None):
    class _Data:
        def model_dump(self, **_kw):
            return {"contacts": contacts or []}

    return SimpleNamespace(
        status=status,
        data=_Data() if status == AgentStatus.SUCCESS else None,
        error=SimpleNamespace(debug_message="classify boom"),
    )


@pytest.fixture
def phase_mocks(monkeypatch: pytest.MonkeyPatch):
    research = AsyncMock(
        return_value=ResearchResponse(
            data={"businessDescription": "Banque", "executives": [{"first_name": "A", "last_name": "B", "role": "DG"}]}
        )
    )
    contacts = AsyncMock(return_value=ContactsResponse(data={"contacts": [{"fullName": "A B"}]}))
    plan = AsyncMock(return_value=PlanResponse(data={"actionPlan": {"strategy": "S"}}))

    # Classifier fails on the first run, succeeds on resume.
    class _Cls:
        run = AsyncMock(
            side_effect=[
                _classify_env(AgentStatus.TERMINAL_FAILURE),
                _classify_env(AgentStatus.SUCCESS, [{"fullName": "A B", "decisionRole": "economic"}]),
            ]
        )

    monkeypatch.setattr(nodes, "_research", research)
    monkeypatch.setattr(nodes, "_contacts", contacts)
    monkeypatch.setattr(nodes, "_plan", plan)
    monkeypatch.setattr(nodes, "ClassifierAgent", _Cls)
    # research_node concurrently prefetches Apollo hits — stub it (no network).
    monkeypatch.setattr(nodes, "prefetch_apollo_hits", AsyncMock(return_value=[]))
    return SimpleNamespace(research=research, contacts=contacts, plan=plan, classifier=_Cls)


@pytest.mark.asyncio
async def test_make_checkpointer_falls_back_to_memory_without_url(monkeypatch) -> None:
    monkeypatch.delenv("LANGGRAPH_PG_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    assert pg_url() is None
    async with make_checkpointer() as cp:
        assert isinstance(cp, MemorySaver)


@pytest.mark.asyncio
async def test_pg_url_prefers_langgraph_specific_var(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://db/app")
    monkeypatch.setenv("LANGGRAPH_PG_URL", "postgresql://db/checkpoints")
    assert pg_url() == "postgresql://db/checkpoints"


@pytest.mark.asyncio
async def test_resume_skips_completed_phases_and_reruns_from_failure(phase_mocks) -> None:
    graph = build_analysis_graph(checkpointer=MemorySaver(), judge=False)
    thread = "resume-1"

    # Run 1: research + contacts succeed, classify fails terminally → early-exit.
    first = await run_analysis_graph({"company_name": "X", "profile_data": {}}, thread_id=thread, graph=graph)
    assert first["failed_phase"] == "classify"
    assert first.get("plan") is None
    assert set(first["completed"]) == {"research", "contacts"}
    assert phase_mocks.research.await_count == 1
    assert phase_mocks.contacts.await_count == 1

    # Resume: research + contacts must NOT re-run; classify retries and succeeds,
    # then plan runs.
    resumed = await resume_analysis_graph(thread, graph=graph)
    assert resumed.get("error") is None
    assert resumed["classified_contacts"][0]["decisionRole"] == "economic"
    assert resumed["plan"]["actionPlan"]["strategy"] == "S"
    assert set(resumed["completed"]) == {"research", "contacts", "classify", "plan"}

    # The expensive upstream phases ran exactly once across both invocations.
    assert phase_mocks.research.await_count == 1
    assert phase_mocks.contacts.await_count == 1
    assert phase_mocks.plan.await_count == 1
    assert phase_mocks.classifier.run.await_count == 2  # fail + retry


@pytest.mark.asyncio
async def test_get_analysis_state_returns_persisted_values(phase_mocks) -> None:
    graph = build_analysis_graph(checkpointer=MemorySaver(), judge=False)
    thread = "inspect-1"
    await run_analysis_graph({"company_name": "X", "profile_data": {}}, thread_id=thread, graph=graph)

    state = await get_analysis_state(thread, graph=graph)
    assert state["research"]["businessDescription"] == "Banque"
    assert "contacts" in state["completed"]
    # A thread that was never run returns an empty dict.
    assert await get_analysis_state("never-ran", graph=graph) == {}
