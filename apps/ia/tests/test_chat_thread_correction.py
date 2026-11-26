"""#194.3 (reformulé de LAU-FINAL-194, épopée #3233) — LE NO-GO : « Laura
s'excuse mais répète le même raisonnement ou ne relance aucun outil ».

Des disciplines anti-répétition voisines existaient déjà pour des cas proches
(`CLARIFICATION_SPENT_BLOCK`, `INTERRUPTED_WORK_BLOCK`), mais aucune ne
couvrait CE cas précis. Ce module ajoute le rappel STRICT, posé UNIQUEMENT
quand une correction est active dans ce fil (`state.active_correction`,
nommée par le modèle via `note_thread_context.correction` — #194.1 / #194.2)
— un fil sans correction reconnue garde un prompt inchangé au bit près, même
discipline que `interrupted_work_block`.
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.prompts.thread_state import (
    CORRECTION_NOT_REPEATED_BLOCK,
    THREAD_STATE_HEADER,
    correction_not_repeated_block,
    format_thread_state_block,
)
from app.services.chat_thread_state import ThreadState, thread_state_from_wire
from tests.test_chat_thread_state_turn import _post

_FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "thread_state_wire.json").read_text(encoding="utf-8"))


# ── La fonction, isolée ───────────────────────────────────────────────────────


def test_empty_without_an_active_correction() -> None:
    assert correction_not_repeated_block(ThreadState()) == ""


def test_the_block_appears_once_a_correction_is_active() -> None:
    state = thread_state_from_wire(_FIXTURE)
    assert state.active_correction

    block = correction_not_repeated_block(state)

    assert block == CORRECTION_NOT_REPEATED_BLOCK
    assert "UNE CORRECTION A ÉTÉ RECONNU" in block
    assert "RELANCE" in block


def test_a_correction_free_state_gives_nothing_even_when_other_fields_are_full() -> None:
    state = thread_state_from_wire({**_FIXTURE, "correction": None})
    assert not state.active_correction

    assert correction_not_repeated_block(state) == ""


# ── La traversée jusqu'au routeur ────────────────────────────────────────────


def test_the_block_reaches_the_prompt_before_the_thread_state(client: TestClient) -> None:
    """#1980 — l'état du fil (`format_thread_state_block`) reste le DERNIER
    texte du segment volatil : ce rappel se pose AVANT lui, jamais après."""
    captured, _terminal = _post(client, {"thread_state": _FIXTURE})
    system = captured["system"]

    assert "UNE CORRECTION A ÉTÉ RECONNU" in system
    assert system.index("UNE CORRECTION A ÉTÉ RECONNU") < system.index(THREAD_STATE_HEADER)
    assert system.endswith(format_thread_state_block(thread_state_from_wire(_FIXTURE)))


def test_no_correction_no_reminder_in_the_prompt(client: TestClient) -> None:
    no_correction = {**_FIXTURE, "correction": None}
    captured, _terminal = _post(client, {"thread_state": no_correction})

    assert "UNE CORRECTION A ÉTÉ RECONNU" not in captured["system"]


# ── #194.2 (reste, épopée #3233) — L'INVALIDATION FORMELLE, JUSQU'AU PROMPT ──


def test_invalidated_tools_reach_the_prompt_as_a_targeted_relaunch(client: TestClient) -> None:
    """Appelant réel : un état déjà invalidé (le plan de `find_accounts`
    absent de `searches`, comme le pose `_remember_thread_note` au tour où la
    correction est reconnue) fait apparaître, dans le prompt système de CE
    tour, la ligne qui NOMME l'outil à relancer — jamais « relance tout »."""
    already_invalidated = {
        **_FIXTURE,
        "searches": [s for s in _FIXTURE["searches"] if s["tool"] != "find_accounts"],
        "correction": {
            "correction_type": "wrong_scope",
            "summary": "J'ai utilisé la mauvaise couche",
            "invalidates": ["find_accounts"],
        },
    }
    captured, _terminal = _post(client, {"thread_state": already_invalidated})
    system = captured["system"]

    assert "la recherche de comptes" in system
    assert "à RELANCER" in system
    # Le plan invalidé a bien disparu : plus de ligne « Dernière recherche
    # préparée (find_accounts) » dans l'état rendu.
    assert "préparée (find_accounts)" not in system


def test_an_uninvalidated_correction_gives_no_relaunch_line(client: TestClient) -> None:
    no_invalidation = {**_FIXTURE, "correction": {**_FIXTURE["correction"], "invalidates": []}}
    captured, _terminal = _post(client, {"thread_state": no_invalidation})

    assert "à RELANCER" not in captured["system"]
