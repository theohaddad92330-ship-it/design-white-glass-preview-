"""#3820 — le nom du site/ville atteint RÉELLEMENT la phase 1.

``scope_filter.py``/``_scope_directive`` seuls ne prouvent rien : le motif de ce
dépôt est « du code juste, testé, que personne n'appelle ». Ici on suit le
chemin de bout en bout : ``scope_selection.geo_areas`` (contrat partagé,
``geo_perimeter: "city"``) → état du graphe → ``research_node`` →
``ResearchRequest.scope_city`` (qui l'injecte dans la consigne de périmètre).
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

import app.graph.nodes as nodes
from app.models.research import ResearchRequest, ResearchResponse


def test_la_requete_de_recherche_porte_le_nom_du_site_et_vaut_none_par_defaut() -> None:
    assert ResearchRequest(company_name="JCDecaux", scope_city="Lille").scope_city == "Lille"
    assert ResearchRequest(company_name="JCDecaux").scope_city is None


@pytest.mark.asyncio
async def test_research_node_transmet_la_ville_quand_le_cadrage_est_une_ville(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    research = AsyncMock(return_value=ResearchResponse(data={}))
    monkeypatch.setattr(nodes, "_research", research)

    await nodes.research_node(
        {
            "company_name": "JCDecaux",
            "scope_mode": "site",
            "scope_selection": {"geo_perimeter": "city", "geo_areas": ["Lille"]},
        }
    )

    assert research.call_args.args[0].scope_city == "Lille"


@pytest.mark.asyncio
async def test_research_node_ne_transmet_rien_sans_cadrage_ville(monkeypatch: pytest.MonkeyPatch) -> None:
    research = AsyncMock(return_value=ResearchResponse(data={}))
    monkeypatch.setattr(nodes, "_research", research)

    await nodes.research_node({"company_name": "JCDecaux", "scope_mode": "site"})

    assert research.call_args.args[0].scope_city is None


@pytest.mark.asyncio
async def test_research_node_ne_lit_pas_la_ville_dun_autre_axe_de_cadrage(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Un cadrage RÉGION (pas VILLE) ne doit jamais se faire lire comme un site :
    # les deux partagent `geo_areas`, seul `geo_perimeter` dit lequel est voulu.
    research = AsyncMock(return_value=ResearchResponse(data={}))
    monkeypatch.setattr(nodes, "_research", research)

    await nodes.research_node(
        {
            "company_name": "JCDecaux",
            "scope_selection": {"geo_perimeter": "region", "geo_areas": ["Île-de-France"]},
        }
    )

    assert research.call_args.args[0].scope_city is None
