"""#5086 (arbitrage Louis 31/10) — « Précision : … » et « Contrainte retenue : … » quittent le CORPS de la
réponse et voyagent dans ``reply_notes`` (champ structuré du contexte) jusqu'au panneau Sources.
Le texte exact est tenu (#3224, #3190.2/.12) ; l'arbitrage (une question à trancher) reste dans le corps."""

from __future__ import annotations

import pytest

from app.services import chat_orchestrator
from app.services.constraint_graph import ThreadConstraint, annotate_constraints, split_constraint_turn_addendum


class _State:
    def __init__(self, constraints: list[ThreadConstraint], turns: int) -> None:
        self.constraints = constraints
        self.turns = turns


class _Thread:
    def __init__(self, constraints: list[ThreadConstraint], turns: int) -> None:
        self.state = _State(constraints, turns)


async def _noop(_: dict) -> None:
    return None


@pytest.mark.asyncio
async def test_a_precision_leaves_the_body_and_reaches_the_notes_sink() -> None:
    events: list[dict] = []

    async def emit(event: dict) -> None:
        events.append(event)

    notes: list[str] = []
    out = await chat_orchestrator._verify_and_repair(
        "Message envoyé à Claire.", emit=emit, interface_language="fr", tool_outputs=[], notes_sink=notes
    )
    assert out == "Message envoyé à Claire."
    assert events == []
    assert len(notes) == 1 and notes[0].startswith("Précision : je n'ai rien envoyé")


@pytest.mark.asyncio
async def test_the_constraint_note_leaves_the_body_too() -> None:
    notes: list[str] = []
    thread = _Thread([ThreadConstraint("expected_volume", "5 comptes", source_turn=1)], turns=1)
    out = await chat_orchestrator._verify_and_repair(
        "Voici cinq comptes.", emit=_noop, interface_language="fr", tool_outputs=['{"ok": 1}'], thread=thread, notes_sink=notes
    )
    assert "Contrainte retenue" not in out
    assert notes == ["Contrainte retenue : volume attendu « 5 comptes »."]


def test_the_split_names_the_note_apart_from_the_arbitration_lines() -> None:
    kept, lines = split_constraint_turn_addendum("", [ThreadConstraint("size", "grand groupe", source_turn=1)], turn=1)
    assert kept == "Contrainte retenue : taille « grand groupe »." and lines == []
    conflict = [
        ThreadConstraint("size", "grand groupe", priority="primary", source_turn=3),
        ThreadConstraint("purchase_model", "sans référencement", source_turn=2),
        ThreadConstraint("referencing", "sans référencement", source_turn=2),
    ]
    note, arbitration = split_constraint_turn_addendum("", annotate_constraints(conflict), turn=3)
    assert note == "" and any(line.startswith("Priorité retenue") for line in arbitration)


@pytest.mark.asyncio
async def test_without_a_sink_the_text_stays_in_the_body() -> None:
    """Un appelant sans panneau Sources ne perd rien : le texte reste où il était."""
    out = await chat_orchestrator._verify_and_repair(
        "Message envoyé à Claire.", emit=_noop, interface_language="fr", tool_outputs=[]
    )
    assert "Précision" in out
