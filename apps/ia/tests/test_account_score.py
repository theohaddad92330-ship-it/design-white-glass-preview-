"""Deterministic GO / PRUDENT / STOP / EXPLORER verdict from the /25 account
score (Annexe Méthodologie Sales ESN p25 — fait foi au-dessus du Drive)."""

from __future__ import annotations

from app.services.account_score import (
    SCORE_AXES,
    SCORE_MAX,
    cap_score_for_quality,
    clamp_axis,
    legacy_global_score,
    legacy_go_no_go,
    score_from_breakdown,
    verdict_for_score,
    verdict_from_global_score,
)


def test_axes_are_the_annexe_five():
    assert SCORE_MAX == 25
    assert sum(m for _, _, m in SCORE_AXES) == 25
    assert [k for k, _, _ in SCORE_AXES] == ["fit_offre", "timing", "accessibilite", "concurrence", "capacite"]


def test_verdict_bands():
    # Annexe méthodo p25: 20-25 GO, 14-19 PRUDENT, <14 STOP.
    assert verdict_for_score(25) == "GO"
    assert verdict_for_score(20) == "GO"
    assert verdict_for_score(19) == "PRUDENT"
    assert verdict_for_score(14) == "PRUDENT"  # PRUDENT floor is now 14 (was 15)
    assert verdict_for_score(13) == "STOP"
    assert verdict_for_score(0) == "STOP"


def test_explorer_when_data_incomplete():
    # EXPLORER = potentiel mais données manquantes → collecter l'info. Overrides a
    # would-be GO/PRUDENT when the confidence can't confirm it; below the potential
    # floor it stays STOP.
    assert verdict_for_score(22, data_complete=False) == "EXPLORER"  # GO needs confiance
    assert verdict_for_score(15, data_complete=False) == "EXPLORER"
    assert verdict_for_score(10, data_complete=False) == "EXPLORER"  # floor
    assert verdict_for_score(9, data_complete=False) == "STOP"  # no potential
    # data_complete (default) keeps the plain bands.
    assert verdict_for_score(22) == "GO"
    assert verdict_for_score(15) == "PRUDENT"


def test_clamp_axis_caps_and_floors():
    assert clamp_axis("fit_offre", 9) == 5  # capped to axis max (5)
    assert clamp_axis("fit_offre", -3) == 0  # floored
    assert clamp_axis("concurrence", 5) == 5
    assert clamp_axis("capacite", 5) == 5
    assert clamp_axis("fit_offre", "bad") == 0  # non-numeric → 0, no crash
    assert clamp_axis("urgence", 5) == 0  # a dropped axis contributes nothing
    assert clamp_axis("unknown_axis", 5) == 0


def test_score_recomputed_from_axes_not_trusted_total():
    breakdown = [
        {"axis": "fit_offre", "points": 5},
        {"axis": "accessibilite", "points": 4},
        {"axis": "timing", "points": 99},  # over cap → clamped to 5
        {"axis": "capacite", "points": 3},
    ]
    # 5 + 4 + 5 + 3 = 17
    assert score_from_breakdown(breakdown) == 17
    assert verdict_for_score(17) == "PRUDENT"


def test_score_from_breakdown_handles_junk():
    assert score_from_breakdown([]) == 0
    assert score_from_breakdown([{"nope": 1}, "notadict", {"axis": "fit_offre", "points": 3}]) == 3


def test_verdict_from_global_score_unifies_vocab():
    assert verdict_from_global_score(10) == "GO"
    assert verdict_from_global_score(7) == "GO"  # GO/chaud floor
    assert verdict_from_global_score(6) == "PRUDENT"
    assert verdict_from_global_score(5) == "PRUDENT"  # PRUDENT/moyen floor
    assert verdict_from_global_score(4) == "STOP"  # STOP/froid
    assert verdict_from_global_score(0) == "STOP"
    # EXPLORER overrides on incomplete data with residual potential.
    assert verdict_from_global_score(8, data_complete=False) == "EXPLORER"
    assert verdict_from_global_score(4, data_complete=False) == "EXPLORER"
    assert verdict_from_global_score(3, data_complete=False) == "STOP"
    # Robust to junk / out-of-range.
    assert verdict_from_global_score("bad") == "STOP"
    assert verdict_from_global_score(99) == "GO"


def test_legacy_mappings():
    assert legacy_go_no_go("GO") == "GO"
    assert legacy_go_no_go("PRUDENT") == "CONDITIONNEL"
    assert legacy_go_no_go("STOP") == "NO-GO"
    assert legacy_go_no_go("EXPLORER") == "CONDITIONNEL"
    # Band-faithful /25 → /10: each band lands on its own /10 slice so the bucket
    # cutoffs (>=7/>=5/<5) never contradict the /25 verdict.
    assert legacy_global_score(25) == 10  # GO → 7-10
    assert legacy_global_score(20) == 7  # GO floor
    assert legacy_global_score(19) == 6  # PRUDENT → 5-6
    assert legacy_global_score(14) == 5  # PRUDENT floor (now 14)
    assert legacy_global_score(13) == 4  # STOP → 1-4
    assert legacy_global_score(0) == 1  # floor at 1


def test_cap_score_for_quality_degrades_after_gates():
    # trop_faible → data missing: cap 13 (STOP band on its own), and the plan call
    # site re-verdicts with data_complete=False → EXPLORER when potential remains.
    assert cap_score_for_quality(25, "trop_faible") == 13
    assert verdict_for_score(cap_score_for_quality(25, "trop_faible")) == "STOP"
    assert verdict_for_score(cap_score_for_quality(25, "trop_faible"), data_complete=False) == "EXPLORER"
    # hallucination → never a confident GO, capped at the PRUDENT ceiling.
    assert cap_score_for_quality(25, "hallucination") == 19
    assert verdict_for_score(cap_score_for_quality(23, "hallucination")) == "PRUDENT"
    # The cap only ever lowers: an already-STOP score under hallucination stays put.
    assert cap_score_for_quality(8, "hallucination") == 8
    # ok / a_corriger / unknown / None leave the score untouched.
    for v in ("ok", "a_corriger", "autre", None):
        assert cap_score_for_quality(24, v) == 24
    # Case / whitespace tolerant.
    assert cap_score_for_quality(25, " Trop_Faible ") == 13


def test_score25_from_global_score_is_band_consistent():
    from app.services.account_score import score25_from_global_score

    for g in range(11):
        assert verdict_for_score(score25_from_global_score(g)) == verdict_from_global_score(g)
    assert score25_from_global_score(7) >= 20  # GO floor
    assert 14 <= score25_from_global_score(5) <= 19  # PRUDENT
    assert score25_from_global_score(4) < 14  # STOP
