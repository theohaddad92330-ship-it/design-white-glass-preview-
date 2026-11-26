"""BEL-SC-222 (#3251) — le rôle et le stade ESN adaptent /chat, pas seulement
le pipeline d'analyse.

`classify_esn_stage` (`app.services.esn_stage`) et `classify_sales_structure`
(`app.services.sales_context`) sont déjà le socle canonique unique du produit,
déjà consommés par score/contacts/actions/plan/messages — mais jamais par
Laura en chat. Ce test verrouille le contrat de rendu (même patron que
`test_laura_authority_scope.py`) : absent → bloc vide, jamais un stade deviné
à partir d'un profil qui n'a rien déclaré ; les quatre profils de l'exemple du
ticket (#3251, section EXEMPLE) rendent des blocs qui se distinguent.
"""

from __future__ import annotations

from app.prompts.laura_operating_context import build_operating_context_block


def test_profil_vide_ne_restreint_rien() -> None:
    """Rien de déclaré ⇒ bloc vide (GA-18/GA-19) — jamais un stade « petite »
    deviné pour combler une absence."""
    assert build_operating_context_block({}) == ''


def test_role_seul_suffit_a_produire_un_bloc() -> None:
    block = build_operating_context_block({'sellerRole': 'Business Developer'})
    assert 'Business Developer' in block
    assert 'Stade de l' not in block


def test_fondateur_seul_en_creation() -> None:
    """EXEMPLE #3251 — un fondateur seul en création."""
    block = build_operating_context_block(
        {'sellerRole': 'Fondateur / CEO', 'size': '2', 'salesTeamSize': 'Seul, fondateur/indépendant'}
    )
    assert 'freelance' in block.lower()
    assert 'fondateur vend seul' in block


def test_business_manager_avec_douze_consultants() -> None:
    """EXEMPLE #3251 — un BM avec douze consultants."""
    block = build_operating_context_block(
        {'sellerRole': 'Business Manager', 'size': '12', 'consultantsManagedByUserBand': '6 à 15 consultants'}
    )
    assert 'Business Manager' in block
    assert 'petite ESN' in block or 'structuration' in block.lower()
    assert '6 à 15 consultants' in block


def test_bd_dans_une_esn_de_80_personnes() -> None:
    """EXEMPLE #3251 — un BD dans une ESN de 80 personnes."""
    block = build_operating_context_block({'sellerRole': 'Business Developer', 'size': '80', 'salesTeamSize': '6'})
    assert 'établie' in block.lower()
    assert 'équipe commerciale de 5' in block


def test_directeur_agence_avec_quatre_commerciaux() -> None:
    """EXEMPLE #3251 — un directeur d'agence avec quatre commerciaux."""
    block = build_operating_context_block({'sellerRole': "Directeur d'agence", 'salesTeamSize': '4'})
    assert '2 à 4 commerciaux' in block


def test_les_quatre_exemples_du_ticket_produisent_des_blocs_distincts() -> None:
    """Le NO-GO du ticket (#3251) : deux profils différents ne doivent jamais
    rendre le même cadrage."""
    founder = build_operating_context_block(
        {'sellerRole': 'Fondateur / CEO', 'size': '2', 'salesTeamSize': 'Seul, fondateur/indépendant'}
    )
    bm = build_operating_context_block(
        {'sellerRole': 'Business Manager', 'size': '12', 'consultantsManagedByUserBand': '6 à 15 consultants'}
    )
    bd = build_operating_context_block({'sellerRole': 'Business Developer', 'size': '80', 'salesTeamSize': '6'})
    director = build_operating_context_block({'sellerRole': "Directeur d'agence", 'salesTeamSize': '4'})
    assert len({founder, bm, bd, director}) == 4


def test_structure_hors_catalogue_nest_jamais_devinee() -> None:
    """`salesTeamSize` illisible ⇒ `classify_sales_structure` rend "inconnu",
    qui n'a pas de libellé (#2033.10, même discipline que l'autorité) : la
    ligne « Structure commerciale » sort du bloc plutôt que d'afficher
    "inconnu" à l'utilisateur."""
    block = build_operating_context_block({'salesTeamSize': 'xyz non parsable'})
    assert 'Structure commerciale' not in block


def test_ne_touche_a_aucune_permission_ni_role_despace() -> None:
    """Même garde que `laura_authority_scope` (GA-26) : ce module compose du
    texte de prompt, jamais une permission ni un rôle d'espace."""
    import inspect

    source = inspect.getsource(build_operating_context_block)
    for forbidden in ('permission', 'WorkspaceRole', 'can(', 'guard'):
        assert forbidden not in source


# ── #3385 (recette prod 03/10) — la taille déclarée change quelque chose de NOMMÉ ──
# 30-80 → 1-10 donnait « aucun compte ne passe en priorité » : le bloc ne portait
# qu'une étiquette de stade, que le modèle ignorait. Il porte maintenant ce que le
# stade CHANGE (stratégie, volume tenable) — lus dans `STAGE_PLAYBOOK`, la table p3
# unique — et la consigne de les nommer dans la priorité.


def test_3385_la_taille_declaree_apporte_strategie_et_volume_du_stade() -> None:
    from app.services.esn_stage import STAGE_PLAYBOOK

    block = build_operating_context_block({'size': '1-10'})  # borne haute 10 → petite
    assert STAGE_PLAYBOOK['petite']['strategie'] in block
    assert STAGE_PLAYBOOK['petite']['volume'] in block
    assert 'tranche déclarée : 1-10' in block


def test_3385_deux_tailles_donnent_deux_conseils_differents() -> None:
    small = build_operating_context_block({'size': '1-10'})
    mid = build_operating_context_block({'size': '30-80'})
    assert small != mid
    from app.services.esn_stage import STAGE_PLAYBOOK

    assert STAGE_PLAYBOOK['etablie']['volume'] in mid
    assert STAGE_PLAYBOOK['etablie']['volume'] not in small


def test_3385_la_consigne_demande_de_nommer_le_stade_dans_la_priorite() -> None:
    block = build_operating_context_block({'size': '1-10'})
    assert 'NOMME le stade' in block
    assert 'priorité' in block


def test_3385_sans_taille_declaree_aucune_ligne_de_stade_n_est_inventee() -> None:
    block = build_operating_context_block({'sellerRole': 'Business Developer'})
    assert 'tranche déclarée' not in block
    assert 'Volume tenable' not in block
    assert 'NOMME le stade' not in block
