"""#4055 (recette R20 15/10) — « Complète SERVIER SAS » : le CRM muet ne doit pas supprimer la séparation
base / hors base / à rapprocher."""

from __future__ import annotations

from app.prompts.commercial_method_turn import account_completion_turn_block


def test_unrelated_message_yields_no_block() -> None:
    assert account_completion_turn_block("Quel est le SIREN de Thales ?") == ""
    assert account_completion_turn_block("Complète ce message avec une accroche") == ""


def test_complete_account_requests_the_three_levels() -> None:
    for message in ("Complète SERVIER SAS", "complete ce compte", "Peux-tu compléter le compte Renault ?"):
        block = account_completion_turn_block(message)
        assert "déjà dans la base" in block, message
        assert "hors base" in block
        assert "à rapprocher" in block


def test_silent_crm_never_blocks_the_separation() -> None:
    block = account_completion_turn_block("Complète SERVIER SAS")
    assert "n'a pas répondu" in block
    assert "ne bloque jamais la séparation" in block
