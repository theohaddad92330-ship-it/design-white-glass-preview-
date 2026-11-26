"""#3386 — la matrice RÔLE × STADE change vraiment ce que Laura propose.

Constat de recette (10/10) : « par quoi je commence cette semaine ? » en
Business Developer puis en Fondateur donnait deux réponses qui commençaient par
le même compte. Ces tests savent dire NON : deux rôles → deux ensembles
d'ACTIONS PROPOSÉES différents ; rôle illisible → aucune fiche.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from app.prompts.laura_operating_context import build_operating_context_block, weekly_priority_turn_block
from app.services.esn_stage import ESN_STAGES, STAGE_PLAYBOOK
from app.services.role_playbook import (
    ROLE_BLOCK_MAX_CHARS,
    ROLE_LABELS,
    ROLE_PLAYBOOK,
    ROLE_STAGE_CROSS,
    ROLES,
    RUBRIQUES,
    STAGE_MODULATION,
    build_role_block,
    classify_seller_role,
    render_matrix_markdown,
)

_DOC = Path(__file__).resolve().parents[3] / 'agent_docs' / 'roles-stades-matrice.md'


@pytest.mark.parametrize(
    ('text', 'expected'),
    [
        ('Fondateur / CEO', 'fondateur'),
        ('CEO', 'fondateur'),
        ('Président', 'fondateur'),
        ('Co-fondatrice', 'fondateur'),
        ("Directeur d'agence", 'directeur_agence'),
        ('Directeur de BU', 'directeur_agence'),
        ('Directeur commercial', 'manager_commercial'),
        ('Head of Sales', 'manager_commercial'),
        ('Vice President Sales', 'manager_commercial'),
        ('Manager commercial', 'manager_commercial'),
        ('Business Manager', 'business_manager'),
        ('BM', 'business_manager'),
        ('account manager', 'business_manager'),
        ('Business Developer', 'business_developer'),
        ('Bizdev', 'business_developer'),
        ('SDR / BDR', 'business_developer'),
        ('Talent Manager / Recruteur', 'recruteur'),
        ('Responsable staffing', 'recruteur'),
        ('Sales Ops', 'sales_ops'),
        ('Responsable des opérations commerciales', 'sales_ops'),
        ('  BUSINESS   DÉVELOPPER ', 'business_developer'),
    ],
)
def test_classify_seller_role_tolerant(text: str, expected: str) -> None:
    assert classify_seller_role(text) == expected


@pytest.mark.parametrize('text', ['', None, 'Pur commercial', 'Je ne sais pas', 'Astronaute', 42])
def test_role_illisible_ne_devine_rien(text: object) -> None:
    assert classify_seller_role(text) is None
    assert build_role_block(text, '50') == ''


def test_la_matrice_est_complete() -> None:
    assert set(ROLE_PLAYBOOK) == set(ROLES) == set(ROLE_LABELS)
    for role in ROLES:
        assert set(ROLE_PLAYBOOK[role]) == {key for key, _ in RUBRIQUES}, role
        assert all(ROLE_PLAYBOOK[role][key].strip() for key, _ in RUBRIQUES)
    # Une seule échelle : celle du produit.
    assert set(STAGE_MODULATION) == set(ESN_STAGES) == set(STAGE_PLAYBOOK)
    for (role, stage), case in ROLE_STAGE_CROSS.items():
        assert role in ROLES and stage in ESN_STAGES
        assert case.as_role is None or case.as_role in ROLES


def test_doctrine_aucune_probabilite_aucun_nom_de_source() -> None:
    corpus = (
        ' '.join(v for card in ROLE_PLAYBOOK.values() for v in card.values())
        + ' '.join(STAGE_MODULATION.values())
        + ' '.join(c.note for c in ROLE_STAGE_CROSS.values())
    ).lower()
    for banni in ('probabilité', 'chance de', 'skaizen', 'sales connect', 'sanofi'):
        assert banni not in corpus, banni


def test_meme_profil_bd_vs_fondateur_les_actions_proposees_different() -> None:
    """LE test du constat : même profil, seul le rôle change → les ACTIONS
    PROPOSÉES diffèrent, pas seulement le libellé."""
    base = {'size': '30'}
    bd = build_operating_context_block({**base, 'sellerRole': 'Business Developer'})
    ceo = build_operating_context_block({**base, 'sellerRole': 'Fondateur / CEO'})
    assert ROLE_PLAYBOOK['business_developer']['propose'] in bd
    assert ROLE_PLAYBOOK['fondateur']['propose'] in ceo
    assert ROLE_PLAYBOOK['fondateur']['propose'] not in bd
    assert ROLE_PLAYBOOK['business_developer']['propose'] not in ceo
    assert 'portes et opportunités à qualifier' in bd
    assert '2-3 arbitrages' in ceo and 'rendez-vous C-level' in ceo and 'dispatcher' in ceo
    # le stade, lui, est commun et vient de STAGE_PLAYBOOK
    assert STAGE_PLAYBOOK['structuration']['strategie'] in bd
    assert STAGE_PLAYBOOK['structuration']['strategie'] in ceo


def test_role_non_reconnu_garde_le_rendu_historique() -> None:
    block = build_operating_context_block({'sellerRole': 'Pur commercial', 'size': '30'})
    assert 'Rôle déclaré : Pur commercial' in block
    assert 'Fiche de rôle' not in block


def test_tour_cette_semaine_differe_selon_le_role() -> None:
    q = 'Quelle est ma priorité cette semaine ?'
    bd = weekly_priority_turn_block({'sellerRole': 'Business Developer', 'size': '30'}, q)
    ceo = weekly_priority_turn_block({'sellerRole': 'Fondateur / CEO', 'size': '30'}, q)
    assert ROLE_PLAYBOOK['business_developer']['propose'] in bd
    assert ROLE_PLAYBOOK['fondateur']['propose'] in ceo
    assert ROLE_PLAYBOOK['fondateur']['produire'] in ceo
    assert ROLE_PLAYBOOK['business_developer']['deconseille'] in bd
    assert bd != ceo


def test_tour_cette_semaine_sans_role_reste_historique() -> None:
    q = 'Quelle est ma priorité cette semaine ?'
    assert 'Angle propre au rôle' not in weekly_priority_turn_block({'size': '30'}, q)
    assert weekly_priority_turn_block({'sellerRole': 'Fondateur'}, 'bonjour') == ''


def test_case_croisee_bd_freelance_le_fondateur_chasse() -> None:
    block = build_role_block('Business Developer', '3')
    assert "c'est le fondateur qui chasse" in block


def test_directeur_agence_sous_structuration_traite_comme_dirigeant() -> None:
    petite = build_role_block("Directeur d'agence", '10')
    assert ROLE_LABELS['fondateur'] in petite
    assert ROLE_PLAYBOOK['fondateur']['propose'] in petite
    etabli = build_role_block("Directeur d'agence", '120')
    assert ROLE_LABELS['directeur_agence'] in etabli
    assert "pas d'agence" not in etabli


def test_sans_taille_pas_de_stade_devine() -> None:
    block = build_role_block('Business Developer')
    assert 'À ce stade' not in block and 'Cas particulier' not in block
    assert ROLE_PLAYBOOK['business_developer']['propose'] in block


def test_budget_de_prompt_tenu_pour_toutes_les_combinaisons() -> None:
    sizes = ('2', '10', '30', '120', '400', None)
    pire = 0
    for role in ROLES:
        for size in sizes:
            pire = max(pire, len(build_role_block(ROLE_LABELS[role], size)))
    assert pire <= ROLE_BLOCK_MAX_CHARS, pire


def test_la_version_lisible_est_identique_a_la_donnee() -> None:
    """Un réglage, un endroit : le doc est GÉNÉRÉ (UPDATE_ROLE_MATRIX=1)."""
    attendu = render_matrix_markdown()
    if os.environ.get('UPDATE_ROLE_MATRIX') == '1':
        _DOC.write_text(attendu, encoding='utf-8')
    assert _DOC.read_text(encoding='utf-8') == attendu
