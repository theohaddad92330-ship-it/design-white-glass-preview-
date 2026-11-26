"""#3338 (LAU-FINAL-248) — garde de ``laura_opportunity_vocabulary.BLOCK_OPPORTUNITY_VOCABULARY``."""

from __future__ import annotations

from app.prompts.bellum_advisor import build_system_prompt
from app.prompts.laura_opportunity_vocabulary import BLOCK_OPPORTUNITY_VOCABULARY

BARE = build_system_prompt({}, {}, "", "")
HORS_BLOC = BARE.replace(BLOCK_OPPORTUNITY_VOCABULARY, "")

#: #3338 — les neuf catégories que l'issue nomme, chacune dans son propre libellé.
_NINE_CATEGORIES: tuple[str, ...] = (
    "BESOIN CLIENT VÉRIFIÉ",
    "BESOIN INTERNE À VÉRIFIER",
    "SIGNAL ACTUEL",
    "RECRUTEMENT SALARIÉ",
    "PROJET OU PROGRAMME DÉTECTÉ",
    "COMPATIBILITÉ HISTORIQUE",
    "COMPTE CANDIDAT",
    "OPPORTUNITÉ WORKSPACE",
    "MATCH CONSULTANT",
)


def test_the_corpus_is_not_empty():
    assert BARE
    assert BLOCK_OPPORTUNITY_VOCABULARY in BARE


def test_the_nine_categories_are_all_named():
    for category in _NINE_CATEGORIES:
        assert category in BLOCK_OPPORTUNITY_VOCABULARY, category


def test_recruitment_is_not_a_prestation_need():
    assert "Cela ne prouve PAS un recours à la prestation" in BLOCK_OPPORTUNITY_VOCABULARY


def test_a_candidate_account_is_not_an_immediate_client():
    assert (
        "appeler un simple compte candidat un client potentiel immédiat"
        in BLOCK_OPPORTUNITY_VOCABULARY
    )


def test_removing_the_block_drops_every_category():
    for category in _NINE_CATEGORIES:
        assert category not in HORS_BLOC, category
