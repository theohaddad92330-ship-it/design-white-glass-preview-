"""#3894.3 (Louis 16-17/10) — « lance la prospection » sur plusieurs contacts = N préparations
INDIVIDUELLES (doctrine c74), jamais une audience multi-contacts : Laura le DIT dans sa réponse."""

from __future__ import annotations

from app.services.chat_tools import CHAT_TOOLS


def _description() -> str:
    return next(t for t in CHAT_TOOLS if t["name"] == "prepare_message_for_contact")["description"]


def test_laura_is_told_to_say_n_individual_preparations_not_an_audience() -> None:
    text = _description()
    assert "N préparations individuelles" in text
    assert "dis-le dans ta réponse" in text.lower()
    assert "aucun objet audience" in text


def test_the_instruction_keeps_the_explicit_multi_contact_gate() -> None:
    text = _description()
    assert "explicit_multi_contact" in text and "Ne devine JAMAIS une audience" in text
