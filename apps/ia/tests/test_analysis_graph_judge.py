"""Anti-hallucination Judge node (v2) — always in the graph (advisory).

Two layers:
  * unit — ``build_verdict`` / ``judge_node`` over hand-built state: a fabricated
    (unsourced) fact is FLAGGED critical, a well-sourced dossier passes, the
    verdict shape is stable, and nothing is ever mutated/dropped.
  * wiring — flag OFF ⇒ the graph is identical (no ``phase_judge`` node); flag ON
    ⇒ the judge runs after plan, records the verdict on state, emits a
    ``judge_completed`` event, and NEVER blocks completion (run still completes).
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from langgraph.checkpoint.memory import MemorySaver

import app.graph.nodes as nodes
from app.graph.builder import build_analysis_graph, run_analysis_graph, stream_analysis_graph
from app.graph.judge import build_verdict, judge_node
from app.models.agent_envelope import AgentStatus
from app.models.contacts import ContactsResponse
from app.models.plan import PlanResponse
from app.models.research import ResearchResponse

# ── state fixtures ─────────────────────────────────────────────────────────────

_SOURCED_RESEARCH = {
    "businessDescription": "Banque de détail",
    "revenue": "1,2 Md€",
    "sector": "Banque",
    "sources": {"tags": {"revenue": "PUBLIC", "sector": "PUBLIC"}, "citations": {}},
    "confidence": {"score": 82},
}
_FABRICATED_RESEARCH = {
    "businessDescription": "Banque de détail",
    "revenue": "1,2 Md€",  # displayed but sources.tags does NOT back it → hallucination
    "sector": "Banque",
    "sources": {"tags": {}, "citations": {}},
    "confidence": {"score": 82},
}
_REAL_CONTACTS = [{"fullName": "Hélène Bernard", "title": "DSI"}]


def _state(research: dict, *, contacts=None, plan=None, gate=None) -> dict:
    return {
        "research": research,
        "classified_contacts": contacts if contacts is not None else _REAL_CONTACTS,
        "plan": plan or {"actionPlan": {"strategy": "S", "phases": []}},
        "gate": gate or {"decision": "go", "score": 3},
    }


# ── unit: build_verdict ─────────────────────────────────────────────────────────


def test_flags_a_fabricated_fact_without_source() -> None:
    verdict = build_verdict(_state(_FABRICATED_RESEARCH))
    assert verdict["passed"] is False
    assert verdict["verdict"] == "flagged"
    flagged = [i for i in verdict["issues"] if i["type"] == "fact_without_source"]
    assert flagged and flagged[0]["severity"] == "critical"
    # The unsourced fields are named — and the fact is FLAGGED, never removed.
    assert "revenue" in flagged[0]["detail"]
    assert verdict["confidence"] < 1.0


def test_passes_a_well_sourced_output() -> None:
    verdict = build_verdict(_state(_SOURCED_RESEARCH))
    assert verdict["passed"] is True
    assert verdict["verdict"] == "pass"
    assert verdict["issues"] == []
    assert verdict["confidence"] == 1.0
    assert verdict["researchConfidence"] == 82


def test_verdict_shape_is_stable() -> None:
    verdict = build_verdict(_state(_FABRICATED_RESEARCH))
    assert set(verdict) == {"issues", "confidence", "passed", "verdict", "checks", "researchConfidence"}
    assert isinstance(verdict["confidence"], float)
    assert isinstance(verdict["passed"], bool)
    assert verdict["checks"] == ["grounding", "scores", "coherence", "contacts", "provenance", "freshness"]
    for issue in verdict["issues"]:
        assert set(issue) == {"type", "severity", "detail", "phase"}
        assert issue["severity"] in {"critical", "warning"}


def test_does_not_mutate_input_state() -> None:
    state = _state(_FABRICATED_RESEARCH)
    before = {k: (v.copy() if hasattr(v, "copy") else v) for k, v in state.items()}
    build_verdict(state)
    # No fact deleted, no contact dropped — the judge only reads.
    assert state["research"] == before["research"]
    assert state["classified_contacts"] == before["classified_contacts"]


def test_flags_plan_contact_absent_from_dossier() -> None:
    plan = {"actionPlan": {"phases": [{"actions": [{"contact": "Jean Fantôme", "step": "call"}]}]}}
    verdict = build_verdict(_state(_SOURCED_RESEARCH, plan=plan))
    invented = [i for i in verdict["issues"] if i["type"] == "contact_not_in_dossier"]
    assert invented and invented[0]["severity"] == "critical"
    assert verdict["passed"] is False


def test_plan_placeholder_contact_is_allowed() -> None:
    plan = {"actionPlan": {"phases": [{"actions": [{"contact": "À identifier", "step": "map"}]}]}}
    verdict = build_verdict(_state(_SOURCED_RESEARCH, plan=plan))
    assert not [i for i in verdict["issues"] if i["type"] == "contact_not_in_dossier"]


def test_known_plan_contact_is_not_flagged() -> None:
    plan = {"actionPlan": {"phases": [{"actions": [{"contact": "Hélène Bernard", "step": "call"}]}]}}
    verdict = build_verdict(_state(_SOURCED_RESEARCH, plan=plan))
    assert not [i for i in verdict["issues"] if i["type"] == "contact_not_in_dossier"]


def test_out_of_range_confidence_is_flagged_warning() -> None:
    research = {**_SOURCED_RESEARCH, "confidence": {"score": 140}}
    verdict = build_verdict(_state(research))
    warns = [i for i in verdict["issues"] if i["type"] == "score_out_of_range"]
    assert warns and warns[0]["severity"] == "warning"
    # A warning alone does not fail the dossier.
    assert verdict["passed"] is True


def test_empty_contacts_flag_is_warning_only() -> None:
    verdict = build_verdict(_state(_SOURCED_RESEARCH, contacts=[]))
    assert [i for i in verdict["issues"] if i["type"] == "no_contacts"]
    assert verdict["passed"] is True  # thin, but not a hallucination


def test_placeholder_contact_flagged_suspect() -> None:
    verdict = build_verdict(_state(_SOURCED_RESEARCH, contacts=[{"fullName": "  "}, {"fullName": "N/A"}]))
    suspect = [i for i in verdict["issues"] if i["type"] == "suspect_contact"]
    assert suspect and suspect[0]["severity"] == "warning"


# ── unit: judge_node ────────────────────────────────────────────────────────────


async def test_judge_node_writes_verdict_and_zero_cost_envelope() -> None:
    out = await judge_node(_state(_SOURCED_RESEARCH))
    assert out["judge"]["passed"] is True
    assert out["completed"] == ["judge"]
    env = out["envelopes"][0]
    assert env["phase"] == "judge" and env["ok"] is True
    assert env["cost_usd"] == 0 and env["input_tokens"] == 0  # deterministic, no Claude call


async def test_judge_node_short_circuits_when_already_judged() -> None:
    out = await judge_node({**_state(_SOURCED_RESEARCH), "completed": ["judge"]})
    assert out == {}


async def test_judge_node_never_sets_error_even_on_critical() -> None:
    out = await judge_node(_state(_FABRICATED_RESEARCH))
    assert out["judge"]["passed"] is False
    assert "error" not in out and "failed_phase" not in out  # advisory, never blocks


# ── wiring: judge is the product default (ON); judge=False = legacy topology ─────


def test_default_graph_has_judge_node() -> None:
    graph = build_analysis_graph()  # no arg → product default (judge on)
    assert "phase_judge" in set(graph.get_graph().nodes.keys())


def test_explicit_judge_false_has_no_judge_node() -> None:
    graph = build_analysis_graph(judge=False)
    assert "phase_judge" not in set(graph.get_graph().nodes.keys())


def test_explicit_judge_true_adds_judge_node() -> None:
    graph = build_analysis_graph(judge=True)
    assert "phase_judge" in set(graph.get_graph().nodes.keys())


# ── wiring: flag ON end-to-end ──────────────────────────────────────────────────


def _patch_phases(monkeypatch: pytest.MonkeyPatch, research: dict, contacts: list[dict]):
    monkeypatch.setattr(nodes, "_research", AsyncMock(return_value=ResearchResponse(data=research)))
    monkeypatch.setattr(nodes, "_contacts", AsyncMock(return_value=ContactsResponse(data={"contacts": contacts})))
    monkeypatch.setattr(nodes, "_plan", AsyncMock(return_value=PlanResponse(data={"actionPlan": {"strategy": "S"}})))

    class _Cls:
        run = AsyncMock(
            return_value=SimpleNamespace(
                status=AgentStatus.SUCCESS,
                data=SimpleNamespace(model_dump=lambda **_k: {"contacts": contacts}),
                error=None,
                meta=None,
            )
        )

    monkeypatch.setattr(nodes, "ClassifierAgent", _Cls)


async def test_run_records_judge_verdict_on_state(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_phases(monkeypatch, _SOURCED_RESEARCH, _REAL_CONTACTS)
    graph = build_analysis_graph(checkpointer=MemorySaver(), judge=True)
    final = await run_analysis_graph({"company_name": "X", "profile_data": {}}, thread_id="j-1", graph=graph)
    assert final["judge"]["passed"] is True
    assert final.get("error") is None  # judge never fails the run


async def test_run_flags_but_completes_on_fabricated_fact(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_phases(monkeypatch, _FABRICATED_RESEARCH, _REAL_CONTACTS)
    graph = build_analysis_graph(checkpointer=MemorySaver(), judge=True)
    final = await run_analysis_graph({"company_name": "X", "profile_data": {}}, thread_id="j-2", graph=graph)
    assert final["judge"]["passed"] is False
    assert any(i["type"] == "fact_without_source" for i in final["judge"]["issues"])
    # Non-blocking: the plan is still present, the run did NOT fail.
    assert final["plan"]["actionPlan"]["strategy"] == "S"
    assert final.get("error") is None


async def test_stream_emits_judge_completed_after_plan(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_phases(monkeypatch, _SOURCED_RESEARCH, _REAL_CONTACTS)
    graph = build_analysis_graph(checkpointer=MemorySaver(), judge=True)
    events = [
        e async for e in stream_analysis_graph({"company_name": "X", "profile_data": {}}, thread_id="j-3", graph=graph)
    ]
    types = [e.type for e in events]
    assert types == [
        "phase_completed",  # research
        "phase_completed",  # contacts
        "phase_completed",  # classify
        "phase_completed",  # plan
        "judge_completed",
        "run_completed",
    ]
    judge_ev = next(e for e in events if e.type == "judge_completed")
    assert judge_ev.data["judge"]["passed"] is True
    assert judge_ev.progress == 100


async def test_flag_off_stream_has_no_judge_event(monkeypatch: pytest.MonkeyPatch) -> None:
    _patch_phases(monkeypatch, _SOURCED_RESEARCH, _REAL_CONTACTS)
    graph = build_analysis_graph(checkpointer=MemorySaver(), judge=False)
    events = [
        e async for e in stream_analysis_graph({"company_name": "X", "profile_data": {}}, thread_id="j-4", graph=graph)
    ]
    assert "judge_completed" not in [e.type for e in events]
    assert "judge" not in (
        await run_analysis_graph({"company_name": "X", "profile_data": {}}, thread_id="j-5", graph=graph)
    )
