"""#3695 — le banc sait dire OUI sur le moteur réel, et NON sur chaque contre-exemple."""

from app.eval.message_objectives import (
    DEFAULT_OBJECTIVES,
    SCENARIO,
    build_variant,
    check_anchors_kept,
    check_distinct_framing,
    check_no_forced_meeting,
    check_stale_never_recent,
    run_bench,
)


def test_engine_passes_the_bench_and_reports_what_it_read():
    report = run_bench()
    assert report.variants_read == len(DEFAULT_OBJECTIVES)
    assert [c.name for c in report.checks if not c.passed] == []
    assert report.passed


def test_empty_bench_is_never_green():
    """Un jeu vide ne prouve rien : « aucun défaut » serait vrai sans avoir rien lu."""
    report = run_bench(objectives=("code_inconnu",))
    assert report.variants_read == 0
    assert not report.passed


def test_distinct_framing_says_no_when_two_objectives_share_one_framing():
    a, b = build_variant("ouverture_compte"), build_variant("relance")
    assert check_distinct_framing([a, b]).passed
    assert not check_distinct_framing([a, {**b, "framing": a["framing"]}]).passed


def test_anchors_kept_says_no_when_a_variant_loses_the_dated_signal():
    a = build_variant("ouverture_compte")
    lost = {**a, "prompt": a["prompt"].replace(SCENARIO["fresh_signal"]["signal"], "")}
    assert check_anchors_kept([a]).passed
    assert not check_anchors_kept([lost]).passed


def test_no_forced_meeting_says_no_when_an_opening_carries_a_meeting_cta():
    a = build_variant("ouverture_compte")
    assert check_no_forced_meeting([a]).passed
    assert not check_no_forced_meeting([{**a, "cta": "echange_court"}]).passed
    # Par nature, proposer un profil appelle un échange : pas un défaut.
    assert check_no_forced_meeting([build_variant("proposer_profil")]).passed


def test_stale_never_recent_says_no_when_the_old_signal_sits_under_the_recent_heading():
    a = build_variant("relance")
    assert check_stale_never_recent([a]).passed
    stale = SCENARIO["stale_signal"]["signal"]
    leaked = {**a, "prompt": f"SIGNAUX RÉCENTS (x) :\n- {stale}\nSIGNAUX ANCIENS"}
    assert not check_stale_never_recent([leaked]).passed
