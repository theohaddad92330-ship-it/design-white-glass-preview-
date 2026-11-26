"""#4417.1 — « réponds à ce mail » en un geste : la réponse est déposée DANS le fil d'origine.

Chemin : `search_mailbox` (si le fil n'est pas nommé) → `read_mail_thread` → `prepare_mail_draft`
avec le `thread_id` du fil. Rien n'est envoyé : le brouillon est montré, le commercial envoie.
"""

from __future__ import annotations

import pytest

from app.prompts.laura_role_and_voice import BLOCK_ROLE_AND_VOICE
from app.services import chat_tools
from app.services.chat_tools import PREPARE_MAIL_DRAFT_TOOL

_ARGS = {"to": "jean@acme.com", "subject": "Re: Proposition", "body": "Bonjour Jean, merci pour votre retour."}


def test_the_tool_description_routes_a_reply_through_the_thread() -> None:
    description = PREPARE_MAIL_DRAFT_TOOL["description"]
    assert "réponds à ce mail" in description
    assert "read_mail_thread" in description and "search_mailbox" in description
    props = PREPARE_MAIL_DRAFT_TOOL["input_schema"]["properties"]  # type: ignore[index]
    assert "FIL D'ORIGINE" in props["thread_id"]["description"]


def test_the_system_prompt_orients_reply_requests_to_that_path() -> None:
    assert "RÉPONDRE À UN MAIL" in BLOCK_ROLE_AND_VOICE
    assert "thread_id" in BLOCK_ROLE_AND_VOICE and "read_mail_thread" in BLOCK_ROLE_AND_VOICE
    assert "n'envoies jamais" in BLOCK_ROLE_AND_VOICE


@pytest.mark.asyncio
async def test_a_reply_carries_the_thread_id_and_says_it_lands_in_the_thread() -> None:
    result = await chat_tools.execute_chat_tool(
        "prepare_mail_draft", {**_ARGS, "thread_id": "th-42"}, user_id="u1", profile_data=None
    )
    proposal = result["proposal"]
    assert proposal["thread_id"] == "th-42"
    assert "fil d'origine" in proposal["note_pour_laura"]
    assert "jamais" in proposal["note_pour_laura"]  # jamais envoyé, toujours


@pytest.mark.asyncio
async def test_a_new_message_carries_no_thread_and_does_not_claim_one() -> None:
    result = await chat_tools.execute_chat_tool("prepare_mail_draft", _ARGS, user_id="u1", profile_data=None)
    proposal = result["proposal"]
    assert "thread_id" not in proposal
    assert "fil d'origine" not in proposal["note_pour_laura"]
