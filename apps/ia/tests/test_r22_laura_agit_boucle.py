"""R22-LG (#4433 / #4438 / #4421 / #4408 / #4435) — recette prod /chat du 22/10
(API 64c6806c08) : la réponse s'arrêtait sur « reste à faire » avec zéro compte.

Cause : un round de recherche qui rend ZÉRO (ou un outil en échec) a un gain
marginal nul ; le moteur d'approfondissement (`decide_next_pass`) arrêtait alors
le tour AVANT la bascule externe, et le tour final, sans outil, écrivait « recherche
externe… restent à faire ». Une recherche ne s'arrête plus sur son premier zéro :
elle passe au palier suivant DANS le tour.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock

import pytest

from app.services import chat_deepen_job_report, chat_orchestrator
from app.services.chat_model_routing import ChatTierContext
from app.services.chat_thread_state import ThreadState, ThreadStateCollector
from app.services.chat_turn_plan import (
    RESEARCH_STERILE_ROUNDS_MAX,
    SIMPLE_TURN_PLAN,
    keeps_widening_after_sterile_round,
    plan_turn,
)
from tests.test_chat_orchestrator import _DummyThrottle, _install_client, _resp, _text, _tool_use

_SEARCH = "Trouve-moi 10 comptes aéronautique à Toulouse."
_ACCOUNTS = {"accounts": [{"name": f"Compte {i}", "city": "Toulouse"} for i in range(10)]}


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
    monkeypatch.setattr(chat_deepen_job_report, "report_interrupted", AsyncMock(return_value=True))
    monkeypatch.setattr(chat_deepen_job_report, "report_resolved", AsyncMock(return_value=True))


def _executor(by_name: dict):
    async def run(name, *_args, **_kwargs):
        value = by_name.get(name, {})
        if isinstance(value, Exception):
            raise value
        return value

    return AsyncMock(side_effect=run)


async def _turn(monkeypatch, responses, request=_SEARCH):
    client = _install_client(monkeypatch, responses)
    reply, actions = await chat_orchestrator.run_chat_with_tools(
        "sys",
        "user",
        user_id="u1",
        profile_data=None,
        thread=ThreadStateCollector(ThreadState()),
        tier_request=request,
        tier_context=ChatTierContext(),
        user_message=request,
        conversation_id="c1",
    )
    return reply, actions, client


# ── la règle, pure ──────────────────────────────────────────────────────────


def test_a_research_keeps_widening_after_a_sterile_round():
    plan = plan_turn(_SEARCH, None)
    assert keeps_widening_after_sterile_round(plan, [0])
    assert keeps_widening_after_sterile_round(plan, [3, 0])


def test_the_widening_is_bounded_by_consecutive_sterile_rounds():
    plan = plan_turn(_SEARCH, None)
    assert not keeps_widening_after_sterile_round(plan, [0] * (RESEARCH_STERILE_ROUNDS_MAX + 1))


def test_a_productive_round_or_a_simple_gesture_is_not_concerned():
    assert not keeps_widening_after_sterile_round(plan_turn(_SEARCH, None), [2])
    assert not keeps_widening_after_sterile_round(SIMPLE_TURN_PLAN, [0])


# ── dans la boucle ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_zero_in_the_workspace_then_the_external_search_runs_and_accounts_are_delivered(wired, monkeypatch):
    executor = _executor({"search_workspace_accounts": {"accounts": [], "total": 0}, "run_account_search": _ACCOUNTS})
    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", executor)
    reply, _actions, client = await _turn(
        monkeypatch,
        [
            _resp("tool_use", [_tool_use("search_workspace_accounts", {"query": "aéronautique"}, "t1")]),
            _resp("tool_use", [_tool_use("run_account_search", {"sectors": ["aéronautique"]}, "t2")]),
            _resp("end_turn", [_text(f"10 comptes aéronautique à Toulouse.\n\n{_ranking_card()}")]),
        ],
    )
    called = [call.args[0] for call in executor.await_args_list]
    # Avant : arrêt sur gain nul après le 1er round, la recherche externe n'était jamais appelée.
    assert called == ["search_workspace_accounts", "run_account_search"]
    # La carte est RENDUE : la prose annonce légitimement 10 comptes, et les 10 sont livrés.
    assert reply.startswith("10 comptes aéronautique à Toulouse.") and reply.count('"name": "Compte ') == 10
    # Le round stérile reçoit la consigne du palier suivant, jamais « reste à faire ».
    second_call = str(client.messages.calls[1].get("messages"))
    assert "palier suivant" in second_call


@pytest.mark.asyncio
async def test_a_failed_tool_does_not_end_the_turn(wired, monkeypatch):
    executor = _executor({"get_account_signals": RuntimeError("source muette"), "run_account_search": _ACCOUNTS})
    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", executor)
    reply, _actions, _client = await _turn(
        monkeypatch,
        [
            _resp("tool_use", [_tool_use("get_account_signals", {"account_id": "a-1"}, "t1")]),
            _resp("tool_use", [_tool_use("run_account_search", {"sectors": ["aéronautique"]}, "t2")]),
            _resp("end_turn", [_text(f"10 comptes. Signaux indisponibles.\n\n{_ranking_card()}")]),
        ],
    )
    assert [call.args[0] for call in executor.await_args_list] == ["get_account_signals", "run_account_search"]
    assert reply.startswith("10 comptes. Signaux indisponibles.") and reply.count('"name": "Compte ') == 10


# ── le tour final forcé : livrer, jamais « reste à faire » ──────────────────


def test_the_final_note_when_nothing_continues_forbids_a_leftover_ending():
    note = chat_orchestrator._FINAL_DELIVERY_NOTE.lower()
    assert "reste à faire" in note and "jamais" in note
    assert "je poursuis" in note  # interdit : rien ne continue derrière cette réponse
    assert "une ligne" in note  # un outil en échec : ce qui manque, en une ligne


def test_the_partial_note_forbids_a_leftover_ending_too():
    assert "reste à faire" in chat_orchestrator._PARTIAL_TRANCHE_NOTE.lower()


@pytest.mark.parametrize("language", ["fr", "en"])
def test_the_launched_analyses_note_never_offers_to_continue(language):
    note = chat_orchestrator._launched_analyses_note(["Airbus"], [], language).lower()
    assert "propose de continuer" not in note and "offer to continue" not in note
    assert "ce qui reste à faire" not in note and "what is left to do" not in note


@pytest.mark.asyncio
async def test_after_sterile_rounds_the_final_answer_delivers_without_promising_more(wired, monkeypatch):
    executor = _executor({})
    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", executor)
    sterile = [
        _resp("tool_use", [_tool_use("run_account_search", {"sectors": [f"s{i}"]}, f"t{i}")])
        # +2 : le tout premier appel d'une recherche compte comme un apport (la recherche est notée au fil).
        for i in range(RESEARCH_STERILE_ROUNDS_MAX + 2)
    ]
    _reply, _actions, client = await _turn(monkeypatch, [*sterile, _resp("end_turn", [_text("Aucun compte.")])])
    final_messages = str(client.messages.calls[-1].get("messages")).lower()
    # Rien ne continue derrière (arrêt sur gain nul) : la note n'annonce pas « je poursuis ».
    assert "rien ne continue" in final_messages


# ── #5 — l'erreur assistant (1 sur 6) : un outil qui échoue ne fait jamais tomber le tour ──


@pytest.mark.asyncio
async def test_a_tool_whose_output_breaks_the_card_builder_does_not_fail_the_turn(wired, monkeypatch):
    # Avant : la mise en forme APRÈS l'appel (`shape_read_from_tool`, sources, cartes) était hors du
    # `try` de `_execute_one_tool` ; une exception y traversait `asyncio.gather` et le tour entier tombait.
    def _boom(name, *_a, **_kw):
        if name == "get_account_signals":
            raise ValueError("sortie inattendue")
        return None

    monkeypatch.setattr(chat_orchestrator, "shape_read_from_tool", _boom)
    executor = _executor({"get_account_signals": {"signals": [{"x": 1}]}, "run_account_search": _ACCOUNTS})
    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", executor)
    reply, actions, _client = await _turn(
        monkeypatch,
        [
            _resp(
                "tool_use",
                [
                    _tool_use("get_account_signals", {"account_id": "a-1"}, "t1"),
                    _tool_use("run_account_search", {"sectors": ["aéronautique"]}, "t2"),
                ],
            ),
            _resp("end_turn", [_text("10 comptes aéronautique à Toulouse.")]),
        ],
    )
    # Rien n'est rendu (le constructeur de cartes a échoué) : la garde #4631.1 dit qu'aucune liste n'est affichée.
    assert reply == "Aucune liste de comptes n'est affichée dans cette réponse : le volume annoncé n'est pas établi."
    assert "10 comptes aéronautique" not in reply
    assert [a["tool"] for a in actions] == ["get_account_signals", "run_account_search"]
