"""#2146.2 — LE SOCLE ABSENT : un moteur de décision NOMMÉ.

« ARBITRAGE D'UNE DEMANDE — pour chaque requête, Laura choisit un seul
comportement principal parmi cinq. » Aucune règle nommée n'existait :
``git grep -i "decide_action\\|laura_router"`` rendait 0 résultat sur
``origin/main`` (confirmé par le triage du 24/09, commentaire #2898). Les cinq
comportements de la source, dans l'ordre où elle les énumère :

    1. RÉPONDRE DIRECTEMENT — les données nécessaires existent déjà.
    2. LANCER UN JOB — plusieurs recherches/croisements nécessaires.
    3. OUVRIR UNE SURFACE PRÉREMPLIE — inspection/correction d'un volume important.
    4. DEMANDER UNE CLARIFICATION — une ambiguïté change MATÉRIELLEMENT le résultat.
    5. EXPLIQUER UNE LIMITE — la capacité, la permission ou la donnée n'existe pas.

Ce fichier tient la RÈGLE, pas la formulation d'un texte : ``decide_action``
est une fonction PURE, aucun appel modèle, aucune E/S — les cinq signaux
d'entrée sont ceux que l'appelant (l'orchestrateur) sait déjà lire avant
d'ouvrir la conversation.
"""

from __future__ import annotations

from app.services.laura_router import LauraAction, RoutingSignals, decide_action


def signals(**overrides: object) -> RoutingSignals:
    base: dict[str, object] = {
        "capability_available": True,
        "ambiguous_and_material": False,
        "requires_multiple_searches": False,
        "requires_large_inspection": False,
        "data_already_known": True,
    }
    base.update(overrides)
    return RoutingSignals(**base)  # type: ignore[arg-type]


def test_2146_2_explique_une_limite_quand_la_capacite_est_absente():
    # #2146.12 — la capacité absente prime sur TOUT le reste : rien d'autre
    # n'est possible sans elle, y compris répondre ou clarifier.
    decision = decide_action(
        signals(capability_available=False, ambiguous_and_material=True, requires_multiple_searches=True)
    )
    assert decision.action == LauraAction.EXPLAIN_LIMIT


def test_2146_2_clarifie_quand_lambiguite_change_materiellement_le_resultat():
    # La clarification passe AVANT de lancer un travail lourd — doctrine
    # « DEMANDER AVANT DE CHERCHER » (bellum_advisor.py, _BLOCK_ASK_FIRST) :
    # une salve d'options coûte moins qu'une recherche à côté de la plaque.
    decision = decide_action(signals(ambiguous_and_material=True, requires_multiple_searches=True))
    assert decision.action == LauraAction.CLARIFY


def test_2146_9_lance_un_job_quand_plusieurs_recherches_sont_necessaires():
    decision = decide_action(signals(requires_multiple_searches=True, data_already_known=False))
    assert decision.action == LauraAction.LAUNCH_JOB


def test_2146_10_ouvre_une_surface_preremplie_pour_une_inspection_volumineuse():
    decision = decide_action(signals(requires_large_inspection=True, data_already_known=False))
    assert decision.action == LauraAction.OPEN_SURFACE


def test_2146_8_repond_directement_quand_les_donnees_sont_deja_connues():
    decision = decide_action(signals())
    assert decision.action == LauraAction.RESPOND


def test_2146_9_prime_sur_2146_10_quand_les_deux_signaux_sont_presents():
    # Un ordre STABLE : sans lui, deux appels sur les mêmes signaux pourraient
    # rendre deux actions différentes — la définition même d'une règle qui
    # n'en est pas une.
    decision = decide_action(signals(requires_multiple_searches=True, requires_large_inspection=True))
    assert decision.action == LauraAction.LAUNCH_JOB


def test_2146_20_une_decision_nest_jamais_une_execution():
    # Laura ne prétend jamais avoir exécuté une action non confirmée (#2146.20,
    # déjà tenu par bellum_advisor.py:926 — « tu ne prétends pas avoir exécuté
    # tant qu'un résultat technique n'a pas été reçu »). Le témoin ICI : une
    # décision porte un VERBE À L'INFINITIF (une intention), jamais un état
    # accompli.
    for decision_signals in (signals(), signals(requires_multiple_searches=True, data_already_known=False)):
        decision = decide_action(decision_signals)
        assert decision.action.value.islower()
        assert not decision.action.value.endswith("ed")


def test_2146_18_une_reponse_partielle_nomme_ce_qui_manque_et_le_debloqueur():
    # RÉPONSE PARTIELLE — exécute ce qui est possible, nomme le manque, propose
    # le déblocage. `missing_reason` / `unblock` ne sont portés QUE par
    # EXPLAIN_LIMIT : une décision RESPOND n'a rien à débloquer.
    decision = decide_action(signals(capability_available=False), missing_reason="messagerie non connectée")
    assert decision.action == LauraAction.EXPLAIN_LIMIT
    assert decision.missing_reason == "messagerie non connectée"


def test_2146_16_les_hypotheses_raisonnables_voyagent_avec_une_reponse_directe():
    # Hypothèses raisonnables ANNONCÉES puis CORRIGIBLES avant la réponse :
    # portées par la décision, jamais devinées par l'appelant.
    decision = decide_action(signals(), assumptions=["France", "250+ salariés"])
    assert decision.action == LauraAction.RESPOND
    assert decision.assumptions == ["France", "250+ salariés"]


def test_2146_16_pas_dhypothese_inventee_quand_lappelant_nen_fournit_aucune():
    decision = decide_action(signals())
    assert decision.assumptions == []
