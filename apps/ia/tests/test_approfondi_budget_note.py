"""#3236.2 (a) (épopée #3236) — LE MODE APPROFONDI QUI MANQUE DE BUDGET LAISSE
UNE REPRISE, au lieu de se perdre.

Le tour reste synchrone (le vrai job BullMQ reprenable est le point (b), non
livré) ; ce que (a) change : quand le budget de rounds d'un tour en mode
APPROFONDI s'épuise, le fil note LUI-MÊME le travail laissé en suspens
(`current_job`/`current_step`/`next_step`, les champs que
`INTERRUPTED_WORK_BLOCK` lit déjà). Le tour suivant propose alors de
reprendre — l'utilisateur ne repart pas de zéro.

Rien n'est noté pour un autre mode, ni pour un tour qui finit proprement, ni
par-dessus un job que Laura a déjà nommé.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.prompts.thread_state import format_thread_state_block, interrupted_work_block
from app.services import chat_orchestrator
from app.services.chat_thread_state import ThreadState, ThreadStateCollector
from app.services.chat_turn_plan import plan_turn
from app.services.chat_model_routing import ChatTierContext
from tests.test_chat_orchestrator import _DummyThrottle, _install_client, _resp, _text, _tool_use

_REQUEST = "Fais une étude complète du groupe Thales"


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _p: _DummyThrottle())
    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", AsyncMock(return_value={"recommendation": "A"}))


def _rounds(n: int) -> list:
    return [
        _resp("tool_use", [_tool_use("compare_accounts", {"account_ids": [str(i)]}, f"toolu_{i}")]) for i in range(n)
    ]


async def _run(mode: str | None, responses: list, thread: ThreadStateCollector, monkeypatch) -> str:
    _install_client(monkeypatch, responses)
    reply, _actions = await chat_orchestrator.run_chat_with_tools(
        "sys",
        "user",
        user_id="u1",
        profile_data=None,
        thread=thread,
        tier_request=_REQUEST,
        tier_context=ChatTierContext(requested_mode=mode),
        user_message=_REQUEST,
    )
    return reply


@pytest.mark.asyncio
async def test_an_approfondi_turn_out_of_rounds_notes_the_unfinished_work(monkeypatch):
    thread = ThreadStateCollector(ThreadState())
    rounds = plan_turn(_REQUEST, ChatTierContext(requested_mode="approfondi")).tool_rounds
    await _run("approfondi", [*_rounds(rounds), _resp("end_turn", [_text("Première tranche.")])], thread, monkeypatch)

    state = thread.state
    assert state.current_job and "Thales" in state.current_job
    assert state.current_step and str(rounds) in state.current_step
    assert state.next_step
    # Le tour suivant propose de reprendre : la reprise est LISIBLE, pas seulement stockée.
    assert interrupted_work_block(state)
    assert "Thales" in format_thread_state_block(state)


@pytest.mark.asyncio
async def test_a_clean_approfondi_turn_notes_nothing(monkeypatch):
    thread = ThreadStateCollector(ThreadState())
    await _run("approfondi", [_resp("end_turn", [_text("Voici l'étude.")])], thread, monkeypatch)
    assert thread.state.current_job is None


@pytest.mark.asyncio
async def test_another_mode_out_of_rounds_notes_nothing(monkeypatch):
    thread = ThreadStateCollector(ThreadState())
    rounds = plan_turn(_REQUEST, ChatTierContext(requested_mode="verifie")).tool_rounds
    await _run("verifie", [*_rounds(rounds), _resp("end_turn", [_text("Tranche.")])], thread, monkeypatch)
    assert thread.state.current_job is None


@pytest.mark.asyncio
async def test_a_job_the_model_already_named_is_never_overwritten(monkeypatch):
    thread = ThreadStateCollector(ThreadState())
    thread.state.current_job = "Préparer 3 messages pour la shortlist ACME"
    rounds = plan_turn(_REQUEST, ChatTierContext(requested_mode="approfondi")).tool_rounds
    await _run("approfondi", [*_rounds(rounds), _resp("end_turn", [_text("Tranche.")])], thread, monkeypatch)
    assert thread.state.current_job == "Préparer 3 messages pour la shortlist ACME"


@pytest.mark.asyncio
async def test_without_a_thread_nothing_breaks(monkeypatch):
    _install_client(monkeypatch, [*_rounds(4), _resp("end_turn", [_text("Tranche.")])])
    reply, _ = await chat_orchestrator.run_chat_with_tools(
        "sys",
        "user",
        user_id="u1",
        profile_data=None,
        tier_request=_REQUEST,
        tier_context=ChatTierContext(requested_mode="approfondi"),
    )
    assert reply == "Tranche."
