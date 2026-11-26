"""#2268.31 / #2268.32 / #2268.33 / #2268.34 — UN SUJET NE SE MÉLANGE PAS.

Trois manières dont un nouveau message peut se rattacher à ce qui précède —
continuer le fil (#2268.31), créer une branche (#2268.32), ouvrir une autre
conversation (#2268.33) — et Laura ne DÉCIDE aucune des trois seule : elle
PROPOSE, jamais une bascule automatique. #2268.34 en est le symptôme concret :
sans ce rappel, rien n'empêchait de mélanger le plan de compte LATECOERE avec
une nouvelle recherche Nantes dans la même réponse.

Même discipline que `interrupted_work_block` (#2268.29/.30) : un rappel
VOLATIL, posé UNIQUEMENT quand un sujet est déjà établi (`state.focus`) — un
fil qui n'a encore rien établi n'a rien à quoi se mélanger.
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.prompts.thread_state import (
    THREAD_STATE_HEADER,
    TOPIC_SHIFT_BLOCK,
    format_thread_state_block,
    topic_shift_block,
)
from app.services.chat_thread_state import ThreadState, thread_state_from_wire
from tests.test_chat_thread_state_turn import _post

_FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "thread_state_wire.json").read_text(encoding="utf-8"))


# ── La fonction, isolée ───────────────────────────────────────────────────────


def test_empty_without_an_established_topic() -> None:
    assert topic_shift_block(ThreadState()) == ""


def test_the_block_appears_once_a_topic_is_established() -> None:
    state = thread_state_from_wire(_FIXTURE)
    assert state.focus

    block = topic_shift_block(state)

    assert block == TOPIC_SHIFT_BLOCK
    assert "continuer ce fil" in block
    assert "ouvrir une branche" in block
    assert "NOUVELLE conversation" in block
    assert "tu ne bascules JAMAIS seul" in block
    assert "Ne mélange jamais deux comptes différents" in block


def test_a_focus_free_state_gives_nothing_even_when_other_fields_are_full() -> None:
    state = thread_state_from_wire({**_FIXTURE, "focus": []})
    assert not state.focus

    assert topic_shift_block(state) == ""


# ── La traversée jusqu'au routeur ────────────────────────────────────────────


def test_the_block_reaches_the_prompt_before_the_thread_state(client: TestClient) -> None:
    """#1980 — l'état du fil (`format_thread_state_block`) reste le DERNIER
    texte du segment volatil : ce rappel se pose AVANT lui, jamais après."""
    captured, _terminal = _post(client, {"thread_state": _FIXTURE})
    system = captured["system"]

    assert "tu ne bascules JAMAIS seul" in system
    assert system.index("tu ne bascules JAMAIS seul") < system.index(THREAD_STATE_HEADER)
    assert system.endswith(format_thread_state_block(thread_state_from_wire(_FIXTURE)))


def test_no_focus_no_reminder_in_the_prompt(client: TestClient) -> None:
    no_focus = {**_FIXTURE, "focus": []}
    captured, _terminal = _post(client, {"thread_state": no_focus})

    assert "tu ne bascules JAMAIS seul" not in captured["system"]
