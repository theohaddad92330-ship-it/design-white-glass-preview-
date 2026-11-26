"""#3221, #206.9 — comparer réponse avec méthode / sans méthode / générique.

Le ticket #3200 fournit ses propres exemples (section UTILISATION) : ce
fichier les rejoue tels quels plutôt que d'inventer un corpus.
"""

from __future__ import annotations

from app.eval.chat_method_decisiveness import (
    decisiveness_score,
    evaluate_method_comparison,
)

# Verbatim, section UTILISATION du ticket #3200.
_TICKET_DECISIVE_ANSWER = (
    "Je te déconseille cette route pour une raison simple : sans preuve ni accès, "
    "tu engages un cycle long avant même d'apprendre quelque chose."
)

_GENERIC_HEDGE = (
    "Cela dépend de plusieurs facteurs. Il faudrait évaluer la situation au cas par "
    "cas avant de se prononcer."
)

# Plus long, mais toujours un hedge — pour prouver que la longueur seule ne gagne pas.
_LONG_GENERIC_HEDGE = (
    "Cela dépend de plusieurs facteurs : la taille de l'entreprise, son secteur, son "
    "historique, la conjoncture, et bien d'autres éléments encore qu'il faudrait "
    "évaluer avec attention avant de se prononcer clairement sur la meilleure route "
    "à suivre dans ce contexte particulier, qui reste, comme souvent, à nuancer."
)


def test_le_texte_du_ticket_est_juge_decisif() -> None:
    result = decisiveness_score(_TICKET_DECISIVE_ANSWER)
    assert result.has_decision
    assert not result.hedges


def test_un_hedge_generique_nest_pas_juge_decisif() -> None:
    result = decisiveness_score(_GENERIC_HEDGE)
    assert not result.has_decision
    assert result.hedges


def test_une_citation_methode_bellum_est_detectee() -> None:
    texte = "Méthode Bellum : compte fermé sans accès — " + _TICKET_DECISIVE_ANSWER
    assert decisiveness_score(texte).cites_method
    assert not decisiveness_score(_TICKET_DECISIVE_ANSWER).cites_method


def test_avec_methode_gagne_quand_elle_decide_et_que_le_reste_hedge() -> None:
    verdict = evaluate_method_comparison(
        with_method=_TICKET_DECISIVE_ANSWER,
        without_method=_GENERIC_HEDGE,
        generic=_GENERIC_HEDGE,
    )
    assert verdict.with_method_wins
    assert verdict.with_method.has_decision


def test_plus_de_texte_ne_suffit_pas_a_gagner() -> None:
    """L'exigence même du ticket : « pas seulement davantage de texte ». Un hedge
    plus long que la réponse décisive ne doit jamais l'emporter."""
    assert decisiveness_score(_LONG_GENERIC_HEDGE).word_count > decisiveness_score(_TICKET_DECISIVE_ANSWER).word_count
    verdict = evaluate_method_comparison(
        with_method=_LONG_GENERIC_HEDGE,
        without_method=_TICKET_DECISIVE_ANSWER,
        generic=_GENERIC_HEDGE,
    )
    assert not verdict.with_method_wins
    assert "davantage de texte" not in verdict.reason  # la raison n'invoque jamais la longueur


def test_avec_methode_ne_gagne_pas_par_defaut_si_elle_hedge_aussi() -> None:
    """La mesure n'est pas truquée par l'étiquette du bras : si le texte «avec
    méthode» hedge lui aussi, il ne gagne pas automatiquement."""
    verdict = evaluate_method_comparison(
        with_method=_GENERIC_HEDGE,
        without_method=_TICKET_DECISIVE_ANSWER,
        generic=_TICKET_DECISIVE_ANSWER,
    )
    assert not verdict.with_method_wins
    assert verdict.reason


def test_le_verdict_rend_toujours_les_trois_scores_jamais_un_gagnant_nu() -> None:
    verdict = evaluate_method_comparison(
        with_method=_TICKET_DECISIVE_ANSWER, without_method=_GENERIC_HEDGE, generic=_GENERIC_HEDGE
    )
    assert verdict.with_method is not None
    assert verdict.without_method is not None
    assert verdict.generic is not None
    assert verdict.reason.strip()
