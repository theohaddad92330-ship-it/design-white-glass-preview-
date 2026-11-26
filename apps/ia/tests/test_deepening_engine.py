"""#189.1 + #189.7 (épopée #3218, lot E1 30/09) — le moteur d'approfondissement.

Verrouille : quatre niveaux, l'ordre PASS 0→3, la contradiction ouverte
prioritaire, l'arrêt sur gain marginal NUL (pas sur budget), l'arrêt quand
les quatre niveaux sont épuisés, et que l'arrêt sait dire NON (un gain > 0
n'arrête JAMAIS)."""

from __future__ import annotations

from app.services.deepening_engine import (
    DeepeningPass,
    decide_next_pass,
    has_open_conflict,
    pass_step_label,
)


def test_four_levels_in_order():
    assert [p.value for p in DeepeningPass] == [0, 1, 2, 3]


def test_first_decision_before_any_round_is_pass_0():
    d = decide_next_pass(gains=[], open_conflict=False)
    assert d.stop is False and d.next_pass is DeepeningPass.LOCAL_CONTEXT


def test_productive_rounds_walk_the_passes():
    assert decide_next_pass(gains=[2], open_conflict=False).next_pass is DeepeningPass.TARGETED_VERIFICATION
    assert decide_next_pass(gains=[2, 1], open_conflict=False).next_pass is DeepeningPass.THEMATIC_SEARCH


def test_open_conflict_jumps_to_pass_3():
    d = decide_next_pass(gains=[2], open_conflict=True)
    assert d.next_pass is DeepeningPass.CONTRADICTION_RESOLUTION


def test_zero_gain_stops_on_marginal_gain():
    d = decide_next_pass(gains=[3, 0], open_conflict=False)
    assert d.stop is True and d.reason == "marginal_gain" and d.next_pass is None


def test_positive_gain_never_stops():
    """Le critère sait dire NON : tant qu'un round apporte quelque chose, on continue."""
    assert decide_next_pass(gains=[1, 1], open_conflict=False).stop is False


def test_zero_gain_with_an_open_conflict_spends_one_resolution_round():
    """#3863.4 — un round stérile avec une contradiction déterminante ouverte
    ne ferme pas le tour : UN round de résolution d'abord."""
    d = decide_next_pass(gains=[0], open_conflict=True)
    assert d.stop is False
    assert d.next_pass is DeepeningPass.CONTRADICTION_RESOLUTION
    assert d.reason == "open_conflict_zero_gain"


def test_zero_gain_with_an_open_conflict_stops_once_the_resolution_round_is_spent():
    """Le critère sait dire NON : jamais deux rounds de résolution (pas de boucle)."""
    d = decide_next_pass(gains=[1, 0], open_conflict=True, conflict_pass_spent=True)
    assert d.stop is True and d.reason == "marginal_gain"


def test_zero_gain_without_conflict_still_stops():
    assert decide_next_pass(gains=[0], open_conflict=False).stop is True


def test_all_levels_done_stops():
    d = decide_next_pass(gains=[1, 1, 1, 1], open_conflict=False)
    assert d.stop is True and d.reason == "passes_exhausted"


def test_has_open_conflict_reads_unresolved_only():
    assert has_open_conflict([{"data_conflicts": {"known": True, "conflicts": [{"resolvedBy": "unresolved"}]}}])
    assert has_open_conflict([{"contacts": [{"conflicts": [{"field": "title"}]}]}])
    assert not has_open_conflict([{"data_conflicts": {"known": True, "conflicts": []}}])
    assert not has_open_conflict([{"conflicts": [{"resolvedBy": "resolved"}]}])
    assert not has_open_conflict(["texte", None, 3])


def test_every_pass_has_a_french_step_label():
    for p in DeepeningPass:
        assert pass_step_label(p).startswith("Approfondissement")
