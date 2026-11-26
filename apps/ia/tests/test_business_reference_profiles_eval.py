"""#3422 (LOT C18, retour bêta du 30/09/2026) — deux profils NOMMÉS du jeu de
tests métier de référence : « ESN de 15 consultants avec premier Business
Manager » et « ESN de 35 consultants avec plusieurs commerciaux ».

Même discipline que ``test_copilote_scope_eval_named_scenarios.py`` : aucun
appel au modèle — chaque scénario rejoue le MÉCANISME déterministe déjà câblé
en production (``classify_sales_structure`` / ``recommend_next_actions``,
appelés depuis ``app/routers/phase4_plan.py:1529`` via
``recommend_actions_from_context``), avec l'entrée exacte que le questionnaire
ESN produirait pour ce profil.

#3422 nomme 21 profils au total. Dix-neuf des autres profils recoupent des
mécanismes déjà prouvés ailleurs (chemin d'appelant cité au commentaire de
l'issue) ; ces deux-là — la taille d'équipe commerciale change le VOLUME
d'actions recommandé, pas seulement le score — n'avaient encore aucun test
nommé par le profil métier lui-même (seuls des tests génériques `_SOLO`/`_DUO`/
`_TEAM` existaient, `test_team_routines.py`)."""

from __future__ import annotations

from app.services.action_recommender import recommend_next_actions
from app.services.sales_context import build_sales_context, classify_sales_structure, sales_structure_from_context

# ── Profil 1 (#3422.2) — ESN de 15 consultants, PREMIER Business Manager ────


def test_esn_15_consultants_premier_business_manager_est_traitee_comme_fondateur_solo() -> None:
    """Une ESN de 15 consultants qui vient d'embaucher son PREMIER commercial
    (pas le fondateur lui-même) n'a, pour l'instant, qu'UNE personne qui vend :
    le volume d'actions doit rester celui d'un vendeur seul (3), jamais celui
    d'une équipe (5) — la même contrainte de capacité réelle que le fondateur
    solo, quel que soit son intitulé de poste."""
    reponse_questionnaire = "1 Business Manager"

    assert classify_sales_structure(reponse_questionnaire) == "founder_solo"

    actions = recommend_next_actions(
        verdict="GO",
        relationship_state="froid",
        horizon="7j",
        sales_structure=classify_sales_structure(reponse_questionnaire),
    )
    assert len(actions) == 3


# ── Profil 2 (#3422.3) — ESN de 35 consultants, PLUSIEURS commerciaux ───────


def test_esn_35_consultants_plusieurs_commerciaux_est_traitee_comme_une_equipe() -> None:
    """Une ESN de 35 consultants avec plusieurs commerciaux (5+, la bande
    « équipe » de p23) absorbe le plafond haut du plan — 5 actions, jamais le
    plafond fondateur solo (3)."""
    reponse_questionnaire = "5 commerciaux"

    assert classify_sales_structure(reponse_questionnaire) == "equipe"

    actions = recommend_next_actions(
        verdict="GO",
        relationship_state="froid",
        horizon="7j",
        sales_structure=classify_sales_structure(reponse_questionnaire),
    )
    assert len(actions) == 5


def test_les_deux_profils_ne_se_distinguent_pas_par_leffectif_consultant_mais_par_lequipe_commerciale() -> None:
    """Témoin transversal : ce n'est PAS le nombre de consultants (15 vs 35) qui
    change le volume d'actions — c'est la taille de l'équipe COMMERCIALE. Deux
    ESN de tailles très différentes mais avec la même structure commerciale
    (ici : un seul vendeur) reçoivent le même plafond."""
    esn_15_un_bm = classify_sales_structure("1 Business Manager")
    esn_petite_fondateur_seul = classify_sales_structure("je vends seul (fondateur)")
    assert esn_15_un_bm == esn_petite_fondateur_seul == "founder_solo"

    # Lu à l'identique depuis un SalesContext déjà émis (chemin réel de
    # `recommend_actions_from_context`, `app/services/action_recommender.py:436`) —
    # même pipeline que `test_team_routines.py::test_structure_is_readable_from_the_emitted_sales_context`.
    contexte_emis = build_sales_context({"salesTeamSize": "1 Business Manager"})
    assert sales_structure_from_context(contexte_emis) == "founder_solo"
