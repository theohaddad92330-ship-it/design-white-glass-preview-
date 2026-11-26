"""#3224 (recette prod 02/10, Y14) — le geste à 3 messages dans un FIL NEUF, rejoué en tours entiers
(``/chat/message``, état du fil renvoyé d'un tour au suivant, modèle simulé qui N'appelle ni
``note_thread_context`` ni ``ask_clarification`` — le cas observé en prod).

Cause : le graphe de contraintes ne se remplissait que si le modèle l'alimentait ; sinon aucune
contrainte nommée, aucune contradiction, aucune question. Désormais le message est lu
mécaniquement (lexique des règles de conflit) et la réponse porte ce que le modèle a omis.

Question exacte à poser en recette (/chat, fil neuf), trois messages :
1. « Trouve-moi des comptes grand groupe »            → « Contrainte retenue : taille « grand groupe » »
2. « Et sans référencement »                           → « Arbitrage : taille « grand groupe » / modèle d'achat
   « sans référencement » se contredisent … Laquelle garde la priorité ? »
3. « Le grand groupe compte plus que le reste »        → « Priorité retenue : taille « grand groupe » ; je relâche
   modèle d'achat « sans référencement » »
"""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.services import chat_orchestrator
from app.services.constraint_graph import constraint_turn_addendum, constraints_from_message, merge_message_constraints
from tests.test_chat_market_memory_group_turn_replay_x61 import (  # noqa: F401 — fixtures autouse
    USER,
    _env,
    _FakeMessages,
    _parse_sse,
    _resp,
    _text,
)


def _turn(monkeypatch, client: TestClient, message: str, model_text: str, thread_state=None) -> dict:
    fake = SimpleNamespace(messages=_FakeMessages([_resp("end_turn", [_text(model_text)])]))
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)
    body = {"message": message, "user_id": USER}
    if thread_state is not None:
        body["thread_state"] = thread_state
    res = client.post("/chat/message", json=body)
    assert res.status_code == 200
    done = _parse_sse(res.text)[-1]
    assert done["type"] == "done" and done["success"] is True, done
    return done["data"]


def test_the_three_message_gesture_names_the_constraints_and_asks_the_arbitration(monkeypatch, client) -> None:
    one = _turn(monkeypatch, client, "Trouve-moi des comptes grand groupe", "Voici par où commencer.")
    # #5086 — « Contrainte retenue » quitte le corps : elle voyage dans `context.reply_notes` (panneau Sources).
    assert "Contrainte retenue" not in one["reply"]
    assert any("taille « grand groupe »" in note for note in one["context"]["reply_notes"])

    two = _turn(
        monkeypatch, client, "Et sans référencement", "Voici des comptes.", thread_state=one["thread_state"]
    )
    assert "modèle d'achat « sans référencement »" in two["reply"]
    assert "taille « grand groupe »" in two["reply"]
    assert "Laquelle garde la priorité ?" in two["reply"]

    three = _turn(
        monkeypatch,
        client,
        "Le grand groupe compte plus que le reste",
        "D'accord.",
        thread_state=two["thread_state"],
    )
    assert "Priorité retenue : taille « grand groupe »" in three["reply"]
    assert "je relâche modèle d'achat « sans référencement »" in three["reply"]
    assert "Laquelle garde la priorité" not in three["reply"]


def test_the_single_message_conflict_is_asked_in_the_same_turn(monkeypatch, client) -> None:
    out = _turn(
        monkeypatch,
        client,
        "Trouve-moi des comptes grand groupe, sans référencement",
        "Voici des comptes.",
    )
    assert "Arbitrage :" in out["reply"] and "Laquelle garde la priorité ?" in out["reply"]


def test_a_model_that_already_names_both_sides_is_not_repeated() -> None:
    constraints = merge_message_constraints([], constraints_from_message("grand groupe sans référencement", turn=1))
    said = "Taille : grand groupe et modèle d'achat : sans référencement se contredisent, lequel prime ?"
    assert constraint_turn_addendum(said, constraints, turn=1) == ""


def test_a_message_without_lexicon_names_nothing() -> None:
    assert constraints_from_message("Qui est le DSI de Thales ?", turn=1) == []
