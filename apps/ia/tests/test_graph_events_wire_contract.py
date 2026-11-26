"""Wire-contract guard for the /graph/analyze SSE event stream.

Why this file exists: ``data`` was declared ``z.record(z.unknown())`` on the
NestJS side — one opaque bag for seven events with seven different payloads — so
the two sides could disagree about a payload's shape and nothing anywhere would
notice. They did disagree: ``phase_failed`` splatted its error object flat AS
``data`` while ``run_failed`` nested it UNDER ``data.error``, the worker knew only
the nested spelling, and every ``phase_failed`` therefore rendered as the literal
string ``"<phase> failed"``. A hard Anthropic 400 reached customers as the word
"Erreur", for days, with every suite green on both sides.

The fix is a single shared artefact rather than two parallel assertions — the
same pattern as ``test_companies_wire_contract.py`` and the ``registryId`` casing
bug that motivated it. ``packages/contracts/src/fixtures/graph-events.ia.json``
holds the RAW frames this producer emits; this module pins the live output to
that file, and ``packages/contracts/src/schemas/graph-events.fixtures.test.ts``
strict-parses the same file against the discriminated union. Move a field on
either side and the OTHER language's suite goes red.

Volatile values (durations, costs, correlation-scoped provider metrics) are
normalised out by ``_stable`` — the fixture pins SHAPE, which is the thing that
broke, not measurements that legitimately differ per run.
"""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

import pytest
from langgraph.checkpoint.memory import MemorySaver

import app.graph.nodes as nodes
from app.graph.builder import build_analysis_graph, stream_analysis_graph
from app.models.agent_envelope import AgentStatus
from app.models.contacts import ContactsResponse
from app.models.plan import PlanResponse
from app.models.research import ResearchResponse

# apps/ia/tests/<this file> → parents[3] is the monorepo root.
_FIXTURE = Path(__file__).resolve().parents[3] / "packages" / "contracts" / "src" / "fixtures" / "graph-events.ia.json"

# Values that legitimately differ between two identical runs. The fixture pins
# the shape of the stream, not the stopwatch.
_VOLATILE_NUMERIC = {
    "duration_ms",
    "total_duration_ms",
    "cost_usd",
    "total_cost_usd",
    "total_llm_cost_usd",
    "input_tokens",
    "output_tokens",
    "cache_read_input_tokens",
    "cache_creation_input_tokens",
    "total_input_tokens",
    "total_output_tokens",
    "total_cache_read_input_tokens",
    "total_cache_creation_input_tokens",
}


def _stable(value: Any) -> Any:
    """Zero out per-run measurements so the fixture pins shape, not timing."""
    if isinstance(value, dict):
        return {k: (0 if k in _VOLATILE_NUMERIC and isinstance(v, int | float) else _stable(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [_stable(v) for v in value]
    return value


def _classify(status: AgentStatus, contacts: list[dict] | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        status=status,
        data=SimpleNamespace(model_dump=lambda **_k: {"contacts": contacts or []})
        if status == AgentStatus.SUCCESS
        else None,
        error=SimpleNamespace(
            code="CLAUDE_BAD_REQUEST",
            message="Analyse impossible : le modèle a refusé la requête.",
            user_message="Analyse impossible : le modèle a refusé la requête.",
            debug_message="400 'temperature' is deprecated for this model",
        ),
        meta=None,
    )


@pytest.fixture
def ok_phases(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        nodes,
        "_research",
        AsyncMock(return_value=ResearchResponse(data={"businessDescription": "Banque", "executives": []})),
    )
    monkeypatch.setattr(nodes, "_contacts", AsyncMock(return_value=ContactsResponse(data={"contacts": []})))
    monkeypatch.setattr(nodes, "_plan", AsyncMock(return_value=PlanResponse(data={"actionPlan": {"strategy": "S"}})))
    monkeypatch.setattr(nodes, "prefetch_apollo_hits", AsyncMock(return_value=[]))

    class _Cls:
        run = AsyncMock(return_value=_classify(AgentStatus.SUCCESS, [{"fullName": "A"}]))

    monkeypatch.setattr(nodes, "ClassifierAgent", _Cls)


async def _collect(company: str, thread: str) -> list[dict[str, Any]]:
    graph = build_analysis_graph(checkpointer=MemorySaver(), judge=False)
    return [
        _stable(json.loads(event.model_dump_json()))
        async for event in stream_analysis_graph(
            {"company_name": company, "profile_data": {}}, thread_id=thread, graph=graph
        )
    ]


def _expected(key: str) -> list[dict[str, Any]]:
    return json.loads(_FIXTURE.read_text(encoding="utf-8"))[key]


def test_fixture_is_reachable_from_the_ia_package() -> None:
    """A moved/renamed fixture must fail loudly here rather than silently skip
    the guards below."""
    assert _FIXTURE.is_file(), f"shared wire fixture not found at {_FIXTURE}"


@pytest.mark.asyncio
async def test_successful_run_matches_the_shared_wire_fixture(ok_phases: None) -> None:
    """The happy path: four ``phase_completed`` frames then ``run_completed``.

    Pins that every ``phase_completed`` carries BOTH ``telemetry`` and ``output``
    — ``output`` is what the worker persists, so its silent disappearance would
    empty a dossier while still marking the phase done.
    """
    assert await _collect("Wire", "wire-ok") == _expected("run_completed")


@pytest.mark.asyncio
async def test_failed_run_matches_the_shared_wire_fixture(monkeypatch: pytest.MonkeyPatch, ok_phases: None) -> None:
    """The path that lost the outage.

    Pins the error PLACEMENT on both failure events: ``phase_failed`` nests under
    ``data.error`` (since 2b1d3fe1) and so does the terminal ``run_failed``. If a
    future edit splats either one flat again, this test fails HERE — in the
    producer's own suite — instead of surfacing months later as a customer
    reading the word "Erreur".
    """

    class _Cls:
        run = AsyncMock(return_value=_classify(AgentStatus.TERMINAL_FAILURE))

    monkeypatch.setattr(nodes, "ClassifierAgent", _Cls)

    assert await _collect("Wire", "wire-fail") == _expected("run_failed")


@pytest.mark.asyncio
async def test_every_failure_frame_names_a_cause(monkeypatch: pytest.MonkeyPatch, ok_phases: None) -> None:
    """The invariant the TS union enforces, asserted at the source too.

    A failure event whose error carries no non-empty ``message`` is exactly what
    rendered as "classify failed". The union rejects it; this makes the producer
    prove it never emits one.
    """

    class _Cls:
        run = AsyncMock(return_value=_classify(AgentStatus.TERMINAL_FAILURE))

    monkeypatch.setattr(nodes, "ClassifierAgent", _Cls)

    frames = await _collect("Wire", "wire-cause")
    failures = [f for f in frames if f["type"] in {"phase_failed", "run_failed"}]
    assert failures, "expected the run to emit at least one failure frame"
    for frame in failures:
        error = frame["data"]["error"]
        assert isinstance(error, dict), f"{frame['type']} must nest its error under data.error"
        assert error.get("message", "").strip(), f"{frame['type']} carries no readable message: {error}"
        assert error.get("code", "").strip(), f"{frame['type']} carries no greppable code: {error}"
