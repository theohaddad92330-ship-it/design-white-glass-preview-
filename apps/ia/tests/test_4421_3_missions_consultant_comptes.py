"""#4421.3 (mesure prod 29/10) — « trouve-moi des missions pour ce consultant » rendait 30 lignes d'OFFRES : le modèle
choisissait `search_job_offers` (LAURA-OFFRES-4563, « avec ou sans consultant ») au lieu de `find_accounts_for_talent`.
Le routeur disait déjà `marche_inverse` ; personne ne l'appelait. Ici : l'appelant (l'orchestrateur) force l'outil
des comptes au premier round et retire l'outil d'offres du tour."""

from __future__ import annotations

import pytest

from app.services import chat_orchestrator
from app.services.compilers.intent_router import asks_reverse_market_for_talent

ACCOUNTS = "find_accounts_for_talent"
OFFERS = "search_job_offers"
TOOLS = [{"name": ACCOUNTS}, {"name": OFFERS}, {"name": "web_search"}]


@pytest.mark.parametrize(
    "message",
    [
        "trouve-moi des missions pour ce consultant",
        "Trouve moi des missions pour ce profil",
        "où placer Hugo Houyez ?",
        "find missions for this consultant",
    ],
)
def test_reverse_market_is_recognised(message: str) -> None:
    assert asks_reverse_market_for_talent(message)


@pytest.mark.parametrize(
    "message",
    [
        "trouve-moi des offres vue et java sur Lille",
        "quelles missions Python en Occitanie ?",
        "des comptes pour la banque",
    ],
)
def test_plain_offer_searches_are_left_alone(message: str) -> None:
    # Contrôle négatif : une recherche d'offres sans consultant garde `search_job_offers`.
    assert not asks_reverse_market_for_talent(message)
    assert chat_orchestrator._forced_talent_accounts_kwargs(0, message, TOOLS) == {}
    assert chat_orchestrator._without_offers_search_for_talent(message, TOOLS) == TOOLS


def test_round_zero_forces_the_accounts_tool_and_only_round_zero() -> None:
    message = "trouve-moi des missions pour ce consultant"
    assert chat_orchestrator._forced_talent_accounts_kwargs(0, message, TOOLS) == {"force_tool": ACCOUNTS}
    assert chat_orchestrator._forced_talent_accounts_kwargs(1, message, TOOLS) == {}
    assert chat_orchestrator._forced_talent_accounts_kwargs(0, message, [{"name": OFFERS}]) == {}


def test_offers_tool_is_withheld_on_a_talent_turn() -> None:
    kept = chat_orchestrator._without_offers_search_for_talent("trouve-moi des missions pour ce consultant", TOOLS)
    assert [t["name"] for t in kept] == [ACCOUNTS, "web_search"]
