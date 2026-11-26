"""Two explicit score axes (Théo P1 « Score et quick wins ») — the commercial
score is presented SEPARATELY from the data confidence, and every factor of the
score is tied to a proof. See ``app/services/score_axes.py``."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.services.confidence import compute_confidence
from app.services.score_axes import (
    PROOF_TYPES,
    build_score_axes,
    commercial_score_100,
    data_confidence_from,
    score_factors,
)

# A full /25 breakdown (the annexe 5 axes) as phase-4 emits it.
_GO_EVALUATION = {
    "verdict": "GO",
    "score": 21,
    "globalScore": 8,
    "scoreBreakdown": [
        {"axis": "fit_offre", "label": "Fit — problèmes et offres compatibles", "points": 4, "max": 5},
        {"axis": "accessibilite", "label": "Accessibilité — relation, BU, panel, géo, taille", "points": 5, "max": 5},
        {"axis": "timing", "points": 4, "max": 5},  # no label → canonical fallback
        {"axis": "concurrence", "points": 4, "max": 5},
        {"axis": "capacite", "points": 4, "max": 5},
    ],
}


# ── commercial score : band-faithful with the /25 verdict ──────────────────────


def test_commercial_score_uses_the_reconciled_global_score() -> None:
    # globalScore 8/10 → 80/100 (GO band ≥ 70).
    assert commercial_score_100(_GO_EVALUATION) == 80


def test_commercial_score_falls_back_to_projecting_the_25() -> None:
    # No globalScore → project /25 through the band-faithful map. 19/25 is PRUDENT,
    # so it must NOT land in the GO band (a naive 19/25×100 = 76 would).
    prudent = {"verdict": "PRUDENT", "score": 19}
    got = commercial_score_100(prudent)
    assert got < 70  # stays out of the GO band
    assert got == 60  # PRUDENT 14-19 → /10 5-6 → 60/100


def test_commercial_score_zero_on_missing_evaluation() -> None:
    assert commercial_score_100({}) == 0
    assert commercial_score_100(None) == 0


# ── score factors : every factor tied to a proof ───────────────────────────────


def test_every_factor_carries_a_known_proof_type() -> None:
    factors = score_factors(_GO_EVALUATION)
    assert factors, "a scored breakdown must yield factors"
    for f in factors:
        assert f["proof_type"] in PROOF_TYPES
        assert f["label"]  # never a bare number


def test_axes_map_to_their_natural_proof() -> None:
    by_label = {f["label"]: f["proof_type"] for f in score_factors(_GO_EVALUATION)}
    assert by_label["Fit — problèmes et offres compatibles"] == "profile"
    assert by_label["Accessibilité — relation, BU, panel, géo, taille"] == "contact"
    # timing had no label → the canonical grid label is filled in.
    assert by_label["Timing — signaux / besoins / budget maintenant"] == "signal"
    assert by_label["Concurrence — incumbents, interne, alternatives"] == "source"
    assert by_label["Capacité — delivery, références, marge, délai"] == "profile"


def test_verdict_is_surfaced_as_a_business_rule_factor() -> None:
    factors = score_factors(_GO_EVALUATION)
    rules = [f for f in factors if f["proof_type"] == "business_rule"]
    assert len(rules) == 1
    assert "GO" in rules[0]["label"]
    assert rules[0]["weight"] == 21


def test_verdict_factor_is_flagged_as_a_TOTAL_not_a_contribution() -> None:
    # The verdict weight is the /25 TOTAL, not an extra contribution. Without a
    # marker the UI rendered it "+21" beside the axes, so a reader adding the
    # column got 21 + 21 = 42 for a 21/25 score.
    factors = score_factors(_GO_EVALUATION)
    axes = [f for f in factors if f["kind"] == "axis"]
    totals = [f for f in factors if f["kind"] == "total"]
    assert len(totals) == 1
    assert totals[0]["weight"] == 21
    assert sum(f["weight"] for f in axes) == totals[0]["weight"]


def test_every_factor_carries_its_scale_max() -> None:
    # A "+4" is meaningless without knowing it is out of 5.
    factors = score_factors(_GO_EVALUATION)
    assert all(f["max"] == 5 for f in factors if f["kind"] == "axis")
    assert [f["max"] for f in factors if f["kind"] == "total"] == [25]


def test_zero_point_axes_are_not_evidence() -> None:
    evaluation = {
        "verdict": "STOP",
        "score": 4,
        "scoreBreakdown": [
            {"axis": "fit_offre", "points": 4, "max": 5},
            {"axis": "timing", "points": 0, "max": 5},  # zero → contributes nothing
        ],
    }
    labels = {f["label"] for f in score_factors(evaluation) if f["proof_type"] != "business_rule"}
    assert "Fit — problèmes et offres compatibles" in labels
    assert "Timing — signaux / besoins / budget maintenant" not in labels


# ── data confidence : REUSED from compute_confidence, degrades on weak data ─────


def _metrics() -> dict:
    return {"brave_results_count": 30, "firecrawl_pages_scraped": 7, "pappers_siren": "552120222"}


def _iso(days_ago: int) -> str:
    return (datetime.now(UTC).date() - timedelta(days=days_ago)).isoformat()


_FIRMO = {"sector": "Banque", "employees": "10 000+", "revenue": "5 Md€", "headquarters": "Paris"}


def test_data_confidence_degrades_when_signals_are_archived() -> None:
    # Same firmo + trusted identity; only the freshest dated signal moves from
    # recent (< 6 mois) to archived (> ~3 ans). Confidence MUST drop.
    trusted_identity = {"identity": {"identityConfidence": 1.0, "useRegistryData": True}}
    fresh = compute_confidence(
        metrics=_metrics(),
        data={**_FIRMO, **trusted_identity, "legalSignals": [{"date": _iso(30)}]},
    ).model_dump(by_alias=True)
    archived = compute_confidence(
        metrics=_metrics(),
        data={**_FIRMO, **trusted_identity, "legalSignals": [{"date": _iso(1200)}]},
    ).model_dump(by_alias=True)

    assert data_confidence_from(archived) is not None
    assert data_confidence_from(archived) < data_confidence_from(fresh)


def test_data_confidence_collapses_on_a_homonym_entity() -> None:
    # A homonym / untrusted identity caps the confidence hard (identité axis) —
    # the whole point of the data-confidence axis: a wrong entity is NOT trustworthy.
    fresh = {**_FIRMO, "legalSignals": [{"date": _iso(30)}]}
    trusted = compute_confidence(
        metrics=_metrics(),
        data={**fresh, "identity": {"identityConfidence": 1.0, "useRegistryData": True}},
    ).model_dump(by_alias=True)
    homonym = compute_confidence(
        metrics=_metrics(),
        data={**fresh, "identity": {"status": "homonyme", "identityConfidence": 0.15, "useRegistryData": False}},
    ).model_dump(by_alias=True)

    assert data_confidence_from(homonym) < data_confidence_from(trusted)
    assert data_confidence_from(homonym) <= 50  # capped by the collapsed identité axis + slack


def test_data_confidence_none_without_a_confidence_block() -> None:
    assert data_confidence_from(None) is None
    assert data_confidence_from({}) is None
    assert data_confidence_from({"tier": "high"}) is None  # no numeric score


# ── build_score_axes : the wired output ────────────────────────────────────────


def test_build_score_axes_surfaces_both_axes_and_evidence() -> None:
    confidence = compute_confidence(
        metrics=_metrics(),
        data={**_FIRMO, "legalSignals": [{"date": _iso(30)}], "identity": {"identityConfidence": 1.0, "useRegistryData": True}},
    ).model_dump(by_alias=True)
    axes = build_score_axes(evaluation=_GO_EVALUATION, confidence=confidence)

    assert axes["commercialScore"] == 80
    assert axes["dataConfidence"] == confidence["score"]
    assert isinstance(axes["scoreFactors"], list) and axes["scoreFactors"]
    assert all(f["proof_type"] in PROOF_TYPES for f in axes["scoreFactors"])


def test_build_score_axes_tolerates_empty_inputs() -> None:
    axes = build_score_axes(evaluation={}, confidence={})
    assert axes["commercialScore"] == 0
    assert axes["dataConfidence"] is None
    assert axes["scoreFactors"] == []
