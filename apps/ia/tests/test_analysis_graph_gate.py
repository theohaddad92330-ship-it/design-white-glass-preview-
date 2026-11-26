"""Research go/no-go gate + conditional value-routing (v2, increment 5).

The gate is deterministic: ``no_go`` only when research didn't identify the
company (no business description and no sector). A no_go early-exits the graph
after research, before spending on contacts/classify/plan.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from langgraph.checkpoint.memory import MemorySaver

import app.graph.nodes as nodes
from app.graph.builder import build_analysis_graph, run_analysis_graph, stream_analysis_graph
from app.graph.gate import evaluate_research_gate
from app.models.agent_envelope import AgentStatus
from app.models.contacts import ContactsResponse
from app.models.plan import PlanResponse
from app.models.research import ResearchResponse


def test_gate_go_when_company_identified() -> None:
    g = evaluate_research_gate({"businessDescription": "Banque", "recentSignals": [1], "executives": [1]})
    assert g["decision"] == "go"
    assert g["score"] == 3
    assert g["reasons"] == []


def test_gate_go_on_sector_only() -> None:
    assert evaluate_research_gate({"sector": "Banque"})["decision"] == "go"


def test_gate_no_go_when_company_not_identified() -> None:
    g = evaluate_research_gate({"recentSignals": [], "executives": []})
    assert g["decision"] == "no_go"
    assert g["reasons"]


def _mocks(monkeypatch, research_data: dict):
    research = AsyncMock(return_value=ResearchResponse(data=research_data))
    contacts = AsyncMock(return_value=ContactsResponse(data={"contacts": []}))
    plan = AsyncMock(return_value=PlanResponse(data={"actionPlan": {}}))

    class _Cls:
        run = AsyncMock(
            return_value=SimpleNamespace(
                status=AgentStatus.SUCCESS,
                data=SimpleNamespace(model_dump=lambda **_k: {"contacts": []}),
                error=None,
                meta=None,
            )
        )

    monkeypatch.setattr(nodes, "_research", research)
    monkeypatch.setattr(nodes, "_contacts", contacts)
    monkeypatch.setattr(nodes, "_plan", plan)
    monkeypatch.setattr(nodes, "ClassifierAgent", _Cls)
    return SimpleNamespace(research=research, contacts=contacts, plan=plan, classifier=_Cls)


@pytest.mark.asyncio
async def test_no_go_early_exits_before_downstream(monkeypatch) -> None:
    m = _mocks(monkeypatch, {"recentSignals": []})  # no business → no_go
    graph = build_analysis_graph(checkpointer=MemorySaver())

    final = await run_analysis_graph({"company_name": "??", "profile_data": {}}, thread_id="g-1", graph=graph)

    assert final["gate"]["decision"] == "no_go"
    assert final.get("error") is None  # not a failure — a deliberate stop
    m.contacts.assert_not_awaited()
    m.plan.assert_not_awaited()
    m.classifier.run.assert_not_awaited()


@pytest.mark.asyncio
async def test_go_runs_all_phases(monkeypatch) -> None:
    m = _mocks(monkeypatch, {"businessDescription": "Banque"})
    graph = build_analysis_graph(checkpointer=MemorySaver())

    final = await run_analysis_graph({"company_name": "X", "profile_data": {}}, thread_id="g-2", graph=graph)

    assert final["gate"]["decision"] == "go"
    m.contacts.assert_awaited_once()
    m.plan.assert_awaited_once()


@pytest.mark.asyncio
async def test_no_go_stream_ends_with_run_skipped(monkeypatch) -> None:
    _mocks(monkeypatch, {"recentSignals": []})
    graph = build_analysis_graph(checkpointer=MemorySaver())

    events = [e async for e in stream_analysis_graph({"company_name": "??", "profile_data": {}}, thread_id="g-3", graph=graph)]
    types = [e.type for e in events]
    assert types == ["phase_completed", "run_skipped"]
    assert events[-1].data["gate"]["decision"] == "no_go"
