"""Lot X25 (02/10) — TOURS REJOUÉS #3233 (correction → invalidation → relance) et #3236 (reprise).

Entrée → VRAI exécuteur d'outil (`note_thread_context`) → état du fil → ce que le
tour SUIVANT reçoit. Prouve la mécanique observable (plan retiré, relance repartant
de zéro, rappel anti-répétition, reprise proposée) ; l'obéissance du modèle vivant
est la question de recette posée dans les issues.
"""

from __future__ import annotations

import pytest

from app.prompts.thread_state import correction_not_repeated_block, format_thread_state_block, interrupted_work_block
from app.services.chat_thread_state import ThreadState, ThreadStateCollector
from app.services.chat_tools import execute_chat_tool


@pytest.mark.asyncio
async def test_3233_replay_une_correction_retire_le_plan_et_la_relance_repart_de_zero():
    thread = ThreadStateCollector(ThreadState())
    # Tour 1 : « Trouve-moi des ESN à Lyon » — la recherche préparée est retenue.
    thread.record("find_accounts", {"sectors": ["ESN"], "department": "69"}, {"accounts": []})
    assert thread.state.searches["find_accounts"] == {"sectors": ["ESN"], "department": "69"}

    # Tour 2 : « Non, pas Lyon, je parlais de Lille » — Laura nomme la correction.
    note = await execute_chat_tool(
        "note_thread_context",
        {
            "correction": {
                "correction_type": "wrong_scope",
                "summary": "Mauvais périmètre : Lyon au lieu de Lille",
                "invalidates": ["find_accounts"],
            }
        },
        user_id="u-1",
        profile_data=None,
    )
    thread.record("note_thread_context", {}, note)

    # Le plan retenu a disparu : une relance `refine` ne retrouve PAS Lyon.
    assert "find_accounts" not in thread.state.searches
    _input, refinement = thread.prepare("find_accounts", {"refine": True, "department": "59"})
    assert refinement is not None and refinement["previous_found"] is False
    assert refinement["kept"] == {}

    # Et le tour reçoit le rappel anti-répétition + la correction dans l'état du fil.
    assert "UNE CORRECTION A ÉTÉ RECONNU" in correction_not_repeated_block(thread.state)
    assert "Lille" in format_thread_state_block(thread.state)


@pytest.mark.asyncio
async def test_3233_une_correction_sans_outil_nomme_ne_retire_rien_par_devinette():
    thread = ThreadStateCollector(ThreadState())
    thread.record("find_accounts", {"sectors": ["ESN"]}, {"accounts": []})
    note = await execute_chat_tool(
        "note_thread_context",
        {"correction": {"correction_type": "style_preference", "summary": "Plus court"}},
        user_id="u-1",
        profile_data=None,
    )
    thread.record("note_thread_context", {}, note)
    assert "find_accounts" in thread.state.searches


def test_3236_replay_un_travail_en_suspens_est_propose_a_la_reprise_au_tour_suivant():
    thread = ThreadStateCollector(ThreadState())
    thread.note_unfinished_work("Fais une étude complète du groupe Thales", 4, 4)
    block = interrupted_work_block(thread.state)
    assert block and "Thales" in format_thread_state_block(thread.state)
