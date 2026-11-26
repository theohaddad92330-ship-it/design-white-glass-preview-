"""Golden-set evaluator (#275) — tests the eval logic itself, then uses it to
document the current gap against the Société Générale golden.

Two layers:
1. ``evaluate()`` unit tests — a crafted complete output passes; broken outputs
   fail the right checks. This is what keeps the harness trustworthy.
2. Baseline on the frozen SG fixture (pipeline-normalised) — the *already
   shipped* groups (entities, zones) pass; ``what_to_sell`` is red, which is the
   spec for the next increment.
"""

from __future__ import annotations

import json
from pathlib import Path

from evals.golden_eval import evaluate
from evals.run_eval import normalize_output

# __file__ = apps/ia/tests/… → parents[1] = apps/ia, parents[3] = repo root.
_EVALS = Path(__file__).resolve().parents[1] / "evals"
_FIXTURES = Path(__file__).resolve().parents[3] / "packages" / "contracts" / "src" / "fixtures"


def _sg_golden() -> dict:
    return json.loads((_EVALS / "golden" / "societe-generale.json").read_text(encoding="utf-8"))


def _good_sg_output() -> dict:
    """A synthetic SG output that satisfies every golden check (incl. what-to-sell)."""
    return {
        "companyName": "Société Générale",
        "entitiesExhaustive": [
            {"name": "ITIM — Innovation, Technologies & IT", "type": "hub it", "isItEntity": True,
             "priorityTier": "P1", "zone": "attaque_immediate",
             "whatToSell": ["cloud", "data", "cyber"], "stack": ["kubernetes", "kafka"]},
            {"name": "GBIS — Global Banking", "type": "filiale", "priorityTier": "P1",
             "zone": "influence_a_activer", "whatToSell": ["dev quant"], "stack": ["java", "c++", "quant"]},
            {"name": "SGSS — Securities Services", "type": "filiale", "priorityTier": "P2",
             "zone": "quick_win", "whatToSell": ["data"], "stack": ["java"]},
            {"name": "BoursoBank", "type": "filiale", "priorityTier": "P2",
             "zone": "quick_win", "whatToSell": ["mobile", "anti-fraude", "data"], "stack": ["kotlin", "swift"]},
            {"name": "BDDF", "type": "direction", "priorityTier": "P3", "zone": "longue_traine"},
            {"name": "RISQ", "type": "direction", "priorityTier": "P3", "zone": "longue_traine"},
            {"name": "RESG / Achats", "type": "direction", "priorityTier": "P3", "zone": "longue_traine"},
            {"name": "HRCO", "type": "direction", "priorityTier": "P3", "zone": "longue_traine"},
        ],
        "qualifiedHypotheses": [
            {"hypothesis": "industrialise ses modèles ML (MLOps)", "confidence": "probable"},
            {"hypothesis": "renforce l'anti-fraude temps réel", "confidence": "confirmee"},
            {"hypothesis": "migre vers le cloud data", "confidence": "a_verifier"},
        ],
    }


# ── evaluate() logic ──────────────────────────────────────────────────────────


def test_complete_output_passes_every_group():
    report = evaluate(_good_sg_output(), _sg_golden())
    assert report.passed(), [(c.name, c.detail) for c in report.checks if not c.passed]
    assert "what_to_sell" in report.groups()


def test_missing_what_to_sell_fails_only_that_group():
    out = _good_sg_output()
    del out["entitiesExhaustive"][1]["whatToSell"]  # strip GBIS offers
    report = evaluate(out, _sg_golden())
    assert report.passed(only=["entities", "zones"])
    assert not report.passed(only=["what_to_sell"])
    per_entity = next(c for c in report.checks if c.name == "what_to_sell.per_entity")
    assert per_entity.passed is False
    assert "GBIS" in per_entity.detail


def test_wrong_stack_fails_entity_expectation():
    out = _good_sg_output()
    out["entitiesExhaustive"][1]["stack"] = ["cobol", "mainframe"]  # implausible for GBIS quant
    out["entitiesExhaustive"][1]["whatToSell"] = ["run"]  # and no quant keyword in offers either
    report = evaluate(out, _sg_golden())
    stack_check = next(c for c in report.checks if c.name == "what_to_sell.GBIS.stack_any")
    assert stack_check.passed is False


def test_too_few_entities_fails_min_count():
    out = {"entitiesExhaustive": _good_sg_output()["entitiesExhaustive"][:2]}
    report = evaluate(out, _sg_golden())
    mc = next(c for c in report.checks if c.name == "entities.min_count")
    assert mc.passed is False


def test_missing_named_entity_fails_include():
    out = _good_sg_output()
    out["entitiesExhaustive"] = [e for e in out["entitiesExhaustive"] if "BoursoBank" not in e["name"]]
    report = evaluate(out, _sg_golden())
    bourso = next(c for c in report.checks if c.name.startswith("entities.include[BoursoBank"))
    assert bourso.passed is False


def test_score_and_group_filter():
    report = evaluate(_good_sg_output(), _sg_golden())
    ok, total = report.score(only=["entities"])
    assert ok == total > 0
    assert report.groups() >= {"entities", "zones", "what_to_sell"}


# ── Baseline on the real frozen fixture ───────────────────────────────────────


def test_normalize_adds_zones_to_fixture():
    fixture = json.loads((_FIXTURES / "research.societe-generale.json").read_text(encoding="utf-8"))
    normalized = normalize_output(fixture)
    ents = normalized["entitiesExhaustive"]
    assert all("zone" in e for e in ents)
    assert normalized["entityZones"]  # summary present


def test_sg_fixture_meets_shipped_groups_but_not_what_to_sell():
    # The frozen SG fixture, normalised through current code, already satisfies
    # the entities + zones golden. what_to_sell is red — that's the #275 spec.
    fixture = json.loads((_FIXTURES / "research.societe-generale.json").read_text(encoding="utf-8"))
    report = evaluate(normalize_output(fixture), _sg_golden())
    assert report.passed(only=["entities"]), [(c.name, c.detail) for c in report.in_group("entities") if not c.passed]
    assert report.passed(only=["zones"]), [(c.name, c.detail) for c in report.in_group("zones") if not c.passed]
    assert not report.passed(only=["what_to_sell"])  # drives the next increment
