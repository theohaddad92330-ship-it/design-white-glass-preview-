"""#2268.29 / #2268.30 — L'HONNÊTETÉ D'UN TRAVAIL À PLUSIEURS TOURS.

Deux points du même défaut : à la reprise d'un fil dont un job est resté en
cours, Laura doit dire OÙ le travail s'est arrêté plutôt que de laisser croire
qu'il a abouti (#2268.29), et elle ne doit JAMAIS annoncer une action faite
(message envoyé, brouillon créé) sans qu'un outil de ce fil ne l'ait confirmée
(#2268.30).

`THREAD_CONTINUITY_BLOCK` (segment invariant) le disait déjà en conseil
général. Ce module ajoute le rappel STRICT, avec le gabarit exact, posé
UNIQUEMENT quand un job est réellement en cours (`current_job`) — un fil sans
travail à plusieurs tours garde un prompt inchangé au bit près, même discipline
que `clarification_spent_block`.
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.prompts.thread_state import (
    INTERRUPTED_WORK_BLOCK,
    THREAD_STATE_HEADER,
    format_thread_state_block,
    interrupted_work_block,
)
from app.services.chat_thread_state import ThreadState, thread_state_from_wire
from tests.test_chat_thread_state_turn import _post

_FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "thread_state_wire.json").read_text(encoding="utf-8"))


# ── La fonction, isolée ───────────────────────────────────────────────────────


def test_empty_without_a_job_in_progress() -> None:
    assert interrupted_work_block(ThreadState()) == ""


def test_the_block_appears_once_a_job_is_in_progress() -> None:
    state = thread_state_from_wire(_FIXTURE)
    assert state.current_job

    block = interrupted_work_block(state)

    assert block == INTERRUPTED_WORK_BLOCK
    assert "Le travail s'est interrompu après" in block
    assert "Je reprends." in block
    assert "N'annonce JAMAIS qu'une action a abouti" in block


def test_an_unrelated_new_question_is_not_told_to_open_with_the_resume_template() -> None:
    """#3474 — recette 30/09 : « consultant Java senior dispo dans 2 semaines »
    ouvrait sur « Le travail Java s'est interrompu… Reprendre ? », sans rapport
    avec la question. Le rappel doit maintenant dire explicitement de comparer
    le message courant au job avant d'ouvrir sur le gabarit de reprise, et de
    répondre d'abord à une question neuve et sans rapport."""
    state = thread_state_from_wire(_FIXTURE)
    block = interrupted_work_block(state)

    assert "compare CE message au job en cours" in block
    assert "sans rapport" in block
    assert "réponds à CETTE question, normalement" in block
    assert "le rappel de reprise n'est alors PAS la phrase d'ouverture" in block
    # Le gabarit de reprise reste disponible — pour le cas où le message SUIT
    # réellement le job, pas retiré.
    assert "Le travail s'est interrompu après" in block


def test_a_job_free_state_gives_nothing_even_when_other_fields_are_full() -> None:
    state = thread_state_from_wire({**_FIXTURE, "current_job": None})
    assert not state.current_job

    assert interrupted_work_block(state) == ""


# ── La traversée jusqu'au routeur ────────────────────────────────────────────


def test_the_block_reaches_the_prompt_before_the_thread_state(client: TestClient) -> None:
    """#1980 — l'état du fil (`format_thread_state_block`) reste le DERNIER
    texte du segment volatil : ce rappel se pose AVANT lui, jamais après."""
    captured, _terminal = _post(client, {"thread_state": _FIXTURE})
    system = captured["system"]

    assert "Le travail s'est interrompu après" in system
    assert system.index("Le travail s'est interrompu après") < system.index(THREAD_STATE_HEADER)
    assert system.endswith(format_thread_state_block(thread_state_from_wire(_FIXTURE)))


def test_no_job_no_reminder_in_the_prompt(client: TestClient) -> None:
    no_job = {**_FIXTURE, "current_job": None}
    captured, _terminal = _post(client, {"thread_state": no_job})

    assert "Le travail s'est interrompu après" not in captured["system"]


# ── #3482 — le gabarit n'est jamais un préambule systématique ────────────────


def test_the_block_forbids_a_status_preamble_on_a_complete_answer() -> None:
    """#3482 — recette prod du 30/09 : 4 réponses sur 4 s'ouvraient sur « Le
    travail s'est interrompu… », même complètes. Le rappel doit NOMMER les
    deux seuls cas où le gabarit s'emploie et interdire le préambule sinon."""
    assert "QUE si le dernier tour" in INTERRUPTED_WORK_BLOCK
    assert "NE COMMENCE PAS par une phrase de statut" in INTERRUPTED_WORK_BLOCK
    # l'ancienne consigne inconditionnelle ne doit pas revenir
    assert "Tant qu'aucun outil de ce fil n'a confirmé" not in INTERRUPTED_WORK_BLOCK
