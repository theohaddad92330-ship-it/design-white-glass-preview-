"""Câblage de la couche zéro dans le graphe (annexe méthodo p7-p9, trou D16).

Le défaut corrigé : la présence CRM n'atteignait que le chatbot, jamais la
recherche ni le plan ; et ``reverseProspects``, calculé en phase 2, n'avait aucun
consommateur. Ces tests verrouillent le fil complet — et surtout le DÉFAUT :
sans CRM connecté et sans ex-collaborateur, chaque phase reçoit exactement ce
qu'elle recevait avant (vide), donc les prompts restent byte-identiques.
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

_REVERSE = [
    {
        "fullName": "Claire Dupont",
        "title": "Architecte Data",
        "apolloDetails": {"organization": "Sopra Steria"},
    }
]


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
    """Les quatre phases stubées — on n'observe QUE les requêtes qu'elles reçoivent."""
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
async def test_without_crm_or_reverse_prospects_every_phase_is_unchanged(phases) -> None:
    await run_analysis_graph({"company_name": "TF1", "profile_data": {}}, thread_id="zl-default")

    assert phases.research.await_args.args[0].crm_presence == ""
    plan_req = phases.plan.await_args.args[0]
    assert plan_req.crm_presence == ""
    assert plan_req.reverse_prospects == []


@pytest.mark.asyncio
async def test_crm_presence_reaches_research_and_plan(phases) -> None:
    summary = "CRM HubSpot consulté pour « TF1 » :\n- 2 contact(s) déjà dans votre CRM chez ce groupe"
    await run_analysis_graph(
        {"company_name": "TF1", "profile_data": {}, "crm_presence": summary},
        thread_id="zl-crm",
    )

    # La recherche en a besoin pour l'état de relation du SalesContext…
    assert phases.research.await_args.args[0].crm_presence == summary
    # …et le plan pour ne pas recommander une approche froide sur un compte connu.
    assert phases.plan.await_args.args[0].crm_presence == summary


# #1631.3/.4, #1606.2 (lot 14) — l'axe CHEMIN : le lot 13 a livré le CALCUL
# (`_path_axis`) mais rien ne transportait le compte de parcours jusqu'au
# graphe. Même discipline que la relation ci-dessus : sans l'ingrédient, la
# recherche reçoit exactement ce qu'elle recevait avant (`None` / "").
@pytest.mark.asyncio
async def test_without_market_path_axis_research_is_unchanged(phases) -> None:
    await run_analysis_graph({"company_name": "TF1", "profile_data": {}}, thread_id="zl-path-default")

    req = phases.research.await_args.args[0]
    assert req.market_paths_observed is None
    assert req.market_top_esn == ""


@pytest.mark.asyncio
async def test_market_path_axis_reaches_research(phases) -> None:
    await run_analysis_graph(
        {
            "company_name": "BNP Paribas",
            "profile_data": {},
            "market_paths_observed": 9,
            "market_top_esn": "ALTEN",
        },
        thread_id="zl-path",
    )

    req = phases.research.await_args.args[0]
    assert req.market_paths_observed == 9
    assert req.market_top_esn == "ALTEN"


@pytest.mark.asyncio
async def test_reverse_prospects_travel_from_contacts_to_the_plan(phases, monkeypatch) -> None:
    monkeypatch.setattr(
        nodes,
        "_contacts",
        AsyncMock(
            return_value=ContactsResponse(
                data={"contacts": [{"fullName": "Jean Bon"}], "reverseProspects": _REVERSE}
            )
        ),
    )
    final = await run_analysis_graph(
        {"company_name": "TF1", "profile_data": {}}, thread_id="zl-reverse"
    )

    assert final["reverse_prospects"] == _REVERSE
    assert phases.plan.await_args.args[0].reverse_prospects == _REVERSE
