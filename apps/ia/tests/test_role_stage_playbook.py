"""#3386 (décision Louis 11/10, « fais tout ») — la COMBINAISON rôle × stade atteint Laura.

Le tableau des 28 combinaisons vit dans ``packages/contracts`` (un seul endroit) ;
le service IA en lit une copie GÉNÉRÉE (``role_stage_playbook.json``). Ces tests
savent dire NON : une copie dont les rôles, les bornes de stade ou la lecture du
rôle déclaré divergeraient de ceux du service ; un prompt identique pour deux
stades ; une cellule servie sans taille déclarée (stade deviné).
"""

from __future__ import annotations

import pytest

from app.prompts.laura_operating_context import weekly_priority_turn_block
from app.services.esn_stage import _STAGE_UPPER_BOUNDS, ESN_STAGES
from app.services.role_playbook import (
    ROLE_BLOCK_MAX_CHARS,
    ROLE_LABELS,
    ROLE_STAGE_TABLE,
    ROLES,
    STADE_OF_ESN_STAGE,
    build_role_block,
    classify_seller_role,
    role_stage_cell,
)


def test_la_copie_generee_parle_des_memes_roles_que_le_service() -> None:
    assert tuple(ROLE_STAGE_TABLE["roles"]) == ROLES
    assert set(ROLE_STAGE_TABLE["cells"]) == set(ROLES)
    for role in ROLES:
        assert set(ROLE_STAGE_TABLE["cells"][role]) == set(ROLE_STAGE_TABLE["stades"])
        for stade in ROLE_STAGE_TABLE["stades"]:
            dims = ROLE_STAGE_TABLE["cells"][role][stade]["dims"]
            assert set(dims) == set(ROLE_STAGE_TABLE["dimensions"]), (role, stade)
    assert len(ROLE_STAGE_TABLE["dimensions"]) == 8
    assert sum(len(ROLE_STAGE_TABLE["cells"][r]) for r in ROLES) == 28


def test_les_quatre_stades_sont_projetes_sur_l_unique_echelle_du_produit() -> None:
    assert ROLE_STAGE_TABLE["stadeUpperBounds"] == [bound for bound, _ in _STAGE_UPPER_BOUNDS[:3]]
    assert set(STADE_OF_ESN_STAGE) == set(ESN_STAGES)
    assert set(STADE_OF_ESN_STAGE.values()) == set(ROLE_STAGE_TABLE["stades"])


@pytest.mark.parametrize("title", sorted(ROLE_STAGE_TABLE["userRoleToRole"]))
def test_le_web_et_laura_lisent_le_meme_role(title: str) -> None:
    assert classify_seller_role(title) == ROLE_STAGE_TABLE["userRoleToRole"][title]


def test_meme_role_autre_stade_laura_recoit_une_autre_combinaison() -> None:
    solo = build_role_block("Fondateur / CEO", "3")
    grande = build_role_block("Fondateur / CEO", "400")
    cell_solo = role_stage_cell("fondateur", "freelance")
    cell_grande = role_stage_cell("fondateur", "grande")
    assert cell_solo is not None and cell_grande is not None
    assert cell_solo["dims"]["produire"] in solo
    assert cell_grande["dims"]["produire"] in grande
    assert cell_solo["dims"]["produire"] not in grande
    assert "rien n’est retiré" in solo


def test_la_combinaison_dit_un_ordre_jamais_un_retrait() -> None:
    block = build_role_block("Business Developer", "30")
    assert "EN PREMIER" in block
    for mot in ("masque", "cache", "retire "):
        assert mot not in block.lower(), mot


def test_sans_taille_aucune_combinaison() -> None:
    block = build_role_block("Business Developer")
    assert "Ta combinaison" not in block
    assert role_stage_cell("business_developer", None) is None


def test_le_tour_cette_semaine_ouvre_sur_les_actions_de_la_combinaison() -> None:
    q = "Quelle est ma priorité cette semaine ?"
    petite = weekly_priority_turn_block({"sellerRole": "Business Manager", "size": "10"}, q)
    cell = role_stage_cell("business_manager", "petite")
    assert cell is not None
    assert cell["dims"]["actions_laura"] in petite


def test_budget_de_prompt_tenu_pour_les_28_combinaisons() -> None:
    pire = max(
        len(build_role_block(ROLE_LABELS[role], size))
        for role in ROLES
        for size in ("2", "10", "30", "120", "400", None)
    )
    assert pire <= ROLE_BLOCK_MAX_CHARS, pire
