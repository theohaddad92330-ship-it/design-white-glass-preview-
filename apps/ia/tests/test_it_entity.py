"""IT / digital entity detection — the ESN's prime P1 target inside a group."""

from __future__ import annotations

import pytest

from app.services.it_entity import is_it_entity


@pytest.mark.parametrize(
    "name",
    [
        "Euro-Information",  # Crédit Mutuel Alliance Fédérale IT arm
        "Euro Information",
        "GICM (Groupement Informatique Crédit Mutuel)",
        "GIE Informatique CM",  # the case \bGIE\b would have wrongly filtered
        "Crédit Agricole Technologies & Services",
        "SG Global Technology Services",
        "BNP Paribas IT Group",
        "Société Générale Digital",
        "Orange Cyberdefense",
        "AXA Data Services",
        "Direction des Systèmes d'Information",
        "Services Numériques Mutualisés",
        "Worldline Cloud",
        "Capgemini Software",
    ],
)
def test_it_entities_detected(name: str) -> None:
    assert is_it_entity(name), name


@pytest.mark.parametrize(
    "name",
    [
        "SCI Saint-Pères",
        "SOGE Immobilier Participations",
        "SG Holding Foncière",
        "Suravenir Assurances",
        "BoursoBank",
        "GIE Commerc C C Bois St Pères",  # GIE, but NOT IT → stays noise
        "Monext",
        "",
        "   ",
        None,
    ],
)
def test_non_it_entities_rejected(name: str | None) -> None:
    assert not is_it_entity(name), name


def test_it_match_is_case_insensitive() -> None:
    assert is_it_entity("euro-INFORMATIQUE")
    assert is_it_entity("groupement INFORMATIQUE")
