"""R17 15/10 (#3917) — fiche Renault : « Filiale de ETG » (tête de groupe SIREN 318456324) était le PREMIER
détenteur lu dans le graphe, alors que la société a plusieurs détenteurs. Pas de tête de groupe devinée."""

from __future__ import annotations

from app.services.pappers.cartographie import extract_group_affiliation, extract_parent_companies
from app.services.pappers.models import CorporateGraph


def _graph(companies: list[tuple[str, str, str]], edges: list[str]) -> CorporateGraph:
    return CorporateGraph(
        entreprises=[{"id": i, "siren": s, "nom_entreprise": n} for i, s, n in companies],
        personnes=[],
        liens_entreprises_personnes=[],
        liens_entreprises_entreprises=edges,
    )


def test_un_seul_detenteur_donne_la_tete_de_groupe() -> None:
    graph = _graph([("e1", "443061841", "GOOGLE FRANCE"), ("e3", "987654321", "ALPHABET")], ["e3-e1"])
    affiliation = extract_group_affiliation(graph, "443061841")
    assert affiliation is not None and affiliation.head_siren == "987654321"


def test_deux_detenteurs_distincts_ne_donnent_AUCUNE_tete_de_groupe() -> None:
    graph = _graph(
        [("r", "780129987", "RENAULT SAS"), ("a", "318456324", "ETG"), ("b", "111111118", "AUTRE ACTIONNAIRE")],
        ["a-r", "b-r"],
    )
    assert extract_group_affiliation(graph, "780129987") is None


def test_un_nom_illisible_ne_fait_pas_une_tete_de_groupe() -> None:
    graph = _graph([("e1", "443061841", "FILLE"), ("e3", "987654321", " ")], ["e3-e1"])
    assert extract_group_affiliation(graph, "443061841") is None
    assert extract_parent_companies(graph, "443061841") == []
