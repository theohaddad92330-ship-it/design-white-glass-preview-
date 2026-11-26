"""LUD.6 bis — la zone d'ouverture arrive en TEXTE (région nommée, ville) depuis l'API et du graphe."""

from __future__ import annotations

from app.graph.state import AnalysisState
from app.services.contact_zone import zone_departments


def test_region_name_is_read_like_its_code() -> None:
    assert zone_departments(["Bourgogne-Franche-Comté"]) == zone_departments(["27"])
    assert "58" in zone_departments(["bourgogne franche comte"])


def test_known_city_covers_its_department() -> None:
    assert zone_departments(["Lyon"]) == frozenset({"69"})


def test_unknown_text_guesses_nothing() -> None:
    assert zone_departments(["Atlantide"]) == frozenset()


def test_graph_state_carries_the_zone() -> None:
    assert "preferred_zone" in AnalysisState.__annotations__


def test_graph_request_accepts_the_zone() -> None:
    from app.routers.graph_analyze import GraphAnalyzeRequest

    assert GraphAnalyzeRequest(company_name="Arquus", preferred_zone=["27"]).preferred_zone == ["27"]
    assert GraphAnalyzeRequest(company_name="Arquus").preferred_zone == []
