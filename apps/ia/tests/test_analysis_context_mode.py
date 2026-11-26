"""#2451.1 / #2453.7 — le mode de contexte d'une ANALYSE, de l'API au prompt du plan.

Côté API, un mode qui exclut le profil le fait partir VIDE (il n'est pas lu).
Côté IA, le plan le reçoit (`context_mode`) pour DIRE pourquoi le profil
manque : un plan sans profil qui écrirait « adapté à ton activité » serait un
dossier générique déguisé (§13). « Mon activité » ou absent = prompt
byte-identique.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.graph import nodes
from app.models.plan import PlanRequest
from app.routers.graph_analyze import GraphAnalyzeRequest
from app.services.context_mode import analysis_context_mode_block


def test_absent_or_my_activity_is_byte_identical():
    assert analysis_context_mode_block(None) == ""
    assert analysis_context_mode_block("") == ""
    assert analysis_context_mode_block("my_activity") == ""


def test_unknown_mode_is_silent_never_guessed():
    assert analysis_context_mode_block("neutre") == ""


def test_one_off_mission_names_the_brief_and_forbids_the_usual_profile():
    block = analysis_context_mode_block("one_off_mission")
    assert "Mission ponctuelle" in block
    assert "brief" in block
    assert "à ton activité" in block  # la formule interdite est NOMMÉE pour être refusée


def test_neutral_names_neutral_criteria_and_no_crm():
    block = analysis_context_mode_block("neutral")
    assert "Neutre" in block
    assert "critères" in block
    assert "CRM" in block
    # Les deux modes ne disent pas la même chose : le libellé suit le mode.
    assert block != analysis_context_mode_block("one_off_mission")


def test_plan_and_graph_requests_default_to_no_mode():
    assert PlanRequest(account_id="a-1").context_mode is None
    assert GraphAnalyzeRequest(company_name="SNCF").context_mode is None
    assert GraphAnalyzeRequest(company_name="SNCF", context_mode="neutral").context_mode == "neutral"


@pytest.mark.asyncio
async def test_plan_node_threads_the_context_mode(monkeypatch):
    plan = AsyncMock(return_value=type("R", (), {"data": {}})())
    monkeypatch.setattr(nodes, "_plan", plan)
    monkeypatch.setattr(nodes.rag_knowledge, "populate_from_analysis", AsyncMock())

    await nodes.plan_node({"company_name": "SNCF", "context_mode": "one_off_mission"})
    assert plan.call_args.args[0].context_mode == "one_off_mission"

    await nodes.plan_node({"company_name": "SNCF"})  # état repris / legacy
    assert plan.call_args.args[0].context_mode is None
