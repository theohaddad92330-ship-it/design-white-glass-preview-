"""#3704 (recette MN prod, api 41f1f288) — 1er tour : finance + Île-de-France ; 2e tour
« donne-moi aussi des besoins » : le modèle RÉÉCRIT `sectors` (identique) mais OMET la région,
sans `refine` → le fil repartait de zéro, région perdue, liste changée. Un enrichissement par
signaux n'est JAMAIS un filtre : les critères du tour précédent se gardent tous."""

from __future__ import annotations

from app.services.chat_thread_state import ThreadStateCollector


def _first_turn() -> ThreadStateCollector:
    collector = ThreadStateCollector()
    collector.record(
        "run_account_search",
        {"sectors": ["finance"], "region": ["11"], "limit": 5},
        {"accounts": []},
    )
    return collector


def test_needs_follow_up_restating_the_sector_keeps_the_region() -> None:
    collector = _first_turn()
    effective, refinement = collector.prepare(
        "run_account_search", {"sectors": ["Finance"], "signals": ["hiring"]}
    )
    assert effective["region"] == ["11"]
    assert effective["signals"] == ["hiring"]
    assert refinement is not None and refinement["previous_found"] is True


def test_needs_follow_up_restating_the_sector_as_a_bare_string_keeps_the_region() -> None:
    # #3704 (recette prod 10/10) — le modèle passe parfois un scalaire ("Finance") là où le schéma
    # attend une liste : sans lecture tolérante, le secteur « différait » et la région était perdue.
    collector = _first_turn()
    effective, refinement = collector.prepare("run_account_search", {"sectors": "Finance", "signals": ["hiring"]})
    assert effective["region"] == ["11"]
    assert refinement is not None


def test_needs_follow_up_restating_a_longer_sector_label_keeps_the_region() -> None:
    collector = _first_turn()
    effective, _ = collector.prepare(
        "run_account_search", {"sectors": ["Banque, finance"], "signals": ["hiring"]}
    )
    assert effective["region"] == ["11"]


def test_needs_follow_up_naming_another_sector_still_starts_from_scratch() -> None:
    collector = _first_turn()
    raw = {"sectors": ["industry"], "signals": ["hiring"]}
    effective, refinement = collector.prepare("run_account_search", raw)
    assert effective is raw
    assert refinement is None


def test_same_sector_without_signals_is_not_merged() -> None:
    collector = _first_turn()
    raw = {"sectors": ["finance"]}
    effective, refinement = collector.prepare("run_account_search", raw)
    assert effective is raw
    assert refinement is None
