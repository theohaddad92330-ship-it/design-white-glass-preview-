"""Tests de `app/eval/chat_human_review.py` — la méthode « humain métier » (#2443.4, #2899).

Hermétique : aucun appel modèle, aucun réseau. Exerce le gabarit et son
contrôleur contre le corpus RÉEL (`CORPUS`) pour prouver que le pool de
relecteurs dérive bien de `meta.personas`, jamais d'une liste inventée.
"""

from __future__ import annotations

import pytest

from app.access.rights_matrix import Famille
from app.eval.chat_human_review import HumanReview, HumanVerdict, validate_review
from tests.test_copilote_scenario_corpus import CORPUS


def _un_cas_avec_persona(persona: Famille):
    return next(item for item in CORPUS if persona in item.meta.personas)


def test_human_verdict_has_exactly_three_values():
    assert set(HumanVerdict) == {HumanVerdict.CONFORME, HumanVerdict.NON_CONFORME, HumanVerdict.NON_CONCERNE}


def test_a_well_formed_review_has_no_problem():
    cas = _un_cas_avec_persona(Famille.BUSINESS_MANAGER)
    review = HumanReview(
        case_identifiant=cas.identifiant,
        reviewer_family=Famille.BUSINESS_MANAGER,
        verdict=HumanVerdict.CONFORME,
        commentaire="Le comportement attendu est respecté sur ce cas.",
        date_iso="2026-09-27",
    )
    assert validate_review(review, case_identifiant=cas.identifiant, case_personas=cas.meta.personas) == ()


def test_a_review_citing_the_wrong_case_is_rejected():
    cas = _un_cas_avec_persona(Famille.BUSINESS_MANAGER)
    review = HumanReview(
        case_identifiant="un-autre-cas",
        reviewer_family=Famille.BUSINESS_MANAGER,
        verdict=HumanVerdict.CONFORME,
        commentaire="Commentaire suffisamment long.",
        date_iso="2026-09-27",
    )
    problems = validate_review(review, case_identifiant=cas.identifiant, case_personas=cas.meta.personas)
    assert any("un-autre-cas" in p for p in problems)


def test_a_reviewer_outside_the_case_personas_is_rejected():
    """Un cas qui ne vise QUE certains personas refuse un verdict soumis sous
    un persona hors de cette liste — sauf NON_CONCERNE, qui n'est pas testé
    ici (c'est justement l'échappatoire correcte)."""
    cas = next(item for item in CORPUS if item.meta.personas != frozenset(Famille))
    hors_perimetre = next(f for f in Famille if f not in cas.meta.personas)
    review = HumanReview(
        case_identifiant=cas.identifiant,
        reviewer_family=hors_perimetre,
        verdict=HumanVerdict.CONFORME,
        commentaire="Commentaire suffisamment long.",
        date_iso="2026-09-27",
    )
    problems = validate_review(review, case_identifiant=cas.identifiant, case_personas=cas.meta.personas)
    assert any(hors_perimetre.value in p for p in problems)


def test_a_review_without_a_real_comment_is_rejected():
    cas = _un_cas_avec_persona(Famille.DIRIGEANT)
    review = HumanReview(
        case_identifiant=cas.identifiant,
        reviewer_family=Famille.DIRIGEANT,
        verdict=HumanVerdict.NON_CONFORME,
        commentaire="   ",
        date_iso="2026-09-27",
    )
    problems = validate_review(review, case_identifiant=cas.identifiant, case_personas=cas.meta.personas)
    assert any("commentaire" in p for p in problems)


def test_a_review_with_a_malformed_date_is_rejected():
    cas = _un_cas_avec_persona(Famille.RECRUTEUR)
    review = HumanReview(
        case_identifiant=cas.identifiant,
        reviewer_family=Famille.RECRUTEUR,
        verdict=HumanVerdict.CONFORME,
        commentaire="Commentaire suffisamment long.",
        date_iso="27/09/2026",
    )
    problems = validate_review(review, case_identifiant=cas.identifiant, case_personas=cas.meta.personas)
    assert any("date_iso" in p for p in problems)


def test_reviewer_pool_is_derived_from_meta_personas_never_a_second_list():
    """Preuve n°2 (une garde dont le corpus est vide est verte pour rien) :
    au moins un cas RÉEL du corpus restreint ses personas — sinon ce test ne
    prouverait rien sur la dérivation."""
    restreints = [item for item in CORPUS if item.meta.personas != frozenset(Famille)]
    assert restreints, "aucun cas du corpus ne restreint ses personas : le test de périmètre serait vide"


def _review(**overrides: object) -> HumanReview:
    base: dict[str, object] = dict(
        case_identifiant="c1",
        reviewer_family=Famille.BUSINESS_MANAGER,
        verdict=HumanVerdict.CONFORME,
        commentaire="Comportement conforme au scénario attendu.",
        date_iso="2026-09-28",
    )
    base.update(overrides)
    return HumanReview(**base)  # type: ignore[arg-type]


def test_non_concerne_is_accepted_even_outside_the_case_personas() -> None:
    # Le verdict NON_CONCERNE existe précisément pour ce cas — un relecteur
    # hors périmètre peut le dire sans que ce soit une erreur de soumission.
    problems = validate_review(
        _review(reviewer_family=Famille.RECRUTEUR, verdict=HumanVerdict.NON_CONCERNE),
        case_identifiant="c1",
        case_personas=frozenset({Famille.BUSINESS_MANAGER}),
    )
    assert problems == ()


def test_an_empty_comment_is_rejected() -> None:
    problems = validate_review(
        _review(commentaire=""),
        case_identifiant="c1",
        case_personas=frozenset({Famille.BUSINESS_MANAGER}),
    )
    assert any("commentaire" in p for p in problems)


def test_a_verdict_outside_the_enum_is_rejected() -> None:
    problems = validate_review(
        _review(verdict="probablement conforme"),
        case_identifiant="c1",
        case_personas=frozenset({Famille.BUSINESS_MANAGER}),
    )
    assert any("verdict" in p for p in problems)


def test_never_a_probability_typed_verdict() -> None:
    # Doctrine : aucune PROBABILITÉ ne s'affiche, y compris dans un verdict de
    # revue humaine — les trois valeurs de HumanVerdict sont catégorielles.
    assert len(list(HumanVerdict)) == 3
    for verdict in HumanVerdict:
        assert "%" not in verdict.value
        assert not any(char.isdigit() for char in verdict.value)


def test_validate_review_never_raises_on_a_malformed_submission() -> None:
    # Un contrôleur qui lève sur une entrée malformée forcerait chaque
    # appelant à connaître ses exceptions internes — la liste de défauts
    # suffit, jamais une exception pour un cas prévisible.
    problems = validate_review(
        _review(verdict="n'importe quoi", commentaire="", date_iso="pas une date"),
        case_identifiant="autre-cas",
        case_personas=frozenset({Famille.DIRIGEANT}),
    )
    assert len(problems) >= 4


@pytest.mark.parametrize("verdict", list(HumanVerdict))
def test_every_verdict_round_trips_through_validation(verdict: HumanVerdict) -> None:
    problems = validate_review(
        _review(verdict=verdict),
        case_identifiant="c1",
        case_personas=frozenset({Famille.BUSINESS_MANAGER}),
    )
    assert problems == ()


# ── #2278.12 / .17 — l'annotation PAR TOUR d'une conversation multi-tour ────────


def _revue(cas, **patch):
    base = dict(
        case_identifiant=cas.identifiant,
        reviewer_family=Famille.BUSINESS_MANAGER,
        verdict=HumanVerdict.NON_CONFORME,
        commentaire="Le deuxième tour invente un chiffre.",
        date_iso="2026-10-15",
    )
    base.update(patch)
    return HumanReview(**base)


def test_a_review_without_a_turn_still_covers_the_whole_case():
    cas = _un_cas_avec_persona(Famille.BUSINESS_MANAGER)
    assert validate_review(_revue(cas), case_identifiant=cas.identifiant, case_personas=cas.meta.personas) == ()


def test_a_review_can_target_one_turn_of_a_multi_turn_case():
    cas = _un_cas_avec_persona(Famille.BUSINESS_MANAGER)
    review = _revue(cas, tour=2)
    assert (
        validate_review(review, case_identifiant=cas.identifiant, case_personas=cas.meta.personas, case_tours=3) == ()
    )


def test_a_turn_beyond_the_conversation_is_rejected():
    cas = _un_cas_avec_persona(Famille.BUSINESS_MANAGER)
    problems = validate_review(
        _revue(cas, tour=4), case_identifiant=cas.identifiant, case_personas=cas.meta.personas, case_tours=3
    )
    assert any("tour" in p for p in problems)


def test_a_turn_on_a_single_turn_case_is_rejected_unless_it_is_the_first():
    cas = _un_cas_avec_persona(Famille.BUSINESS_MANAGER)
    kwargs = dict(case_identifiant=cas.identifiant, case_personas=cas.meta.personas)
    assert validate_review(_revue(cas, tour=1), **kwargs) == ()
    assert any("tour" in p for p in validate_review(_revue(cas, tour=2), **kwargs))


def test_a_zero_or_negative_turn_is_rejected():
    cas = _un_cas_avec_persona(Famille.BUSINESS_MANAGER)
    for tour in (0, -1):
        problems = validate_review(
            _revue(cas, tour=tour), case_identifiant=cas.identifiant, case_personas=cas.meta.personas, case_tours=3
        )
        assert any("tour" in p for p in problems)
