"""#3444 (recette prod 02/10, Y11) — une objection de prospect ramène le texte approuvé VERBATIM
et cite la règle d'or, sans question de clarification, même si le modèle ne cherche pas.

Questions exactes à poser en recette dans /chat : « Je ne suis pas décideur sur ces sujets »,
« On a déjà eu une mauvaise expérience avec une ESN », « Nous gérons tout en interne »."""

from __future__ import annotations

import pytest

from app.knowledge.content_library import CONTENT_LIBRARY_ENTRIES
from app.services import chat_orchestrator
from app.services.objection_first import (
    approved_objection_for,
    approved_objection_note,
    ensure_approved_objection,
)
from tests.test_chat_orchestrator import _install_client, _patch_env, _resp, _text  # noqa: F401

PHRASES = {
    "Je ne suis pas décideur sur ces sujets": "objection-pas-decideur",
    "On a déjà eu une mauvaise expérience avec une ESN": None,
    "Nous gérons tout en interne": None,
}


def _entry(entry_id):
    return next(e for e in CONTENT_LIBRARY_ENTRIES if e["id"] == entry_id)


@pytest.mark.parametrize("phrase", list(PHRASES))
def test_the_three_recette_phrases_resolve_to_an_approved_objection(phrase):
    entry = approved_objection_for(phrase)
    assert entry is not None and entry["kind"] == "objection_response"
    if PHRASES[phrase]:
        assert entry["id"] == PHRASES[phrase]


@pytest.mark.parametrize(
    "message",
    ["Votre logo est moche", "Analyse Decathlon", "Qui est le DSI de Société Générale ?", "Bonjour", ""],
)
def test_the_guard_knows_how_to_say_no(message):
    assert approved_objection_for(message) is None
    assert approved_objection_note(message) == ""


def test_the_note_carries_the_verbatim_text_the_rule_and_forbids_asking():
    note = approved_objection_note("Je ne suis pas décideur sur ces sujets")
    assert _entry("objection-pas-decideur")["body"] in note
    assert "valider l'objection" in note and "règle d'or" in note.lower()


def test_the_reply_always_carries_the_approved_text_and_the_rule():
    body = _entry("objection-pas-decideur")["body"]
    out = ensure_approved_objection("Je comprends, qui décide ?", "Je ne suis pas décideur sur ces sujets")
    assert body in out and "Règle d’or" in out and out.startswith("Je comprends")
    assert ensure_approved_objection(out, "Je ne suis pas décideur sur ces sujets") == out
    assert ensure_approved_objection("ok", "Bonjour") == "ok"
    assert ensure_approved_objection("", "Je ne suis pas décideur sur ces sujets") == ""


@pytest.mark.asyncio
async def test_replayed_turn_clarification_is_removed_and_text_is_guaranteed(monkeypatch):
    fake = _install_client(monkeypatch, [_resp("end_turn", [_text("Quelle ESN ? Précise-moi le contexte.")])])
    reply, _ = await chat_orchestrator.run_chat_with_tools(
        "sys",
        "On a déjà eu une mauvaise expérience avec une ESN",
        user_id="u1",
        profile_data=None,
        user_message="On a déjà eu une mauvaise expérience avec une ESN",
    )
    offered = {t["name"] for t in fake.messages.calls[0]["tools"]}
    assert "ask_clarification" not in offered
    assert "mauvaises expériences" in str(fake.messages.calls[0]["system"]).lower()
    body = next(e for e in CONTENT_LIBRARY_ENTRIES if e["title"].startswith("On a eu de mauvaises"))["body"]
    assert body in reply
