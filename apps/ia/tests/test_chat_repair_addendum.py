"""#3241 (#3190.2/.12/.13, lot P11 30/09) — la réparation ACTIVE sans
bufferiser : le texte a déjà été diffusé au fil de l'eau, alors le levier
« ajouter une limite » PROLONGE la réponse d'une précision déterministe
(diffusée ET renvoyée, donc jamais un message affiché ≠ message stocké).

Rejeu du tour réel : réponse du modèle → `run_chat_with_tools` → deltas émis
et texte renvoyé. Tranché sans Louis : seuls les motifs qu'une LIMITE répare
honnêtement (action déclarée sans preuve, capacité non connectée, chiffre non
sourcé) reçoivent un addendum ; la forme (longueur, titre, liste) ne se répare
pas en ajoutant du texte."""

from __future__ import annotations

import pytest

from app.services import chat_orchestrator
from app.services.commercial_verifier import (
    ACTION_DECLARED_WITHOUT_PROOF,
    ARTIFICIAL_LIST,
    EVIDENCE_REQUIRED_MISSING,
    RESPONSE_TOO_LONG,
    UNSUPPORTED_CLAIM,
    repair_addendum,
)
from tests.test_chat_verifier_status_exposure import USER, _install_client, _patch_env, _resp, _text  # noqa: F401


def test_the_addendum_names_the_limit_for_an_action_declared_without_proof():
    fr = repair_addendum([ACTION_DECLARED_WITHOUT_PROOF], "fr")
    en = repair_addendum([ACTION_DECLARED_WITHOUT_PROOF], "en")
    assert "rien envoyé" in fr and "rien envoyé" not in en
    assert "sent nothing" in en


def test_the_addendum_is_empty_for_shape_reasons_and_for_no_reason():
    assert repair_addendum([], "fr") == ""
    assert repair_addendum([RESPONSE_TOO_LONG, ARTIFICIAL_LIST], "fr") == ""


def test_one_addendum_per_repairable_reason_in_a_stable_order():
    text = repair_addendum([ACTION_DECLARED_WITHOUT_PROOF, RESPONSE_TOO_LONG, "affirmation_non_supportee"], "fr")
    assert text.count("Précision") == 2


@pytest.mark.asyncio
async def test_a_reply_claiming_a_send_is_completed_with_the_limit_streamed_and_returned(monkeypatch):
    _install_client(monkeypatch, [_resp("end_turn", [_text("Message envoyé à Claire.")])])
    events: list[dict] = []

    async def _emit(event: dict) -> None:
        events.append(event)

    sink: list[str] = []
    reply, _ = await chat_orchestrator.run_chat_with_tools(
        "sys", "user", user_id=USER, profile_data=None, verifier_status_sink=sink, emit=_emit
    )

    assert reply.startswith("Message envoyé à Claire.")
    assert "rien envoyé" in reply
    streamed = "".join(e["text"] for e in events if e.get("type") == "delta")
    assert "rien envoyé" in streamed
    assert reply.endswith(streamed.split("Message envoyé à Claire.")[-1])
    assert sink == ["repair"]


@pytest.mark.asyncio
async def test_a_clean_reply_is_returned_byte_identical_no_addendum(monkeypatch):
    _install_client(monkeypatch, [_resp("end_turn", [_text("Bonjour Louis.")])])
    reply, _ = await chat_orchestrator.run_chat_with_tools("sys", "user", user_id=USER, profile_data=None)
    assert reply == "Bonjour Louis."


@pytest.mark.asyncio
async def test_the_english_interface_gets_the_english_limit(monkeypatch):
    _install_client(monkeypatch, [_resp("end_turn", [_text("Message envoyé à Claire.")])])
    reply, _ = await chat_orchestrator.run_chat_with_tools(
        "sys", "user", user_id=USER, profile_data=None, interface_language="en"
    )
    assert "sent nothing" in reply


def test_no_tool_result_precision_when_a_tool_answered():
    """#3396 — la réponse cite 5 sources : jamais « aucun résultat d'outil »."""
    assert repair_addendum([UNSUPPORTED_CLAIM], "fr", tools_answered=True) == ""
    assert repair_addendum([EVIDENCE_REQUIRED_MISSING], "en", tools_answered=True) == ""


def test_one_single_no_tool_result_label_when_no_tool_answered():
    """#3215 — deux motifs, un seul libellé."""
    text = repair_addendum([UNSUPPORTED_CLAIM, EVIDENCE_REQUIRED_MISSING], "fr")
    assert text.count("Précision") == 1
    assert "aucun résultat d'outil ce tour" in text
    assert repair_addendum([UNSUPPORTED_CLAIM], "fr") == text


@pytest.mark.asyncio
async def test_the_replayed_turn_with_a_tool_result_gets_no_no_tool_precision():
    """#3396 — tour rejoué : un outil a répondu, la réponse cite un chiffre qu'il
    ne contient pas → pas de « Précision : … aucun résultat d'outil »."""
    events: list[dict] = []

    async def _emit(event: dict) -> None:
        events.append(event)

    text = "Société Générale compte 4 812 contacts, source du 29 septembre."
    out = await chat_orchestrator._verify_and_repair(
        text, emit=_emit, interface_language="fr", tool_outputs=['{"sources": 5, "contacts": 12}']
    )
    assert out == text
    assert events == []

    out_without_tool = await chat_orchestrator._verify_and_repair(
        text, emit=_emit, interface_language="fr", tool_outputs=[]
    )
    assert out_without_tool.count("Précision") == 1
