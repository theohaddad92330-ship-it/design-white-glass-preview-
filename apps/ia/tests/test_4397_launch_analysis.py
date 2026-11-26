"""#4397 — « lance l'analyse de X » : Laura répondait « Je n'ai pas de nouvelle demande à traiter » puis
« le résultat n'est pas disponible » alors que l'analyse tournait. L'outil dit au modèle que l'analyse est
LANCÉE (résultat plus tard, sur la fiche), et la demande de lancement force l'outil au premier round."""

from __future__ import annotations

import pytest

from app.services import bellum_api, chat_orchestrator
from app.services.chat_tools import execute_chat_tool
from app.services.compilers.intent_router import asks_to_launch_account_analysis

PLAN = "plan_account_analysis"
START = "start_account_analysis"
TOOLS = [{"name": PLAN}, {"name": START}, {"name": "get_account_briefing"}]


@pytest.mark.asyncio
async def test_4397_start_output_tells_the_model_the_analysis_is_running(monkeypatch):
    async def fake_start(user_id, *, company, plan_token, **_scope):
        return {"accountId": "acc-1", "launched": True}

    monkeypatch.setattr(bellum_api, "start_account_analysis", fake_start)
    result = await execute_chat_tool(
        START, {"company": "OGF", "plan_token": "tok"}, user_id="u-1", profile_data=None
    )
    directive = str(result.get("model_directive") or "")
    assert "OGF" in directive and "fiche" in directive
    assert "disponible" in directive  # la consigne interdit de la dire « disponible » ou « non disponible »


@pytest.mark.asyncio
async def test_4397_a_refused_launch_carries_no_running_directive(monkeypatch):
    async def fake_start(user_id, *, company, plan_token, **_scope):
        return {"launched": False, "reason": "x"}

    monkeypatch.setattr(bellum_api, "start_account_analysis", fake_start)
    result = await execute_chat_tool(
        START, {"company": "OGF", "plan_token": "tok"}, user_id="u-1", profile_data=None
    )
    assert "model_directive" not in result


@pytest.mark.parametrize(
    "message",
    ["lance l'analyse de Sanofi", "Relance l'analyse d'OGF", "lancer l'analyse du compte Alpha", "launch the analysis of Sanofi"],
)
def test_4397_launch_request_is_detected(message):
    assert asks_to_launch_account_analysis(message)


@pytest.mark.parametrize("message", ["Bonjour", "que faire cette semaine ?", "montre-moi l'analyse de Sanofi", "lancer des analyses", ""])
def test_4397_detector_says_no_elsewhere(message):
    assert not asks_to_launch_account_analysis(message)


def test_4397_launch_message_forces_plan_then_start():
    msg = "lance l'analyse de Sanofi"
    assert chat_orchestrator._forced_launch_analysis_kwargs(0, msg, TOOLS, planned_token=False, started=False) == {
        "force_tool": PLAN
    }
    assert chat_orchestrator._forced_launch_analysis_kwargs(1, msg, TOOLS, planned_token=True, started=False) == {
        "force_tool": START
    }


def test_4397_unrelated_message_or_missing_tool_or_already_started_forces_nothing():
    f = chat_orchestrator._forced_launch_analysis_kwargs
    assert f(0, "que faire cette semaine ?", TOOLS, planned_token=False, started=False) == {}
    assert f(0, "lance l'analyse de Sanofi", [{"name": "get_account_briefing"}], planned_token=False, started=False) == {}
    assert f(1, "lance l'analyse de Sanofi", TOOLS, planned_token=True, started=True) == {}
    assert f(1, "lance l'analyse de Sanofi", TOOLS, planned_token=False, started=False) == {}
