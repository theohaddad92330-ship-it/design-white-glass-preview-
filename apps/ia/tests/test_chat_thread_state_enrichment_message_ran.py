"""#3704 (RAN, recette ND 10/10 en prod, 4e rejeu) — « 5 entreprises finance IDF » puis « donne-moi
aussi des besoins » : la ligne Région était PERDUE et la liste changeait.

Les correctifs RT/RAI ne couvraient que l'appel qui porte `signals`. Le modèle peut aussi rendre
l'enrichissement par un autre champ (`keywords: ["besoins"]`, `technologies`) ou redire le secteur
sans `signals` : le fil ne reconnaissait alors pas la même recherche et repartait de zéro. La
DEMANDE de la personne (courte, « aussi / en plus … besoins / signaux / contacts ») est lue
directement : c'est un enrichissement de la liste déjà rendue, jamais un nouveau filtre.
"""

from __future__ import annotations

import pytest

from app.services.chat_requested_mode import set_turn_thread
from app.services.chat_thread_state import ThreadStateCollector


@pytest.fixture(autouse=True)
def _reset_turn() -> None:
    yield
    set_turn_thread("", [])


def _first_turn() -> ThreadStateCollector:
    collector = ThreadStateCollector()
    collector.record(
        "run_account_search",
        {"sectors": ["finance"], "region": ["11"], "limit": 5},
        {"accounts": []},
    )
    return collector


@pytest.mark.parametrize("message", ["donne-moi aussi des besoins", "Ajoute leurs besoins", "et leurs signaux aussi ?"])
def test_enrichment_message_with_besoins_in_keywords_keeps_every_criterion(message: str) -> None:
    set_turn_thread(message, [])
    effective, refinement = _first_turn().prepare("run_account_search", {"keywords": ["besoins"]})
    assert effective["region"] == ["11"]
    assert effective["sectors"] == ["finance"]
    # Le mot d'enrichissement n'est pas un critère de sélection : il ne remplace aucun mot-clé.
    assert "keywords" not in effective
    assert refinement is not None and refinement["previous_found"] is True


def test_enrichment_message_restating_the_sector_without_signals_keeps_the_region() -> None:
    set_turn_thread("donne-moi aussi des besoins", [])
    effective, refinement = _first_turn().prepare("run_account_search", {"sectors": ["finance"]})
    assert effective["region"] == ["11"]
    assert refinement is not None


def test_enrichment_message_naming_another_sector_still_starts_from_scratch() -> None:
    set_turn_thread("donne-moi aussi des besoins", [])
    raw = {"sectors": ["industry"]}
    effective, refinement = _first_turn().prepare("run_account_search", raw)
    assert effective is raw
    assert refinement is None


def test_enrichment_message_giving_another_region_is_a_real_change() -> None:
    set_turn_thread("donne-moi aussi des besoins", [])
    raw = {"sectors": ["finance"], "region": ["84"]}
    effective, refinement = _first_turn().prepare("run_account_search", raw)
    assert effective is raw
    assert refinement is None


def test_a_fresh_search_message_is_not_an_enrichment() -> None:
    set_turn_thread("trouve-moi 5 entreprises de la santé à Lyon", [])
    raw = {"sectors": ["finance"]}
    effective, refinement = _first_turn().prepare("run_account_search", raw)
    assert effective is raw
    assert refinement is None


def test_without_a_message_nothing_changes() -> None:
    raw = {"sectors": ["finance"]}
    effective, refinement = _first_turn().prepare("run_account_search", raw)
    assert effective is raw
    assert refinement is None
