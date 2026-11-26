"""#3201 (LAU-FINAL-207) / #3202 (LAU-FINAL-208) — les deux blocs de prompt
volatils ajoutés au tour de chat : contraintes combinées et archétype
d'entreprise. Même patron que #2721/#2679 (`test_laura_appelle_ses_outils.py`) :
un marqueur/route DÉCLENCHE, un témoin voisin ne déclenche rien, vide = "".
"""

from __future__ import annotations

import pytest

from app.prompts.intent_route import company_archetype_block, constraint_consistency_block
from app.services.compilers.intent_router import asks_about_company_archetype, route_chat_intent

ACCOUNTS_PHRASE = "Trouve-moi des comptes intéressants"
STARTUP_PHRASE = "Trouve-moi vingt startups French Tech récentes"


# ── #3201 — CONTRAINTES COMBINÉES, sur la route déterministe ────────────────


def test_3201_route_de_recherche_de_comptes_declenche_le_bloc() -> None:
    route = route_chat_intent(message=ACCOUNTS_PHRASE)
    assert route.intent == "chercher_du_business"
    block = constraint_consistency_block(route, "fr")
    assert block != ""
    assert "CONTRADICTOIRES" in block
    assert "arbitrage" in block


def test_3201_pas_de_route_de_recherche_pas_de_bloc() -> None:
    route = route_chat_intent(message="Bonjour")
    assert route.intent != "chercher_du_business"
    assert constraint_consistency_block(route, "fr") == ""


def test_3201_route_absente_rend_une_chaine_vide() -> None:
    assert constraint_consistency_block(None, "fr") == ""


@pytest.mark.parametrize("language", ["fr", "en"])
def test_3201_le_bloc_interdit_le_silence_sur_une_region_ou_une_exclusion(language: str) -> None:
    route = route_chat_intent(message=ACCOUNTS_PHRASE)
    block = constraint_consistency_block(route, language)
    needle = "région" if language == "fr" else "region"
    assert needle in block


# ── #3202 — ARCHÉTYPE D'ENTREPRISE, sur le marqueur du message ──────────────


@pytest.mark.parametrize(
    "message",
    [STARTUP_PHRASE, "Est-ce que c'est une scale-up ?", "Is this a spin-off of Capgemini?"],
)
def test_3202_un_marqueur_darchetype_est_reconnu(message: str) -> None:
    assert asks_about_company_archetype(message)


@pytest.mark.parametrize("message", ["Bonjour", "Trouve-moi des ETI industrielles en Rhône-Alpes"])
def test_3202_le_temoin_sans_archetype_ne_declenche_rien(message: str) -> None:
    assert asks_about_company_archetype(message) is None
    assert company_archetype_block(message, "fr") == ""


@pytest.mark.parametrize("language", ["fr", "en"])
def test_3202_le_bloc_interdit_de_reduire_larchetype_a_un_filtre(language: str) -> None:
    block = company_archetype_block(STARTUP_PHRASE, language)
    assert block != ""
    needle = "dix salariés" if language == "fr" else "ten employees"
    assert needle in block


def test_3202_le_bloc_demande_de_nommer_la_confiance() -> None:
    block = company_archetype_block(STARTUP_PHRASE, "fr")
    assert "non établi" in block
