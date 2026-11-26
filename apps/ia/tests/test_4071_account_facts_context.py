"""#4071.2 — Laura reçoit les faits du compte (socle #4069) : elle DATE tout fait
ancien et ne NOMME JAMAIS sa provenance.

Golden qui sait dire NON : le bloc rendu ne contient aucun nom de fournisseur ni
de système interne, et un fait ancien y porte son âge en mots ; le prompt
complet sans faits reste byte-identique (aucun bloc)."""

from __future__ import annotations

import re

import pytest

from app.models.chat import ChatRequest
from app.prompts.bellum_advisor import build_system_prompt
from app.services.account_facts_context import account_facts_context_block
from app.services.context_mode import apply_context_mode

FACTS = (
    "- [2025-08-12 · il y a 14 mois] Besoin : Migration paie cloud\n"
    "- [2024-06-01 · il y a 2 ans] Affaire perdue : TMA SI RH\n"
    "- [2026-06-30 · il y a 3 mois] Observation de marché : prestataires observés : Alpha Conseil"
)

# Les noms qui ne doivent JAMAIS sortir de la bouche de Laura comme provenance d'un fait.
_PROVENANCE = re.compile(
    r"dataforge|mémoire marché|memoire marche|market memory|signal_history|crm_deal_facts|rag_documents|"
    r"hubspot|salesforce|pipedrive|apollo|pappers|firecrawl|brave",
    re.IGNORECASE,
)


def test_sans_fait_aucun_bloc():
    assert account_facts_context_block("") == ""
    assert account_facts_context_block(None) == ""
    assert account_facts_context_block("   ") == ""


def test_le_bloc_porte_les_faits_et_les_deux_regles():
    block = account_facts_context_block(FACTS)
    assert "il y a 14 mois" in block
    assert "Migration paie cloud" in block
    lowered = block.lower()
    # Règle 1 : dater tout fait ancien, avec son âge.
    assert "date" in lowered and "il y a" in lowered
    # Règle 2 : ne jamais nommer la provenance.
    assert "provenance" in lowered and "jamais" in lowered
    # Aucune probabilité, aucun poids.
    assert "probabilit" in lowered


def test_NON_le_bloc_ne_nomme_aucune_source():
    assert _PROVENANCE.search(account_facts_context_block(FACTS)) is None


def test_NON_le_bloc_est_borne():
    block = account_facts_context_block("- x\n" * 5000)
    assert len(block) < 8000


def _prompt(**kwargs):
    return build_system_prompt({}, {}, "", "", **kwargs)


def test_le_prompt_complet_porte_les_faits_et_reste_identique_sans_eux():
    with_facts = _prompt(account_facts_context=FACTS)
    without = _prompt()
    assert "il y a 14 mois" in with_facts
    assert account_facts_context_block(FACTS) in with_facts
    # Additif : retirer le bloc redonne exactement le prompt de base.
    assert with_facts.replace(account_facts_context_block(FACTS), "") == without
    assert without == _prompt(account_facts_context="")
    assert "FAITS DU COMPTE" not in without


@pytest.mark.parametrize("mode", ["neutral"])
def test_NON_un_mode_sans_historique_commercial_ne_recoit_aucun_fait(mode):
    req = ChatRequest(message="bonjour", user_id="u", context_mode=mode, account_facts_context=FACTS)
    narrowed, _ = apply_context_mode(req)
    assert narrowed.account_facts_context == ""


def test_NON_l_exclusion_stricte_ne_recoit_aucun_fait():
    req = ChatRequest(message="bonjour", user_id="u", exclude_workspace_data=True, account_facts_context=FACTS)
    narrowed, _ = apply_context_mode(req)
    assert narrowed.account_facts_context == ""
