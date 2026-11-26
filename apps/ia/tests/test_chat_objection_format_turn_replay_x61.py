"""#3444 (recette prod 02/10, Y14) — « Réponse approuvée : « … » » + « Règle d'or : … » sur CHAQUE
phrase de prospect (1 sur 3 seulement en prod). Cause : le garde-fou testait les 40 premiers signes du
texte approuvé (une paraphrase qui en reprend l'attaque passait) et ne demandait aucun libellé (le texte
verbatim seul passait). Le TOUR entier est rejoué avec les trois phrases exactes et les réponses du modèle
telles qu'observées.

Questions exactes à poser en recette (/chat) : « Je ne suis pas décideur sur ces sujets », « On a déjà eu une
mauvaise expérience avec une ESN », « Nous gérons tout en interne » — chaque réponse doit porter les libellés
« Réponse approuvée : » avec le texte intégral et « Règle d'or : ».
"""

from __future__ import annotations

import pytest

from app.knowledge.content_library import CONTENT_LIBRARY_ENTRIES
from app.services import chat_orchestrator
from tests.test_chat_orchestrator import _install_client, _patch_env, _resp, _text  # noqa: F401


def _body(entry_id: str) -> str:
    return next(e for e in CONTENT_LIBRARY_ENTRIES if e["id"] == entry_id)["body"]


CASES = [
    # texte approuvé seul, sans libellé
    ("Je ne suis pas décideur sur ces sujets", "objection-pas-decideur", None),
    # déjà conforme : rien n'est doublé
    ("On a déjà eu une mauvaise expérience avec une ESN", "objection-mauvaises-experiences", "conform"),
    # paraphrase qui reprend l'attaque du texte approuvé + règle d'or en phrase
    ("Nous gérons tout en interne", "objection-gestion-interne", "paraphrase"),
]


def _model_reply(kind: str | None, entry_id: str) -> str:
    body = _body(entry_id)
    if kind is None:
        return body
    if kind == "conform":
        return (
            f"Réponse approuvée : « {body} »\nRègle d’or : valider l'objection, rebondir avec une question, "
            "identifier la vraie raison sous-jacente."
        )
    return (
        "C'est une bonne chose. Vos clients ou équipes utilisent-ils parfois des renforts, selon vous ? "
        "Ma règle d'or, c'est de valider puis de rebondir avec une question."
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(("phrase", "entry_id", "kind"), CASES)
async def test_every_objection_reply_carries_both_labels_and_the_full_text(monkeypatch, phrase, entry_id, kind):
    _install_client(monkeypatch, [_resp("end_turn", [_text(_model_reply(kind, entry_id))])])
    reply, _ = await chat_orchestrator.run_chat_with_tools(
        "sys", phrase, user_id="u1", profile_data=None, user_message=phrase
    )
    assert "Réponse approuvée : « " + _body(entry_id) + " »" in reply
    assert "Règle d’or : " in reply and reply.lower().count("réponse approuvée") == 1
    assert reply.count(_body(entry_id)) == 1


def test_the_conform_reply_is_byte_identical() -> None:
    from app.services.objection_first import ensure_approved_objection

    reply = _model_reply("conform", "objection-mauvaises-experiences")
    assert ensure_approved_objection(reply, "On a déjà eu une mauvaise expérience avec une ESN") == reply
