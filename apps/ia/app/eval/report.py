"""Report primitives for the IA v2 eval harness.

A metric returns a :class:`MetricResult` (a ``0..1`` score + a hard pass/fail +
a human ``detail``). :func:`evaluate` assembles the per-metric results for one
analysis output into an :class:`EvalReport`, which knows how to weight them into
a single aggregate and to filter to a subset (so a caller can gate on, say, just
``faithfulness`` + ``coherence`` while the rest stays informational).

Pure data + arithmetic — no I/O, no engine, no network. This is what keeps the
harness itself trustworthy and CI-hermetic.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class MetricResult:
    """One metric's verdict over an analysis output.

    ``score`` is a normalised ``0..1`` quality signal; ``passed`` is the hard
    gate (a metric can score high yet still fail its KPI, e.g. faithfulness).
    ``weight`` is this metric's share of the aggregate. ``data`` carries the
    machine-readable breakdown (reused sub-verdicts, counts) for a dashboard.
    """

    name: str
    score: float
    passed: bool
    weight: float
    detail: str = ""
    data: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "score": round(self.score, 4),
            "passed": self.passed,
            "weight": self.weight,
            "detail": self.detail,
            "data": self.data,
        }


@dataclass
class EvalReport:
    """The per-metric results for a single analysis output, plus aggregation."""

    company: str
    metrics: list[MetricResult] = field(default_factory=list)

    def by_name(self) -> dict[str, MetricResult]:
        return {m.name: m for m in self.metrics}

    def names(self) -> set[str]:
        return {m.name for m in self.metrics}

    def _selected(self, only: list[str] | None) -> list[MetricResult]:
        if not only:
            return list(self.metrics)
        wanted = set(only)
        return [m for m in self.metrics if m.name in wanted]

    def passed(self, only: list[str] | None = None) -> bool:
        """True only if every selected metric passed its hard gate.

        An empty selection (no metric matched ``only``) is vacuously True — the
        caller asked about metrics this report doesn't carry.
        """
        return all(m.passed for m in self._selected(only))

    def score(self, only: list[str] | None = None) -> tuple[int, int]:
        """``(#passed, total)`` over the selected metrics."""
        selected = self._selected(only)
        return sum(1 for m in selected if m.passed), len(selected)

    def aggregate(self, only: list[str] | None = None) -> float:
        """Weight-normalised mean of the selected metric scores (``0..1``)."""
        selected = self._selected(only)
        total_weight = sum(m.weight for m in selected)
        if total_weight <= 0:
            return 0.0
        return round(sum(m.score * m.weight for m in selected) / total_weight, 4)

    def as_dict(self) -> dict[str, Any]:
        return {
            "company": self.company,
            "aggregate": self.aggregate(),
            "passed": self.passed(),
            "metrics": [m.as_dict() for m in self.metrics],
        }
