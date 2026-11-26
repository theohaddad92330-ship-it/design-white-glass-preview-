"""Feedback loop A2 — la mémoire de corrections d'un compte (retours utilisateur
condensés côté API) est réinjectée dans les prompts plan / classification / chat.

Deux garanties verrouillées ici :

1. **Byte-identité** : sans feedback (champ absent ou vide), chaque prompt est
   strictement identique à avant la feature — le bloc n'existe pas.
2. **Injection factuelle** : avec feedback, le bloc apparaît et CITE les
   directives telles quelles (jamais réinterprétées).
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

import app.graph.nodes as nodes
from app.models.classify import ClassifyRequest
from app.models.plan import PlanRequest
from app.prompts import bellum_contacts, bellum_organigramme
from app.prompts.bellum_advisor import build_system_prompt as build_advisor_prompt
from app.routers.graph_analyze import GraphAnalyzeRequest
from app.services import classification
from app.services.account_feedback import feedback_directives_block

DIRECTIVES = (
    "- [play] « Play cyber VINCI Energies » jugé INUTILE / hors sujet par l'utilisateur — "
    "ne pas le re-proposer tel quel (2026-07-10)\n"
    "- [contact] « Jean Dupont » signalé OBSOLÈTE par l'utilisateur — ne pas le réutiliser "
    "tel quel — retour cité : « N'est plus dans l'entreprise. » (2026-07-08)"
)


# ── Le bloc lui-même ─────────────────────────────────────────────────────────


def test_block_is_empty_without_feedback():
    assert feedback_directives_block("") == ""
    assert feedback_directives_block(None) == ""
    assert feedback_directives_block("   \n  ") == ""


def test_block_cites_directives_verbatim():
    block = feedback_directives_block(DIRECTIVES)
    assert "RETOURS UTILISATEUR SUR CE COMPTE" in block
    # Le feedback est cité, jamais réinterprété.
    assert DIRECTIVES in block
    assert "ne pas répéter" in block  # consigne corrective fixe


def test_block_caps_hostile_payloads():
    block = feedback_directives_block("x" * 100_000)
    assert len(block) < 5_000


# ── Plan (Phase 4) ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_plan_system_prompt_is_byte_identical_without_feedback(monkeypatch):
    prompts = await _run_plan_and_capture_systems(monkeypatch, account_feedback=None)
    prompts_empty = await _run_plan_and_capture_systems(monkeypatch, account_feedback="")
    assert prompts == prompts_empty
    assert all("RETOURS UTILISATEUR" not in p for p in prompts)


@pytest.mark.asyncio
async def test_plan_system_prompt_gains_only_the_feedback_block(monkeypatch):
    baseline = await _run_plan_and_capture_systems(monkeypatch, account_feedback=None)
    with_feedback = await _run_plan_and_capture_systems(monkeypatch, account_feedback=DIRECTIVES)
    # Chaque appel plan partage le même prompt système : bloc présent + le
    # feedback cité tel quel, et RIEN d'autre ne change (préfixe identique).
    for base, fed in zip(baseline, with_feedback, strict=True):
        assert "RETOURS UTILISATEUR SUR CE COMPTE" in fed
        assert DIRECTIVES in fed
        assert fed.replace(feedback_directives_block(DIRECTIVES), "") == base


async def _run_plan_and_capture_systems(monkeypatch, *, account_feedback: str | None) -> list[str]:
    """Exécute ``_plan`` avec ``call_claude`` mocké et rend les prompts système."""
    from app.routers import phase4_plan

    systems: list[str] = []

    async def fake_call_claude(system, user, **kwargs):
        systems.append(system)
        name = str(kwargs.get("prompt_name", ""))
        if name == "bellum_messages":
            return {"messages": []}, None
        return {}, None

    monkeypatch.setattr(phase4_plan, "call_claude", fake_call_claude)
    # Neutralise les I/O annexes (RAG) pour un test hermétique.
    monkeypatch.setattr(
        phase4_plan.rag_service, "retrieve_knowledge_context", AsyncMock(return_value="")
    )
    monkeypatch.setattr(
        phase4_plan.rag_knowledge, "retrieve_reranked_context", AsyncMock(return_value="")
    )
    monkeypatch.setattr(
        phase4_plan, "measure_self_consistency", AsyncMock(return_value=(None, []))
    )

    kwargs = {} if account_feedback is None else {"account_feedback": account_feedback}
    req = PlanRequest(
        account_id="acc-1",
        account_data={"sector": "Transport", "angles": [{"angle": "Modernisation SI"}]},
        contacts=[{"fullName": "Jean Dupont", "title": "DSI"}],
        profile_data={"companyName": "MonESN", "offers": ["Cloud"]},
        **kwargs,
    )
    await phase4_plan._plan(req)
    assert systems, "aucun appel Claude capturé"
    return systems


# ── Classification (Phase 3) ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_classify_prompts_byte_identical_without_feedback(monkeypatch):
    absent = await _run_classify_and_capture_systems(monkeypatch, account_feedback=None)
    empty = await _run_classify_and_capture_systems(monkeypatch, account_feedback="")
    assert absent == empty
    profile = {"companyName": "SNCF"}
    # Sans feedback, les prompts sont EXACTEMENT les builders historiques.
    assert bellum_contacts.build_system_prompt(profile) in absent
    assert bellum_organigramme.build_system_prompt(profile) in absent


@pytest.mark.asyncio
async def test_classify_prompts_gain_the_feedback_block(monkeypatch):
    systems = await _run_classify_and_capture_systems(monkeypatch, account_feedback=DIRECTIVES)
    block = feedback_directives_block(DIRECTIVES)
    profile = {"companyName": "SNCF"}
    # Les DEUX prompts (batch contacts + organigramme) portent le bloc, en
    # suffixe additif du prompt historique.
    assert bellum_contacts.build_system_prompt(profile) + block in systems
    assert bellum_organigramme.build_system_prompt(profile) + block in systems


async def _run_classify_and_capture_systems(monkeypatch, *, account_feedback: str | None) -> list[str]:
    systems: list[str] = []

    async def fake_call_claude(system, user, **kwargs):
        systems.append(system)
        if kwargs.get("prompt_name") == "bellum_organigramme":
            from app.models.outputs.contacts import OrganigrammeOutput

            return OrganigrammeOutput(), None
        from app.models.outputs.contacts import ContactsOutput

        return ContactsOutput(contacts=[]), None

    monkeypatch.setattr(classification, "call_claude", fake_call_claude)

    kwargs = {} if account_feedback is None else {"account_feedback": account_feedback}
    req = ClassifyRequest(
        account_id="acc-1",
        contacts=[{"fullName": "Jean Dupont", "title": "DSI"}],
        profile_data={"companyName": "SNCF"},
        **kwargs,
    )
    await classification.classify_contacts_and_organigramme(req)
    assert systems, "aucun appel Claude capturé"
    return systems


# ── Graph (run complet / re-run) ─────────────────────────────────────────────


def test_graph_analyze_request_defaults_to_no_feedback():
    # Clé absente sur le wire (aucun feedback) → "" → prompts byte-identiques.
    assert GraphAnalyzeRequest(company_name="SNCF").account_feedback == ""
    assert GraphAnalyzeRequest(company_name="SNCF", account_feedback=DIRECTIVES).account_feedback == DIRECTIVES


@pytest.mark.asyncio
async def test_plan_node_threads_account_feedback(monkeypatch):
    plan = AsyncMock(return_value=type("R", (), {"data": {}})())
    monkeypatch.setattr(nodes, "_plan", plan)
    monkeypatch.setattr(nodes.rag_knowledge, "populate_from_analysis", AsyncMock())

    await nodes.plan_node({"company_name": "SNCF", "account_feedback": DIRECTIVES})

    req = plan.call_args.args[0]
    assert req.account_feedback == DIRECTIVES


@pytest.mark.asyncio
async def test_plan_node_defaults_feedback_to_empty_on_legacy_state(monkeypatch):
    plan = AsyncMock(return_value=type("R", (), {"data": {}})())
    monkeypatch.setattr(nodes, "_plan", plan)
    monkeypatch.setattr(nodes.rag_knowledge, "populate_from_analysis", AsyncMock())

    await nodes.plan_node({"company_name": "SNCF"})  # état repris / legacy

    req = plan.call_args.args[0]
    assert req.account_feedback == ""


@pytest.mark.asyncio
async def test_classify_node_threads_account_feedback(monkeypatch):
    captured: dict = {}

    class FakeAgent:
        async def run(self, company, profile, research, contacts, *, account_feedback=""):
            captured["account_feedback"] = account_feedback
            from app.models.agent_envelope import AgentEnvelope, AgentStatus
            from app.models.classified_data import ClassifiedData

            return AgentEnvelope[ClassifiedData](
                status=AgentStatus.SUCCESS, data=ClassifiedData(contacts=[]), error=None, meta=None
            )

    monkeypatch.setattr(nodes, "ClassifierAgent", FakeAgent)
    monkeypatch.setattr(nodes, "enrich_top_deciders", AsyncMock(side_effect=lambda c, _n, **_kw: c))

    await nodes.classify_node({"company_name": "SNCF", "account_feedback": DIRECTIVES})

    assert captured["account_feedback"] == DIRECTIVES


# ── Chat (copilote) ──────────────────────────────────────────────────────────


def test_advisor_prompt_byte_identical_without_feedback():
    baseline = build_advisor_prompt({}, {}, "", "")
    assert build_advisor_prompt({}, {}, "", "", account_feedback="") == baseline
    assert "RETOURS UTILISATEUR" not in baseline


def test_advisor_prompt_injects_feedback_block():
    prompt = build_advisor_prompt({}, {}, "", "", account_feedback=DIRECTIVES)
    assert "RETOURS UTILISATEUR SUR CE COMPTE" in prompt
    assert DIRECTIVES in prompt
    # Additif : retirer le bloc redonne exactement le prompt de base.
    assert prompt.replace(feedback_directives_block(DIRECTIVES), "") == build_advisor_prompt({}, {}, "", "")
