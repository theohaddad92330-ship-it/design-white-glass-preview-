"""#3201 — CONSTRAINT CONSISTENCY RESOLVER : la part déterministe testable."""

from __future__ import annotations

from app.services.constraint_consistency import (
    most_restrictive_criterion,
    narrow_result_warning,
    relaxation_suggestion,
)


def test_most_restrictive_criterion_none_below_two_active() -> None:
    assert most_restrictive_criterion({"department": "31"}) is None
    assert most_restrictive_criterion({}) is None


def test_most_restrictive_criterion_ignores_keywords() -> None:
    # #3201 — une recherche par NOM n'est jamais un candidat de relâchement.
    assert most_restrictive_criterion({"keywords": "Michelin", "department": "63"}) is None


def test_most_restrictive_criterion_picks_headcount_over_department() -> None:
    criteria = {"department": "31", "headcount": "1-9"}
    assert most_restrictive_criterion(criteria) == "headcount"


def test_most_restrictive_criterion_picks_department_over_sectors() -> None:
    criteria = {"sectors": ["it"], "department": "31"}
    assert most_restrictive_criterion(criteria) == "department"


def test_relaxation_suggestion_none_with_single_criterion() -> None:
    assert relaxation_suggestion({"department": "31"}) is None


def test_relaxation_suggestion_names_the_criterion_and_asks_before_acting() -> None:
    # #3201 spec test: « 50 comptes + commune de petite taille » — deux
    # critères combinés, zéro résultat.
    out = relaxation_suggestion({"department": "31", "headcount": "1-9"})
    assert out is not None
    assert out["criterion"] == "headcount"
    assert out["current_value"] == "1-9"
    assert "1-9" in out["message"]
    assert "département" in out["message"]
    # #3201 INTERDICTIONS — jamais une exécution silencieuse. #3343 (renversé,
    # recette prod du 30/09) : on n'ATTEND plus une validation, Laura relance
    # elle-même dans le même tour et DIT ce qu'elle a élargi.
    assert "MÊME tour" in out["message"]
    assert "valides" not in out["message"]


def test_relaxation_suggestion_english() -> None:
    out = relaxation_suggestion({"department": "31", "headcount": "1-9"}, language="en")
    assert out is not None
    assert "headcount band" in out["message"]


def test_narrow_result_warning_none_when_plenty_of_results() -> None:
    assert narrow_result_warning({"department": "31", "headcount": "1-9"}, 40) is None


def test_narrow_result_warning_none_with_single_criterion() -> None:
    assert narrow_result_warning({"department": "31"}, 2) is None


def test_narrow_result_warning_none_on_zero_results() -> None:
    # Zéro résultat est le cas de `relaxation_suggestion`, pas celui-ci —
    # les deux comportements du ticket restent distincts.
    assert narrow_result_warning({"department": "31", "headcount": "1-9"}, 0) is None


def test_narrow_result_warning_fires_on_thin_combined_results() -> None:
    out = narrow_result_warning({"department": "31", "headcount": "1-9"}, 2)
    assert out is not None
    assert "2 résultat" in out
    assert "continue" in out
