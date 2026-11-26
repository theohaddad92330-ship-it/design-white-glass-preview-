"""IA v2 eval harness — golden set + faithfulness/quality metrics.

Measure the analysis engine (esp. hallucination). The v2 axes (judge / LLM
gateway / data gateway / grounding) are ON by default — each keyed on its own
input (a provider key) or an emergency ``*_DISABLED`` kill-switch, never an
opt-in feature flag. NEW, isolated and additive: it only READS analysis outputs
and reuses the shipped deterministic checks — it never changes engine behaviour.

    from app.eval import evaluate, load_golden, resolve_analysis

    golden = load_golden("doctolib")
    report = evaluate(resolve_analysis(golden), golden.as_expectations())
    print(report.aggregate(), report.passed())
"""

from __future__ import annotations

from .golden import Golden, list_goldens, load_fixture, load_golden, resolve_analysis
from .metrics import (
    buying_committee,
    coherence,
    completeness,
    contacts_quality,
    evaluate,
    faithfulness,
    no_invented_data,
    plays_grounding,
    source_freshness,
)
from .report import EvalReport, MetricResult

__all__ = [
    "EvalReport",
    "Golden",
    "MetricResult",
    "buying_committee",
    "coherence",
    "completeness",
    "contacts_quality",
    "evaluate",
    "faithfulness",
    "list_goldens",
    "load_fixture",
    "load_golden",
    "no_invented_data",
    "plays_grounding",
    "resolve_analysis",
    "source_freshness",
]
