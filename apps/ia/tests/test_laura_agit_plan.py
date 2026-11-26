"""#4438 — Laura VA AU BOUT : une demande de recherche ou de croisement reçoit
jusqu'à `RESEARCH_TOOL_ROUNDS` appels d'outils (constante unique), et, si ce
budget manque, elle CONTINUE SEULE (la tâche de fond de reprise existante,
`chat_deepen_jobs`) au lieu de proposer de continuer.
"""

from __future__ import annotations

import json

import pytest

from app.services import chat_orchestrator
from app.services.chat_model_routing import ChatTierContext
from app.services.chat_turn_plan import (
    RESEARCH_TOOL_ROUNDS,
    SIMPLE_TURN_PLAN,
    continues_alone,
    is_research_request,
    plan_turn,
)

_RESEARCH = [
    "trouve 10 comptes aéronautique à Toulouse",
    "liste moi des entreprises qui recrutent des dev full stack",
    "aide moi à identifier des nouveaux comptes en idf",
    "cherche moi des comptes et contacts",
    "donne moi le numéro de Paul Martin chez Airbus",
    "trouve-moi des missions pour ce consultant",
    "quels décideurs contacter chez Thales ?",
    "find 5 companies hiring data engineers in Lyon",
]

_NOT_RESEARCH = [
    "ouvre la fiche Airbus",
    "merci",
    "Fais une étude complète du groupe Thales",
    "rédige un message de relance pour Paul",
]


@pytest.mark.parametrize("request_text", _RESEARCH)
def test_a_research_request_is_recognised(request_text):
    assert is_research_request(request_text)


@pytest.mark.parametrize("request_text", _NOT_RESEARCH)
def test_a_non_research_request_is_not(request_text):
    assert not is_research_request(request_text)


def test_the_research_budget_is_eight_calls():
    # #4438.1 — décision Louis 21/10 : « jusqu'à 8 appels », UNE constante.
    assert RESEARCH_TOOL_ROUNDS == 8


def test_a_research_request_gets_the_research_budget_without_changing_its_model():
    plan = plan_turn("trouve 10 comptes aéronautique à Toulouse", None)
    assert plan.tool_rounds == RESEARCH_TOOL_ROUNDS
    assert plan.research is True
    # Une recherche n'est pas une demande « complexe » : le palier de modèle ne bouge pas.
    assert plan.complex is False
    assert plan.fanout_limit == SIMPLE_TURN_PLAN.fanout_limit


def test_a_crossing_of_heavy_tools_gets_the_research_budget():
    plan = plan_turn("compare mes comptes et matche mes consultants", None)
    assert plan.reason == "heavy_tools"
    assert plan.tool_rounds == RESEARCH_TOOL_ROUNDS
    assert plan.research is True


def test_the_approfondi_mode_never_gets_less_than_a_research_turn():
    plan = plan_turn("ouvre la fiche Airbus", ChatTierContext(requested_mode="approfondi"))
    assert plan.tool_rounds >= RESEARCH_TOOL_ROUNDS


def test_the_rapide_mode_keeps_its_short_budget_even_on_a_search():
    # Un mode EXPLICITE posé par la personne gagne sur toute lecture du texte (#2450.1).
    plan = plan_turn("trouve 10 comptes aéronautique à Toulouse", ChatTierContext(requested_mode="rapide"))
    assert plan.tool_rounds < RESEARCH_TOOL_ROUNDS
    assert plan.research is False


def test_a_simple_request_keeps_its_plan():
    assert plan_turn("ouvre la fiche Airbus", None) == SIMPLE_TURN_PLAN


def test_who_continues_alone():
    assert continues_alone(plan_turn("trouve 10 comptes aéronautique à Toulouse", None))
    assert continues_alone(plan_turn("ouvre la fiche Airbus", ChatTierContext(requested_mode="approfondi")))
    assert not continues_alone(plan_turn("ouvre la fiche Airbus", None))
    assert not continues_alone(
        plan_turn("Fais une étude complète du groupe Thales", ChatTierContext(requested_mode="verifie"))
    )


# ── #4438.2 — la note du tour final : rends, dis ce qui continue, aucune question ──


def test_the_partial_note_never_asks_to_continue():
    note = chat_orchestrator._PARTIAL_TRANCHE_NOTE.lower()
    assert "propose explicitement de continuer" not in note
    assert "si la personne le souhaite" not in note
    assert "ne pose pas de question" in note
    assert "rends ce que tu as" in note
    assert "une ligne" in note
    # Les garanties qui restent : une tranche n'est jamais un tout, aucun total inventé.
    assert "jamais un total que tu n'as pas mesuré" in note


# ── #4438.1 / #4438.2 — dans l'orchestrateur : 8 rounds, puis la suite part seule ──

from unittest.mock import AsyncMock  # noqa: E402

from app.services import chat_deepen_job_report  # noqa: E402
from app.services.chat_thread_state import ThreadState, ThreadStateCollector  # noqa: E402
from tests.test_chat_orchestrator import _DummyThrottle, _install_client, _resp, _text, _tool_use  # noqa: E402

_SEARCH = "trouve 10 comptes aéronautique à Toulouse"


def _ranking_card(count: int = 10) -> str:
    """Une carte account_ranking RENDUE : sans elle, la garde #4631.1 remplace toute prose qui annonce N comptes."""
    card = {
        "type": "account_ranking",
        "title": "Comptes",
        "axes": ["Priorité"],
        "items": [{"name": f"Compte {i}", "level": "to_qualify", "why": ["Signal."]} for i in range(count)],
    }
    return "```bellum-block\n" + json.dumps(card, ensure_ascii=False) + "\n```"


@pytest.fixture
def wired(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _p: _DummyThrottle())
    executor = AsyncMock(return_value={"accounts": [{"name": "Compte lu"}]})
    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", executor)
    interrupted = AsyncMock(return_value=True)
    monkeypatch.setattr(chat_deepen_job_report, "report_interrupted", interrupted)
    monkeypatch.setattr(chat_deepen_job_report, "report_resolved", AsyncMock(return_value=True))
    return executor, interrupted


def _search_rounds(n: int) -> list:
    return [
        _resp("tool_use", [_tool_use("find_accounts", {"query": f"aéronautique {i}"}, f"toolu_{i}")]) for i in range(n)
    ]


async def _search_turn(monkeypatch, responses, thread=None, request=_SEARCH):
    client = _install_client(monkeypatch, responses)
    reply, _ = await chat_orchestrator.run_chat_with_tools(
        "sys",
        "user",
        user_id="u1",
        profile_data=None,
        thread=thread,
        tier_request=request,
        tier_context=ChatTierContext(),
        user_message=request,
        conversation_id="c1",
    )
    return reply, client


@pytest.mark.asyncio
async def test_a_search_runs_up_to_eight_tool_rounds(wired, monkeypatch):
    executor, interrupted = wired
    reply, _ = await _search_turn(monkeypatch, [*_search_rounds(5), _resp("end_turn", [_text(f"Voici 10 comptes.\n\n{_ranking_card()}")])])
    # Avant #4438 : coupé au 2e round, « je peux continuer si tu le souhaites ».
    assert executor.await_count == 5
    # La carte est rendue : la prose annonce légitimement 10 comptes, et les 10 sont livrés.
    assert reply.startswith("Voici 10 comptes.") and reply.count('"name": "Compte ') == 10
    interrupted.assert_not_awaited()


@pytest.mark.asyncio
async def test_a_search_out_of_budget_continues_alone(wired, monkeypatch):
    executor, interrupted = wired
    thread = ThreadStateCollector(ThreadState())
    _reply, client = await _search_turn(
        monkeypatch,
        [*_search_rounds(RESEARCH_TOOL_ROUNDS), _resp("end_turn", [_text("8 comptes lus, la suite tourne.")])],
        thread=thread,
    )
    assert executor.await_count == RESEARCH_TOOL_ROUNDS
    # La suite part SEULE : la reprise de fond est signalée, le fil la porte.
    interrupted.assert_awaited_once()
    assert thread.state.current_job
    # Le tour final reçoit la note réécrite, jamais « propose de continuer ».
    final_messages = str(client.messages.calls[-1].get("messages")).lower()
    assert "ne pose pas de question" in final_messages
    assert "propose explicitement de continuer" not in final_messages


@pytest.mark.asyncio
async def test_a_simple_gesture_out_of_budget_reports_nothing(wired, monkeypatch):
    _executor, interrupted = wired
    await _search_turn(
        monkeypatch,
        [*_search_rounds(SIMPLE_TURN_PLAN.tool_rounds), _resp("end_turn", [_text("Fiche ouverte.")])],
        request="ouvre la fiche Airbus",
    )
    interrupted.assert_not_awaited()
