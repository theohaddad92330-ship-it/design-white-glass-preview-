"""#2445.6 (#2442.16, #2766) — `chat_turn_context` : un `ContextVar` copie sa
valeur dans une tâche asyncio créée APRÈS l'avoir posée, ce qui est la
garantie exacte dont `chat.py` a besoin (poser avant `asyncio.create_task
(_pump())`, relire en profondeur dans `execute_chat_tool`, sans changer aucune
signature entre les deux).
"""

from __future__ import annotations

import asyncio

from app.services import chat_turn_context


async def test_a_task_created_after_set_sees_the_value():
    chat_turn_context.set_current_turn_id("turn-1")

    async def _inner() -> str | None:
        return chat_turn_context.current_turn_id()

    task = asyncio.create_task(_inner())
    assert await task == "turn-1"

    chat_turn_context.set_current_turn_id(None)


async def test_default_is_none_outside_any_bound_turn():
    assert chat_turn_context.current_turn_id() is None


async def test_a_task_created_before_set_does_not_see_a_later_value():
    """Le contexte est copié à la CRÉATION de la tâche — poser la valeur après
    coup, dans le parent, ne remonte jamais dans une tâche déjà lancée."""
    started = asyncio.Event()
    seen: list[str | None] = []

    async def _inner() -> None:
        started.set()
        await asyncio.sleep(0.01)
        seen.append(chat_turn_context.current_turn_id())

    task = asyncio.create_task(_inner())
    await started.wait()
    chat_turn_context.set_current_turn_id("turn-late")
    await task

    assert seen == [None]
    chat_turn_context.set_current_turn_id(None)
