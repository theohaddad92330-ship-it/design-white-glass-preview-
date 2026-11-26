"""Typed progress events streamed from the analysis graph.

The graph emits a ``GraphEvent`` as each phase completes/skips/fails plus a
terminal ``run_completed``/``run_failed`` carrying the telemetry summary. A
transport (SSE endpoint, or the BullMQ worker forwarding to the Socket.IO
gateway) serialises these; the event shape is the contract, independent of
transport.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

# Cumulative progress percentage reached once a given phase completes.
PHASE_PROGRESS: dict[str, int] = {
    "research": 25,
    "contacts": 50,
    "classify": 75,
    "plan": 100,
}

# State keys each node produces that a consumer (the NestJS worker) needs to
# persist. Keyed by the graph node name; the phase_completed event carries these
# under ``data['output']`` so the DB writer never has to reach into the graph.
PHASE_OUTPUT_KEYS: dict[str, tuple[str, ...]] = {
    "phase_research": ("research", "seed_contacts", "gate"),
    # ``contacts_out_of_scope`` n'est présent que quand la phase 2 a réellement
    # écarté des contacts hors périmètre (clé absente sinon) — le worker ne
    # persiste alors rien et un ancien déploiement IA reste compatible.
    "phase_contacts": ("contacts", "contacts_out_of_scope"),
    "phase_classify": ("classified_contacts", "org_graph"),
    "phase_plan": ("plan",),
}

# Event type emitted after the anti-hallucination validation node runs. Carries
# the anti-hallucination verdict under ``data['judge']`` so NestJS can surface
# it. Distinct from ``phase_completed`` — the judge is a validator, not a phase.
JUDGE_COMPLETED = "judge_completed"


class GraphEvent(BaseModel):
    """One progress event. ``type`` ∈ phase_completed | phase_skipped |
    phase_failed | run_completed | run_failed | judge_completed."""

    type: str
    phase: str | None = None
    progress: int = 0
    data: dict[str, Any] = Field(default_factory=dict)
