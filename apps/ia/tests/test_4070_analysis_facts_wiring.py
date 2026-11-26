"""#4070 — LE FIL COMPLET : API → /graph/analyze → état → recherche, contacts, plan, messages.

Le motif qui revient dans tout le dépôt : du code juste, calculé, testé, que
personne n'appelle. Ces tests suivent donc le fait JUSQU'AU PROMPT, et prouvent
que sans fait chaque prompt reste byte-identique à avant le lot."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

import app.graph.nodes as nodes
from app.graph.builder import run_analysis_graph
from app.models.classify import ClassifyRequest
from app.models.contacts import ContactsResponse
from app.models.plan import PlanRequest, PlanResponse
from app.models.research import ResearchRequest, ResearchResponse
from app.routers.graph_analyze import GraphAnalyzeRequest
from app.services import classification
from app.services.analysis_account_facts import (
    account_facts_block,
    known_contacts_block,
    normalize_account_facts,
    previous_analysis_block,
)

FACTS = [
    {"kind": "need", "label": "Migration paie cloud", "date": "2025-08-12", "age_days": 426},
    {"kind": "deal_lost", "label": "TMA SI RH", "date": "2024-06-01", "age_days": 863},
    {"kind": "deal_won", "label": "Refonte portail achats", "date": "2023-02-10", "age_days": 1340},
    {"kind": "mission", "label": "Support N3", "date": "2025-01-06", "age_days": 644},
]
KNOWN = [{"name": "Claire Martin", "role": "DSI", "relation": "crm", "last_seen": "2025-11-03"}]
PREVIOUS = "Analyse du 2026-06-18 (il y a 4 mois)\n- Siège : Lyon (corrigé par l'équipe le 2026-07-01)"
REX = "Perte du 2024-06-01 — motif déclaré : prix."


# ── la requête HTTP ──────────────────────────────────────────────────────────


def test_la_requete_graph_porte_les_quatre_intrants_et_les_neutres_par_defaut():
    bare = GraphAnalyzeRequest(company_name="SNCF")
    assert bare.account_facts == []
    assert bare.known_contacts == []
    assert bare.previous_analysis == ""
    assert bare.lost_deal_rex == ""
    full = GraphAnalyzeRequest(
        company_name="SNCF",
        account_facts=FACTS,
        known_contacts=KNOWN,
        previous_analysis=PREVIOUS,
        lost_deal_rex=REX,
    )
    assert full.account_facts == FACTS


def test_la_requete_phase_porte_les_intrants_et_les_neutres_par_defaut():
    assert ResearchRequest(company_name="SNCF").account_facts == []
    assert ResearchRequest(company_name="SNCF").previous_analysis == ""
    plan = PlanRequest(account_id="a")
    assert (plan.account_facts, plan.previous_analysis, plan.lost_deal_rex) == ([], "", "")
    assert ClassifyRequest(account_id="a").known_contacts == []


# ── le graphe : l'état arrive à chaque phase ─────────────────────────────────


def _fake_classifier():
    class _Data:
        def model_dump(self, **_kw):
            return {"contacts": [{"fullName": "Jean Bon"}]}

    env = SimpleNamespace(status="success", data=_Data(), error=None)
    from app.models.agent_envelope import AgentStatus

    env.status = AgentStatus.SUCCESS

    class _Agent:
        run = AsyncMock(return_value=env)

    return _Agent


@pytest.fixture
def phases(monkeypatch: pytest.MonkeyPatch):
    research = AsyncMock(return_value=ResearchResponse(data={"businessDescription": "Média"}))
    contacts = AsyncMock(return_value=ContactsResponse(data={"contacts": [{"fullName": "Jean Bon"}]}))
    plan = AsyncMock(return_value=PlanResponse(data={"actionPlan": {"strategy": "S", "phases": []}}))
    classifier = _fake_classifier()
    monkeypatch.setattr(nodes, "_research", research)
    monkeypatch.setattr(nodes, "_contacts", contacts)
    monkeypatch.setattr(nodes, "_plan", plan)
    monkeypatch.setattr(nodes, "ClassifierAgent", classifier)
    monkeypatch.setattr(nodes, "prefetch_apollo_hits", AsyncMock(return_value=[]))
    return SimpleNamespace(research=research, contacts=contacts, plan=plan, classifier=classifier)


@pytest.mark.asyncio
async def test_sans_intrant_chaque_phase_recoit_exactement_ce_qu_elle_recevait(phases):
    await run_analysis_graph({"company_name": "TF1", "profile_data": {}}, thread_id="4070-default")

    research_req = phases.research.await_args.args[0]
    assert research_req.account_facts == [] and research_req.previous_analysis == ""
    plan_req = phases.plan.await_args.args[0]
    assert plan_req.account_facts == [] and plan_req.previous_analysis == "" and plan_req.lost_deal_rex == ""
    run_kwargs = phases.classifier.run.await_args.kwargs
    assert run_kwargs.get("known_contacts", []) == []


@pytest.mark.asyncio
async def test_les_intrants_atteignent_recherche_contacts_et_plan(phases):
    await run_analysis_graph(
        {
            "company_name": "TF1",
            "profile_data": {},
            "account_facts": FACTS,
            "known_contacts": KNOWN,
            "previous_analysis": PREVIOUS,
            "lost_deal_rex": REX,
        },
        thread_id="4070-full",
    )

    research_req = phases.research.await_args.args[0]
    assert research_req.account_facts == FACTS
    assert research_req.previous_analysis == PREVIOUS

    plan_req = phases.plan.await_args.args[0]
    assert plan_req.account_facts == FACTS
    assert plan_req.previous_analysis == PREVIOUS
    assert plan_req.lost_deal_rex == REX

    assert phases.classifier.run.await_args.kwargs["known_contacts"] == KNOWN


# ── le prompt : le fait y est, daté ; sans fait, le prompt est inchangé ──────


async def _plan_systems(monkeypatch, **extra) -> list[str]:
    from app.routers import phase4_plan

    systems: list[str] = []

    async def fake_call_claude(system, user, **kwargs):
        systems.append(system)
        if str(kwargs.get("prompt_name", "")) == "bellum_messages":
            return {"messages": []}, None
        return {}, None

    monkeypatch.setattr(phase4_plan, "call_claude", fake_call_claude)
    monkeypatch.setattr(phase4_plan.rag_service, "retrieve_knowledge_context", AsyncMock(return_value=""))
    monkeypatch.setattr(phase4_plan.rag_knowledge, "retrieve_reranked_context", AsyncMock(return_value=""))
    monkeypatch.setattr(phase4_plan, "measure_self_consistency", AsyncMock(return_value=(None, [])))
    monkeypatch.setattr(phase4_plan, "_account_has_positive_rex", AsyncMock(return_value=False))
    monkeypatch.setattr(phase4_plan, "_sector_referential_chunks", AsyncMock(return_value=[]), raising=False)
    req = PlanRequest(
        account_id="acc-1",
        account_data={"sector": "Transport", "angles": [{"angle": "Modernisation SI"}]},
        contacts=[{"fullName": "Jean Dupont", "title": "DSI"}],
        profile_data={"companyName": "MonESN", "offers": ["Cloud"]},
        **extra,
    )
    await phase4_plan._plan(req)
    assert systems
    return systems


@pytest.mark.asyncio
async def test_plan_prompt_inchange_sans_intrant_et_additif_avec(monkeypatch):
    base = await _plan_systems(monkeypatch)
    again = await _plan_systems(monkeypatch, account_facts=[], previous_analysis="", lost_deal_rex="")
    assert base == again
    assert all("HISTORIQUE DU COMPTE" not in s and "ANALYSE PRÉCÉDENTE" not in s for s in base)

    with_facts = await _plan_systems(monkeypatch, account_facts=FACTS, previous_analysis=PREVIOUS, lost_deal_rex=REX)
    plan_block = account_facts_block(normalize_account_facts(FACTS), "plan")
    messages_block = account_facts_block(normalize_account_facts(FACTS), "messages")
    prev_block = previous_analysis_block(PREVIOUS)
    joined = "\n".join(with_facts)
    assert "Affaire perdue : TMA SI RH" in joined
    assert "il y a 2 ans" in joined
    assert "motif déclaré : prix" in joined
    assert "corrigé par l'équipe" in joined
    # Le plan reçoit le bloc plan ; les messages le bloc court — et rien d'autre ne change.
    assert any(plan_block in s for s in with_facts)
    assert any(messages_block in s for s in with_facts)
    assert any(prev_block in s for s in with_facts)


@pytest.mark.asyncio
async def test_NON_le_prompt_du_plan_ne_nomme_aucune_source(monkeypatch):
    import re

    systems = await _plan_systems(monkeypatch, account_facts=FACTS, previous_analysis=PREVIOUS, lost_deal_rex=REX)
    added = "\n".join(
        [
            account_facts_block(normalize_account_facts(FACTS), "plan"),
            account_facts_block(normalize_account_facts(FACTS), "messages"),
            previous_analysis_block(PREVIOUS),
        ]
    )
    assert re.search(r"dataforge|orion|mémoire marché|hubspot|salesforce|pappers|apollo", added, re.I) is None
    assert any("TMA SI RH" in s for s in systems)


@pytest.mark.asyncio
async def test_has_positive_rex_lit_les_faits(monkeypatch):
    from app.routers import phase4_plan

    seen: dict[str, object] = {}
    real = phase4_plan.recommend_actions_from_context

    def spy(*args, **kwargs):
        seen["has_positive_rex"] = kwargs.get("has_positive_rex")
        return real(*args, **kwargs)

    monkeypatch.setattr(phase4_plan, "recommend_actions_from_context", spy)
    await _plan_systems_with_sales_context(monkeypatch, account_facts=FACTS)
    assert seen["has_positive_rex"] is True

    seen.clear()
    await _plan_systems_with_sales_context(monkeypatch, account_facts=[FACTS[1]])
    assert seen["has_positive_rex"] is False


async def _plan_systems_with_sales_context(monkeypatch, **extra):
    from app.routers import phase4_plan

    async def fake_call_claude(system, user, **kwargs):
        if str(kwargs.get("prompt_name", "")) == "bellum_messages":
            return {"messages": []}, None
        return {}, None

    monkeypatch.setattr(phase4_plan, "call_claude", fake_call_claude)
    monkeypatch.setattr(phase4_plan.rag_service, "retrieve_knowledge_context", AsyncMock(return_value=""))
    monkeypatch.setattr(phase4_plan.rag_knowledge, "retrieve_reranked_context", AsyncMock(return_value=""))
    monkeypatch.setattr(phase4_plan, "measure_self_consistency", AsyncMock(return_value=(None, [])))
    monkeypatch.setattr(phase4_plan, "_account_has_positive_rex", AsyncMock(return_value=False))
    monkeypatch.setattr(phase4_plan, "_sector_referential_chunks", AsyncMock(return_value=[]), raising=False)
    sales_context = {
        "esnProfile": {"stage": "petite"},
        "relationship": {"state": "froid"},
        "account": {"archetype": "grand_compte"},
    }
    req = PlanRequest(
        account_id="acc-1",
        account_data={"sector": "Transport", "salesContext": sales_context, "angles": [{"angle": "x"}]},
        contacts=[{"fullName": "Jean Dupont", "title": "DSI"}],
        profile_data={"companyName": "MonESN", "offers": ["Cloud"]},
        **extra,
    )
    await phase4_plan._plan(req)


# ── contacts : les interlocuteurs connus départagent la classification ───────


async def _classify_systems(monkeypatch, **extra) -> list[str]:
    from app.models.outputs.contacts import ContactsOutput, OrganigrammeOutput

    systems: list[str] = []

    async def fake_call_claude(system, user, **kwargs):
        systems.append(system)
        if kwargs.get("prompt_name") == "bellum_organigramme":
            return OrganigrammeOutput(), None
        return ContactsOutput(contacts=[]), None

    monkeypatch.setattr(classification, "call_claude", fake_call_claude)
    req = ClassifyRequest(
        account_id="acc-1",
        contacts=[{"fullName": "Jean Dupont", "title": "DSI"}],
        profile_data={"companyName": "SNCF"},
        **extra,
    )
    await classification.classify_contacts_and_organigramme(req)
    assert systems
    return systems


@pytest.mark.asyncio
async def test_classification_inchangee_sans_contact_connu_et_additive_avec(monkeypatch):
    base = await _classify_systems(monkeypatch)
    assert base == await _classify_systems(monkeypatch, known_contacts=[])
    assert all("INTERLOCUTEURS DÉJÀ CONNUS" not in s for s in base)

    with_known = await _classify_systems(monkeypatch, known_contacts=KNOWN)
    block = known_contacts_block(KNOWN)
    # Le lot de classification porte le bloc ; l'organigramme n'est pas touché.
    assert sum(block in s for s in with_known) == 1
    assert [s.replace(block, "") for s in with_known] == base
