"""Unit tests for the IA v2 eval metrics (app/eval).

Each metric is exercised on a GOOD vs a BAD input; then the assembled report's
aggregation / pass filtering. Hermetic: bundled fixtures + inline dicts only, no
network, no engine.
"""

from __future__ import annotations

from app.eval import (
    buying_committee,
    coherence,
    completeness,
    contacts_quality,
    evaluate,
    faithfulness,
    load_fixture,
    load_golden,
    no_invented_data,
    plays_grounding,
    resolve_analysis,
    source_freshness,
)
from app.eval.metrics import WEIGHTS

ALL_METRICS = {
    "faithfulness",
    "coherence",
    "completeness",
    "contacts_quality",
    "plays_grounding",
    "buying_committee",
    "source_freshness",
    "no_invented_data",
}


def _sg() -> dict:
    return resolve_analysis(load_golden("societe-generale"))


def _doctolib() -> dict:
    return resolve_analysis(load_golden("doctolib"))


def _bad() -> dict:
    return load_fixture("hallucinated.analysis")


# ── faithfulness ──────────────────────────────────────────────────────────────


def test_faithfulness_passes_via_grounding_v2_kpi():
    m = faithfulness(_sg())
    assert m.passed is True
    assert m.score == 1.0
    assert m.data["source"] == "grounding_v2_kpi"
    assert m.data["nonSourcedRatio"] == 0.0


def test_faithfulness_passes_via_deterministic_tags():
    m = faithfulness(_doctolib())
    assert m.passed is True
    assert m.data["source"] == "deterministic"
    assert m.data["factsSourced"] == m.data["factsConsidered"] == 5


def test_faithfulness_fails_when_facts_unsourced():
    m = faithfulness(_bad())
    assert m.passed is False
    assert m.score == 0.0
    assert m.data["nonSourcedRatio"] == 1.0


def test_faithfulness_credits_grounding_source_refs_without_kpi():
    # sources.tags empty, but a per-fact GROUNDING_V2 source_ref proves siren →
    # it must count as sourced (the KPI block itself is absent here).
    research = {
        "siren": "552120222",
        "sector": "Banque",
        "sources": {"tags": {"sector": "PUBLIC"}, "citations": {}},
        "grounding": {"sourceRefs": {"siren": [{"citedText": "SIREN 552 120 222"}]}},
    }
    m = faithfulness({"research": research})
    assert m.data["factsConsidered"] == 2
    assert m.data["factsSourced"] == 2
    assert m.passed is True


def test_faithfulness_no_hard_facts_is_vacuously_faithful():
    m = faithfulness({"research": {"businessDescription": "x"}})
    assert m.passed is True
    assert "no hard facts" in m.detail


# ── coherence ─────────────────────────────────────────────────────────────────


def test_coherence_passes_on_good_dossier():
    m = coherence(_sg())
    assert m.passed is True
    assert m.score == 1.0


def test_coherence_fails_on_invented_contact():
    m = coherence(_bad())
    assert m.passed is False
    assert any("absent" in i["detail"] for i in m.data["issues"])


# ── completeness ──────────────────────────────────────────────────────────────


def test_completeness_full_with_golden():
    golden = load_golden("doctolib").as_expectations()
    m = completeness(_doctolib(), golden)
    assert m.passed is True
    assert m.score == 1.0


def test_completeness_flags_missing_required_fact():
    m = completeness({"research": {"sector": "Banque"}, "plan": {"x": 1}, "contacts": [{"fullName": "A B"}]})
    assert m.passed is False
    assert "fact:siren" in m.data["checks"]
    assert m.data["checks"]["fact:siren"] is False


def test_completeness_golden_siren_mismatch_fails():
    golden = {"expect": {"siren": "999999999"}}
    m = completeness(_doctolib(), golden)
    assert m.data["checks"]["golden:siren"] is False
    assert m.passed is False


def test_completeness_golden_is_public_and_subsidiaries():
    # Doctolib expect isPublic false + hasSubsidiaries true — both must match.
    golden = load_golden("doctolib").as_expectations()
    m = completeness(_doctolib(), golden)
    assert m.data["checks"]["golden:isPublic"] is True
    assert m.data["checks"]["golden:hasSubsidiaries"] is True


# ── contacts_quality ──────────────────────────────────────────────────────────


def test_contacts_quality_passes_with_decider():
    m = contacts_quality(_sg())
    assert m.passed is True
    assert m.data["deciders"] >= 1


def test_contacts_quality_detects_decider_from_title_only():
    # No explicit decisionRole — the shipped title classifier must still flag it.
    analysis = {"contacts": [{"fullName": "Zoé Test", "title": "Directeur des Systèmes d'Information"}]}
    m = contacts_quality(analysis)
    assert m.passed is True
    assert m.data["deciders"] == 1


def test_contacts_quality_fails_without_decider():
    m = contacts_quality(_bad())
    assert m.passed is False
    assert m.data["deciders"] == 0
    assert m.score == 0.4


def test_contacts_quality_fails_without_named_contacts():
    m = contacts_quality({"contacts": [{"fullName": "À identifier"}, {}]})
    assert m.passed is False
    assert m.score == 0.0


# ── evaluate() report ─────────────────────────────────────────────────────────


def test_evaluate_good_dossier_passes_every_metric():
    golden = load_golden("societe-generale").as_expectations()
    report = evaluate(_sg(), golden)
    assert report.passed()
    assert report.aggregate() >= 0.8
    assert report.names() == ALL_METRICS


def test_evaluate_bad_dossier_fails():
    report = evaluate(_bad(), None)
    assert not report.passed()
    ok, total = report.score()
    assert total == 8
    # Only source_freshness is informational on the bad dossier (no dated
    # evidence) — every substantive metric must fail.
    assert ok <= 1
    assert report.aggregate() < 0.35


def test_report_weights_sum_to_one_and_aggregate_is_weighted():
    assert round(sum(WEIGHTS.values()), 6) == 1.0
    report = evaluate(_bad(), None)
    # Manual weighted mean matches EvalReport.aggregate().
    expected = round(sum(m.score * m.weight for m in report.metrics) / sum(m.weight for m in report.metrics), 4)
    assert report.aggregate() == expected


def test_report_pass_filter_selects_subset():
    report = evaluate(_bad(), None)
    # Overall fails, but a subset that this report happens to... still fails here;
    # the point is the filter only looks at the named metrics.
    assert report.passed(only=["faithfulness"]) is False
    assert report.passed(only=["nonexistent-metric"]) is True  # vacuous
    ok, total = report.score(only=["faithfulness", "coherence"])
    assert total == 2


def test_report_as_dict_is_serializable():
    report = evaluate(_sg(), None)
    d = report.as_dict()
    assert d["company"] == "Société Générale"
    assert d["passed"] is True
    assert len(d["metrics"]) == 8
    assert all({"name", "score", "passed", "weight"} <= set(m) for m in d["metrics"])


# ── plays_grounding ───────────────────────────────────────────────────────────


def test_plays_grounding_mix_complete_and_faible():
    # SG fixture: 1 play with a founded preuve (rapport annuel), 1 play without
    # (the frozen recentSignals entry carries no source → preuve None, faible).
    m = plays_grounding(_sg())
    assert m.passed is True
    assert m.score == 0.5
    assert m.data == {"recos": 2, "complete": 1, "founded": 1}


def test_plays_grounding_fails_when_no_reco_actionable():
    m = plays_grounding(_bad())
    assert m.passed is False
    assert m.score == 0.0


def test_plays_grounding_counts_structured_offers():
    analysis = {
        "plan": {
            "commercialOffers": [
                {
                    "estimatedEffort": "3 ETP",
                    "hypothesis": "Basé sur le périmètre du signal.",
                    "provenance": {"source": "offres d'emploi", "signal": "Recrutements data"},
                }
            ]
        }
    }
    m = plays_grounding(analysis)
    assert m.passed is True
    assert m.data == {"recos": 1, "complete": 1, "founded": 1}


def test_plays_grounding_weak_source_is_not_founded():
    analysis = {
        "plan": {
            "plays": [
                {
                    "painSignal": "s",
                    "preuve": {"source": "ia_reconstruction", "signal": "s"},
                    "targetContact": "A B",
                    "firstAction": "act",
                    "readyMessage": "msg",
                    "risk": "r",
                }
            ]
        }
    }
    m = plays_grounding(analysis)
    assert m.passed is False
    assert m.data["founded"] == 0


def test_plays_grounding_no_recos_is_informational():
    m = plays_grounding({"plan": {}})
    assert m.passed is True
    assert "no recommendations" in m.detail


# ── buying_committee ──────────────────────────────────────────────────────────


def test_buying_committee_covers_core_seats_on_good_dossier():
    m = buying_committee(_sg())
    assert m.passed is True
    assert m.data["hasBuyer"] is True
    assert m.data["roleCoverage"].get("technical_buyer")
    assert m.data["roleCoverage"].get("procurement")


def test_buying_committee_fails_without_any_seat():
    m = buying_committee(_bad())
    assert m.passed is False
    assert m.score == 0.0


def test_buying_committee_single_seat_is_not_a_committee():
    analysis = {"contacts": [{"fullName": "Zoé Test", "title": "Directrice des Systèmes d'Information"}]}
    m = buying_committee(analysis)
    assert m.passed is False  # 1 seat covered — no multi-threading
    assert m.data["hasBuyer"] is True


def test_buying_committee_two_seats_without_buyer_fails():
    analysis = {
        "contacts": [
            {"fullName": "A B", "title": "Responsable Achats"},
            {"fullName": "C D", "title": "Product Owner"},
        ]
    }
    m = buying_committee(analysis)
    assert m.data["hasBuyer"] is False
    assert m.passed is False


# ── source_freshness ──────────────────────────────────────────────────────────


def test_source_freshness_fresh_dated_evidence_passes():
    analysis = {"research": {"recentSignals": [{"signal": "s", "date": "2026-06-01"}]}}
    golden = {"expect": {"freshnessAsOf": "2026-07-01"}}
    m = source_freshness(analysis, golden)
    assert m.passed is True
    assert m.score == 1.0  # < 6 mois


def test_source_freshness_stale_evidence_fails():
    analysis = {"research": {"legalSignals": [{"signal": "s", "date": "2022-01-15"}]}}
    golden = {"expect": {"freshnessAsOf": "2026-07-01"}}
    m = source_freshness(analysis, golden)
    assert m.passed is False
    assert m.score == 0.1  # > 3 ans


def test_source_freshness_pinned_as_of_is_deterministic():
    analysis = {"research": {"news": [{"title": "t", "age": "2025-12-01"}]}}
    golden = {"expect": {"freshnessAsOf": "2026-07-01"}}
    m = source_freshness(analysis, golden)
    assert m.score == 0.6  # 7 mois → tier < 18 mois, pinned forever
    assert m.data["asOf"] == "2026-07-01"


def test_source_freshness_no_dated_evidence_is_informational():
    m = source_freshness(_sg(), None)  # fixture dates are year-only ("2025") → unparseable
    assert m.passed is True
    assert "no dated evidence" in m.detail


# ── no_invented_data ──────────────────────────────────────────────────────────


def test_no_invented_data_clean_dossier_passes():
    m = no_invented_data(_sg())
    assert m.passed is True
    assert m.score == 1.0


def test_no_invented_data_flags_repeated_digit_and_marker():
    m = no_invented_data(_bad())
    assert m.passed is False
    assert any(v.startswith("siren:") for v in m.data["violations"])
    assert "marker:contoso" in m.data["violations"]


def test_no_invented_data_flags_invalid_siren_checksum():
    m = no_invented_data({"research": {"siren": "123456789"}})
    assert m.passed is False
    assert "siren:invalid-checksum" in m.data["violations"]


def test_no_invented_data_accepts_la_poste_luhn_exception():
    m = no_invented_data({"research": {"siren": "356000000"}})
    assert m.passed is True


def test_no_invented_data_flags_reserved_email_domain():
    m = no_invented_data({"contacts": [{"fullName": "A B", "email": "a.b@example.com"}]})
    assert m.passed is False
    assert any(v.startswith("email:") for v in m.data["violations"])


def test_no_invented_data_flags_marker_in_plan():
    m = no_invented_data({"plan": {"contactMessages": [{"linkedinMessage": "Bonjour John Doe"}]}})
    assert m.passed is False
    assert "marker:john doe" in m.data["violations"]
