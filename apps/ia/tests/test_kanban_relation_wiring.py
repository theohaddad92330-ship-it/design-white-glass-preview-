"""Câblage kanban → état de relation dans le graphe (annexe méthodo p6).

Le défaut corrigé (audit 2026-07-22, §B) : ``build_sales_context`` accepte un
``commercial_status`` et la table ``_KANBAN_TO_STATE`` est écrite ET testée,
mais RIEN ne passait le statut au graphe. Un compte que le commercial avait
rangé en « Client » ou « Suivi » repartait donc « froid » à chaque run, et tout
l'aval (mouvement d'ouverture, sélecteur d'actions, garde-fou board) raisonnait
sur une relation fausse.

Ces tests verrouillent le fil — et surtout le DÉFAUT : sans statut (compte non
trié), la recherche reçoit exactement ce qu'elle recevait avant.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

import app.graph.nodes as nodes
from app.graph.builder import run_analysis_graph
from app.models.agent_envelope import AgentStatus
from app.models.contacts import ContactsResponse
from app.models.plan import PlanResponse
from app.models.research import ResearchResponse


def _fake_classifier(contacts: list[dict]):
    class _FakeData:
        def model_dump(self, **_kw):
            return {"contacts": contacts}

    env = SimpleNamespace(status=AgentStatus.SUCCESS, data=_FakeData(), error=None)

    class _FakeAgent:
        run = AsyncMock(return_value=env)

    return _FakeAgent


@pytest.fixture
def phases(monkeypatch: pytest.MonkeyPatch):
    """Les quatre phases stubées — on n'observe QUE les requêtes reçues."""
    research = AsyncMock(return_value=ResearchResponse(data={"businessDescription": "Média"}))
    contacts = AsyncMock(return_value=ContactsResponse(data={"contacts": [{"fullName": "Jean Bon"}]}))
    plan = AsyncMock(return_value=PlanResponse(data={"actionPlan": {"strategy": "S", "phases": []}}))
    monkeypatch.setattr(nodes, "_research", research)
    monkeypatch.setattr(nodes, "_contacts", contacts)
    monkeypatch.setattr(nodes, "_plan", plan)
    monkeypatch.setattr(nodes, "ClassifierAgent", _fake_classifier([{"fullName": "Jean Bon"}]))
    monkeypatch.setattr(nodes, "prefetch_apollo_hits", AsyncMock(return_value=[]))
    return SimpleNamespace(research=research, contacts=contacts, plan=plan)


@pytest.mark.asyncio
async def test_without_a_kanban_status_research_is_unchanged(phases) -> None:
    await run_analysis_graph({"company_name": "TF1", "profile_data": {}}, thread_id="kanban-default")

    assert phases.research.await_args.args[0].commercial_status == ""


@pytest.mark.asyncio
async def test_kanban_status_reaches_the_research_phase(phases) -> None:
    await run_analysis_graph(
        {"company_name": "TF1", "profile_data": {}, "commercial_status": "customer"},
        thread_id="kanban-customer",
    )

    # C'est la phase 1 qui construit le SalesContext : sans ce champ, la relation
    # de tout compte suivi retombait à « froid ».
    assert phases.research.await_args.args[0].commercial_status == "customer"
