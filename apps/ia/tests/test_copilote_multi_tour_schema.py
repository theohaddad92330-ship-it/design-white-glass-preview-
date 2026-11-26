"""#2899 (#2278.12/.17) — LE schéma de tour multi-tour, défini UNE fois (`copilote_scenario_metadata.Tour`).

Avant : `Canonique.formulation` était une chaîne unique (un scénario = un tour) et `HumanReview.tour` recevait un
`case_tours` écrit à la main par l'appelant. Désormais le cas porte sa conversation (`Canonique.conversation`) ; son
nombre de tours en est DÉRIVÉ et c'est lui que la revue humaine vérifie — un seul schéma, deux consommateurs.
Un cas mono-tour reste byte-identique : sa conversation dérivée est son unique formulation.
"""

from __future__ import annotations

from app.eval.chat_human_review import HumanReview, HumanVerdict, validate_review
from tests.copilote_scenario_metadata import Canonique, Tour, problemes_de_tours
from tests.test_copilote_scenario_corpus import CORPUS


def _cas_mono() -> Canonique:
    return CORPUS[0]


def _en_conversation(cas: Canonique, *formulations: str) -> Canonique:
    tours = tuple(Tour(rang=i + 1, formulation=text) for i, text in enumerate(formulations))
    return cas._replace(conversation=tours)


def test_un_cas_mono_tour_se_lit_comme_une_conversation_d_un_tour() -> None:
    cas = _cas_mono()
    assert cas.conversation == ()
    assert cas.nb_tours == 1
    assert cas.tours == (Tour(rang=1, formulation=cas.formulation, outil=cas.outil),)


def test_un_cas_multi_tour_derive_son_nombre_de_tours_de_sa_conversation() -> None:
    cas = _en_conversation(_cas_mono(), "Prépare une relance pour Marie", "Plutôt par LinkedIn", "Envoie-la")
    assert cas.nb_tours == 3
    assert [t.rang for t in cas.tours] == [1, 2, 3]
    assert problemes_de_tours(cas.conversation) == ()


def test_le_schema_sait_dire_non_trou_doublon_formulation_vide() -> None:
    assert problemes_de_tours((Tour(1, "a"), Tour(3, "c")))  # trou
    assert problemes_de_tours((Tour(1, "a"), Tour(1, "b")))  # doublon
    assert problemes_de_tours((Tour(1, "a"), Tour(2, "  ")))  # formulation vide
    assert problemes_de_tours((Tour(2, "a"),))  # ne commence pas à 1


def test_la_revue_humaine_est_bornee_par_le_nombre_de_tours_du_cas_lui_meme() -> None:
    cas = _en_conversation(_cas_mono(), "un", "deux", "trois")
    famille = next(iter(cas.meta.personas))

    def revue(tour: int) -> HumanReview:
        return HumanReview(
            case_identifiant=cas.identifiant,
            reviewer_family=famille,
            verdict=HumanVerdict.CONFORME,
            commentaire="le tour est conforme à la règle écrite",
            date_iso="2026-10-17",
            tour=tour,
        )

    kwargs = {"case_identifiant": cas.identifiant, "case_personas": cas.meta.personas, "case_tours": cas.nb_tours}
    assert validate_review(revue(3), **kwargs) == ()
    assert any("tour" in p for p in validate_review(revue(4), **kwargs))


def test_le_schema_de_tour_n_existe_qu_a_un_endroit() -> None:
    from pathlib import Path

    review_src = (Path(__file__).parents[1] / "app" / "eval" / "chat_human_review.py").read_text(encoding="utf-8")
    assert "class Tour" not in review_src
