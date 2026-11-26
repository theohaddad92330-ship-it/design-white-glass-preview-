"""#2268.7 — LES RÉSULTATS ACCEPTÉS, DISTINCTS DE LA DERNIÈRE LISTE RENDUE.

`last_list` porte la dernière liste RENDUE par un outil, dans son ordre
d'affichage — pas ce que l'utilisateur a RETENU dedans. Après « garde
Latecoere et Segula, écarte le reste », rien ne distinguait un résultat choisi
d'un résultat simplement montré : le fil ne savait dire ni « ce qu'on garde »
ni pourquoi il fallait continuer dessus plutôt que sur toute la liste.

Même voie que #2268.1/.5/.10 : le modèle NOMME ce qu'il retient via
`note_thread_context` (`accepted`), jamais un détecteur qui relit une phrase —
même refus que `ruled_out`/`assumptions` (`chat_thread_state.py:44-53`).
"""

from __future__ import annotations

from app.prompts.thread_state import format_thread_state_block
from app.services.chat_thread_state import (
    ACCEPTED_MAX,
    ThreadState,
    ThreadStateCollector,
    thread_state_from_wire,
)
from app.services.chat_tools import NOTE_THREAD_CONTEXT_TOOL, execute_chat_tool


def test_the_tool_accepts_an_accepted_field() -> None:
    schema = NOTE_THREAD_CONTEXT_TOOL["input_schema"]
    assert "accepted" in schema["properties"]


async def test_the_executor_keeps_what_the_model_named_as_accepted() -> None:
    out = await execute_chat_tool(
        "note_thread_context",
        {"accepted": ["Latecoere retenu comme cible prioritaire"]},
        user_id="u-1",
        profile_data=None,
    )

    assert out["accepted"] == ["Latecoere retenu comme cible prioritaire"]


def _collector() -> ThreadStateCollector:
    return ThreadStateCollector(ThreadState())


def test_the_state_remembers_accepted_results() -> None:
    collector = _collector()
    collector.record(
        "note_thread_context",
        {},
        {"status": "thread_note", "accepted": ["Latecoere retenu comme cible prioritaire"]},
    )

    assert collector.state.accepted == ["Latecoere retenu comme cible prioritaire"]


def test_the_most_recent_comes_first_and_the_list_is_bounded() -> None:
    collector = _collector()
    for index in range(ACCEPTED_MAX + 2):
        collector.record(
            "note_thread_context",
            {},
            {"status": "thread_note", "accepted": [f"resultat-{index}"]},
        )

    assert len(collector.state.accepted) == ACCEPTED_MAX
    assert collector.state.accepted[0] == f"resultat-{ACCEPTED_MAX + 1}"


def test_accepted_is_distinct_from_last_list() -> None:
    """Le témoin du besoin : une liste RENDUE ne fait pas un résultat ACCEPTÉ."""
    collector = _collector()
    collector.record(
        "list_accounts_to_act",
        {},
        {"accounts": [{"id": "a-1", "companyName": "Latecoere"}, {"id": "a-2", "companyName": "Segula"}]},
    )

    assert collector.state.last_list, "la liste rendue doit exister pour que le test soit probant"
    assert collector.state.accepted == []


def test_the_state_survives_the_round_trip_through_the_wire() -> None:
    collector = _collector()
    collector.record(
        "note_thread_context",
        {},
        {"status": "thread_note", "accepted": ["Latecoere retenu comme cible prioritaire"]},
    )

    revived = thread_state_from_wire(collector.state.to_wire())

    assert revived.accepted == ["Latecoere retenu comme cible prioritaire"]


def test_the_prompt_block_names_accepted_results() -> None:
    state = thread_state_from_wire(
        {"version": 1, "accepted": ["Latecoere retenu comme cible prioritaire"]}
    )

    block = format_thread_state_block(state)

    assert "Latecoere retenu comme cible prioritaire" in block


def test_a_reply_that_SAYS_an_acceptance_puts_nothing_in_the_state() -> None:
    """Même refus que #2268.1/.5/.10 : seule la sortie TYPÉE entre dans l'état."""
    collector = _collector()
    collector.record(
        "ask_clarification",
        {},
        {
            "status": "clarification",
            "question": "Je retiens Latecoere comme cible prioritaire. Quel prochain compte ?",
            "options": ["ACME", "BETA"],
        },
    )

    assert collector.state.accepted == []
