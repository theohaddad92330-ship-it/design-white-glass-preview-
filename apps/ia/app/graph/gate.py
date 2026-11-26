"""Deterministic go/no-go gate on the research output (judge v1).

Before spending three further Claude phases (contacts → classify → plan), check
that research actually identified the company. If it produced no business
description and no sector, the downstream phases would only build a dossier on
nothing — so the graph early-exits with a ``no_go`` instead of burning the spend.

This is a deterministic, zero-cost gate. An LLM judge (grounding / citation
checks) and richer value thresholds (priority score) layer on top later; this
just stops the obviously-empty case.
"""

from __future__ import annotations

from typing import Any


def evaluate_research_gate(research: dict[str, Any] | None) -> dict[str, Any]:
    """Score research go/no-go on deterministic signals.

    ``no_go`` only when the company wasn't even identified (no business
    description and no sector) — a genuine "do not spend downstream". Anything
    we could recognise is a ``go``; the score is informational coverage.
    """
    research = research or {}
    has_business = bool(research.get("businessDescription") or research.get("sector"))
    has_signals = bool(
        research.get("recentSignals") or research.get("budgetSignals") or research.get("itChallenges")
    )
    has_entities = bool(
        research.get("subsidiaries") or research.get("entitiesExhaustive") or research.get("executives")
    )

    reasons: list[str] = []
    if not has_business:
        reasons.append("no business description or sector — company not identified")

    return {
        "decision": "go" if has_business else "no_go",
        "score": int(has_business) + int(has_signals) + int(has_entities),
        "reasons": reasons,
        "signals": {"business": has_business, "intent": has_signals, "entities": has_entities},
    }
