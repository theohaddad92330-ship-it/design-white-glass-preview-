"""#3753.3 — le ciblage de l'ESN atteint RÉELLEMENT la phase 1.

``seller_hypotheses.py`` seul ne prouve rien : le motif de ce dépôt est « du code
juste, testé, que personne n'appelle ». Ici on suit le chemin de bout en bout :
corps ``/graph/analyze`` → état du graphe → ``research_node`` → ``ResearchRequest``
→ ``_research`` (qui l'injecte dans le contexte du prompt).
"""

from __future__ import annotations

import inspect
from unittest.mock import AsyncMock

import pytest

import app.graph.nodes as nodes
from app.models.research import ResearchRequest, ResearchResponse
from app.routers import phase1_research
from app.routers.graph_analyze import GraphAnalyzeRequest

_TARGETING = {
    "tier_label": "A",
    "selection_reason": "Plan de transformation SI",
    "addressable_issues": "Dette applicative",
    "upcoming_it_projects": None,
}


def test_le_corps_graph_analyze_porte_le_ciblage() -> None:
    assert GraphAnalyzeRequest(company_name="SNCF", seller_hypotheses=_TARGETING).seller_hypotheses == _TARGETING
    # Absent sur le fil → None : le chemin d'avant, byte-identique.
    assert GraphAnalyzeRequest(company_name="SNCF").seller_hypotheses is None


def test_la_requete_de_recherche_porte_le_ciblage_et_vaut_none_par_defaut() -> None:
    assert ResearchRequest(company_name="SNCF", seller_hypotheses=_TARGETING).seller_hypotheses == _TARGETING
    assert ResearchRequest(company_name="SNCF").seller_hypotheses is None


@pytest.mark.asyncio
async def test_research_node_transmet_le_ciblage_a_la_requete(monkeypatch: pytest.MonkeyPatch) -> None:
    research = AsyncMock(return_value=ResearchResponse(data={}))
    monkeypatch.setattr(nodes, "_research", research)

    await nodes.research_node({"company_name": "SNCF", "seller_hypotheses": _TARGETING})

    assert research.call_args.args[0].seller_hypotheses == _TARGETING


@pytest.mark.asyncio
async def test_research_node_sans_ciblage_ne_transmet_rien(monkeypatch: pytest.MonkeyPatch) -> None:
    research = AsyncMock(return_value=ResearchResponse(data={}))
    monkeypatch.setattr(nodes, "_research", research)

    await nodes.research_node({"company_name": "SNCF"})

    assert research.call_args.args[0].seller_hypotheses is None


def test_la_phase_1_injecte_le_bloc_dans_le_contexte() -> None:
    source = inspect.getsource(phase1_research._research)
    assert "append_seller_hypotheses(user_context_str, req.seller_hypotheses)" in source
