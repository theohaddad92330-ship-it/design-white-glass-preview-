"""#3857 (lot W2) — le clic sur le bouton d'une fiche homonyme OUVRE la fiche retenue, par l'identifiant.

RBJ avait posé les boutons et retenu l'id de chaque fiche dans le fil ; le clic envoie le libellé, et
l'ouverture dépendait que le modèle lise la liste. La règle vit dans le CHEMIN : un message qui est
EXACTEMENT le libellé d'un bouton offert au tour précédent pose la carte « ouvrir cette fiche »."""

from __future__ import annotations

from typing import Any

import pytest

from app.services import chat_orchestrator
from app.services.chat_orchestrator import ensure_offered_choice_card
from app.services.chat_thread_state import ThreadObject, ThreadState, ThreadStateCollector

USER = "33333333-4333-4333-8333-333333333333"
A1 = ThreadObject(kind="account", id="a-1", label="Société Générale — Banque de détail")
A2 = ThreadObject(kind="account", id="a-2", label="Société Générale — Banque d'investissement")
PROPOSAL = {"status": "pending_confirmation", "proposal": {"action": "open_screen", "route": "/accounts/a-2"}}


def _thread(tool: str = "offer_reply_options") -> ThreadStateCollector:
    previous = ThreadState()
    previous.last_list_tool = tool
    previous.last_list = [A1, A2]
    return ThreadStateCollector(previous)


def _spy(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []

    async def fake(name: str, tool_input: dict[str, Any], **_kw: Any) -> dict[str, Any]:
        calls.append({"name": name, "input": tool_input})
        return PROPOSAL

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", fake)
    return calls


async def _run(message: str, thread: ThreadStateCollector | None, actions: list[dict[str, Any]]) -> None:
    await ensure_offered_choice_card(message, actions, thread=thread, user_id=USER, profile_data=None)


@pytest.mark.asyncio
async def test_the_clicked_label_opens_that_exact_card(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _spy(monkeypatch)
    actions: list[dict[str, Any]] = []
    await _run("Société Générale — Banque d'investissement", _thread(), actions)
    assert calls == [
        {"name": "propose_guided_action", "input": {"route": "/accounts/a-2", "label": "Société Générale — Banque d'investissement"}}
    ]
    assert actions[0]["proposal"]["route"] == "/accounts/a-2"
    assert actions[0]["status"] == "pending_confirmation"


@pytest.mark.asyncio
async def test_a_free_sentence_is_not_a_click(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _spy(monkeypatch)
    actions: list[dict[str, Any]] = []
    await _run("Dis-moi plus sur Société Générale", _thread(), actions)
    assert calls == [] and actions == []


@pytest.mark.asyncio
async def test_a_list_that_was_not_offered_as_buttons_is_left_alone(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _spy(monkeypatch)
    actions: list[dict[str, Any]] = []
    await _run(A1.label, _thread("search_workspace_accounts"), actions)
    assert calls == [] and actions == []


@pytest.mark.asyncio
async def test_no_second_card_when_the_model_already_proposed_one(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _spy(monkeypatch)
    actions: list[dict[str, Any]] = [{"tool": "propose_guided_action", "status": "pending_confirmation", "proposal": {"route": "/accounts/a-1"}}]
    await _run(A1.label, _thread(), actions)
    assert calls == [] and len(actions) == 1


@pytest.mark.asyncio
async def test_without_a_thread_nothing_happens(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _spy(monkeypatch)
    actions: list[dict[str, Any]] = []
    await _run(A1.label, None, actions)
    assert calls == [] and actions == []
