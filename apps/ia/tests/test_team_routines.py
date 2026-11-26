"""Routines par taille d'équipe SALES (plan méthodo, cluster D §17).

Le plan se dimensionnait sur le nombre de CONSULTANTS ; un fondateur qui vend
seul recevait le même volume qu'une équipe de 5. Ces tests verrouillent les deux
côtés : la structure commerciale change réellement le volume/owner, ET un profil
sans `salesTeamSize` ne change strictement rien (prompt byte-identique).
"""

from __future__ import annotations

from app.services.action_recommender import MAX_ACTIONS, recommend_next_actions
from app.services.sales_context import (
    build_sales_context,
    classify_sales_structure,
    sales_structure_from_context,
)
from app.services.team_routines import (
    action_cap_for_structure,
    active_fronts_cap_for_structure,
    team_routines_block,
)

_SOLO = {"salesTeamSize": "je vends seul (fondateur)"}
_DUO = {"salesTeamSize": "2 commerciaux"}
_TEAM = {"salesTeamSize": "6 commerciaux"}


# ── 1) Classification de la structure commerciale ────────────────────────────


def test_structure_bands():
    assert classify_sales_structure("je vends seul (fondateur)") == "founder_solo"
    assert classify_sales_structure("3 commerciaux") == "duo_trio"
    assert classify_sales_structure("5 commerciaux") == "equipe"
    assert classify_sales_structure("12 sales") == "equipe"


def test_unknown_structure_is_never_guessed():
    assert classify_sales_structure(None) == "inconnu"
    assert classify_sales_structure("") == "inconnu"
    assert classify_sales_structure("pas d'équipe commerciale") == "inconnu"


def test_structure_is_readable_from_the_emitted_sales_context():
    # La structure voyage déjà dans le SalesContext émis : pas de changement de contrat.
    assert sales_structure_from_context(build_sales_context(_SOLO)) == "founder_solo"
    assert sales_structure_from_context(build_sales_context(_TEAM)) == "equipe"
    assert sales_structure_from_context(build_sales_context({})) == "inconnu"
    assert sales_structure_from_context(None) == "inconnu"


# ── 2) Le volume d'actions suit la capacité réelle d'exécution ───────────────


def test_founder_alone_gets_fewer_actions_than_a_sales_team():
    kwargs = {"verdict": "GO", "relationship_state": "froid", "horizon": "7j"}
    solo = recommend_next_actions(**kwargs, sales_structure="founder_solo")
    team = recommend_next_actions(**kwargs, sales_structure="equipe")
    assert len(solo) == 3
    assert len(team) == 5
    # Ce sont les MÊMES actions, tronquées au plus fort : rien n'est inventé pour
    # le fondateur, on lui retire seulement ce qu'il ne peut pas exécuter.
    assert [a["id"] for a in solo] == [a["id"] for a in team][:3]


def test_cap_never_falls_under_the_moteur_floor():
    solo = recommend_next_actions(verdict="STOP", sales_structure="founder_solo")
    assert len(solo) >= 3  # plancher MOTEUR p28 conservé


def test_unknown_structure_keeps_the_historical_cap():
    kwargs = {"verdict": "GO", "relationship_state": "froid", "horizon": "7j"}
    before = recommend_next_actions(**kwargs)
    after = recommend_next_actions(**kwargs, sales_structure="inconnu")
    assert after == before
    assert len(before) == MAX_ACTIONS
    assert action_cap_for_structure("inconnu", MAX_ACTIONS) == MAX_ACTIONS
    assert action_cap_for_structure(None, MAX_ACTIONS) == MAX_ACTIONS


# ── 3) Bloc de prompt : additif, et vide par défaut ──────────────────────────


def test_block_is_empty_without_a_declared_sales_team():
    # Cas par défaut (questionnaire non renseigné) → prompt byte-identique.
    assert team_routines_block({}) == ""
    assert team_routines_block(None) == ""
    assert team_routines_block({"size": "40"}) == ""
    assert team_routines_block({}, build_sales_context({})) == ""


def test_block_calibrates_volume_owner_and_threads():
    solo = team_routines_block(_SOLO)
    team = team_routines_block(_TEAM)
    assert "fondateur" in solo and "3 actions MAXIMUM" in solo
    assert "5 actions MAXIMUM" in team and "SDR" in team
    assert solo != team
    # Le duo n'est ni l'un ni l'autre.
    assert "4 actions MAXIMUM" in team_routines_block(_DUO)


def test_block_prefers_the_emitted_sales_context_over_the_raw_profile():
    block = team_routines_block({}, build_sales_context(_SOLO))
    assert "fondateur" in block


# ── 4) #2273.30 — le nombre de FRONTS ACTIFS (comptes suivis en parallèle,
# pas les actions dans un compte) suit lui aussi la capacité réelle ─────────


def test_active_fronts_cap_scales_with_structure_never_from_the_action_cap():
    # Un fondateur seul suit MOINS de comptes activement qu'une équipe de 5+ —
    # une constante NOMMÉE dans ROUTINES, pas une conversion depuis action_cap
    # (deux dimensions distinctes : combien d'actions DANS un compte, combien
    # de comptes suivis EN PARALLÈLE).
    solo = active_fronts_cap_for_structure("founder_solo", default=10)
    team = active_fronts_cap_for_structure("equipe", default=10)
    assert solo < team
    assert solo == 1  # « 1 seul angle tenu jusqu'au bout » — même discipline que `threads`.


def test_active_fronts_cap_never_exceeds_the_default_ceiling():
    # Comme `action_cap_for_structure` : le plafond structurel ne peut
    # qu'ABAISSER un plafond déjà plus bas ailleurs, jamais l'élever.
    assert active_fronts_cap_for_structure("equipe", default=2) == 2


def test_unknown_structure_keeps_the_historical_fronts_cap():
    assert active_fronts_cap_for_structure("inconnu", default=7) == 7
    assert active_fronts_cap_for_structure(None, default=7) == 7


def test_block_names_the_active_fronts_cap():
    solo = team_routines_block(_SOLO)
    team = team_routines_block(_TEAM)
    assert "Comptes suivis activement en parallèle" in solo
    assert "1 compte" in solo
    assert "5 comptes" in team
