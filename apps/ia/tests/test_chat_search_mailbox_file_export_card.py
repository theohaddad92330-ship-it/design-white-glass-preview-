"""Épopée #2778 (lot b, 27/09) — `search_mailbox`.

Classé `_deferred_fit` par le lot du 26/09 (« fils de discussion — interlocuteur,
date, ancienneté du silence — compatible `file_export`, non câblé ce lot »).
FINIR-V2-27-09 : un « reste » compatible se lève ce tour, pas un troisième
report. `compile_thread` (`app/services/compilers/thread_compiler.py`) rend déjà
une forme PLATE et bornée (`counterpart`, `subject`, `days_since_last_message`,
...) — la forme même qu'un `file_export` attend, sans classement ni score.
"""

from __future__ import annotations

import pytest

from app.models.reply_blocks import validate_reply_block
from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool


def _tool(name: str) -> dict:
    return next(t for t in CHAT_TOOLS if t["name"] == name)


def test_search_mailbox_instructs_the_file_export_card() -> None:
    description = _tool("search_mailbox")["description"]
    assert "carte `file_export`" in description
    assert "pas de carte" in description


@pytest.mark.asyncio
async def test_search_mailbox_output_can_fill_the_file_export_card(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _search_mailbox(*_a: object, **_k: object) -> dict:
        return {
            "intent": "no_reply",
            "threads": [
                {
                    "threadId": "t-1",
                    "subject": "Migration cloud — suite",
                    "counterpart": "j.dupont@acme.fr",
                    "daysSinceLastMessage": 12,
                    "awaitingReply": True,
                    "unread": False,
                    "hasAttachments": False,
                },
                {
                    "threadId": "t-2",
                    "subject": "Relance TJM",
                    "counterpart": None,
                    "daysSinceLastMessage": None,
                    "awaitingReply": True,
                    "unread": True,
                    "hasAttachments": True,
                },
            ],
            "truncated": False,
        }

    monkeypatch.setattr(bellum_api, "search_mailbox", _search_mailbox)
    result = await execute_chat_tool(
        "search_mailbox",
        {"intent": "no_reply"},
        user_id="33333333-3333-4333-8333-333333333333",
        profile_data=None,
    )
    threads = result["threads"]
    card = {
        "type": "file_export",
        "filename": "fils.csv",
        "columns": ["Interlocuteur", "Sujet", "Jours de silence"],
        "rows": [
            {
                "cells": [
                    t["counterpart"],
                    t["subject"],
                    str(t["days_since_last_message"]) if t["days_since_last_message"] is not None else None,
                ]
            }
            for t in threads
        ],
    }
    validated = validate_reply_block(card)
    assert validated is not None
    # « Non mesuré » : un interlocuteur ou un délai absent reste `None`.
    assert validated["rows"][1]["cells"][0] is None
    assert validated["rows"][1]["cells"][2] is None


def test_no_thread_found_yields_no_card_content() -> None:
    """SAIT DIRE NON — `file_export.rows` exige au moins une ligne (min 1) :
    aucun fil trouvé ne peut pas remplir cette carte."""
    card = {"type": "file_export", "filename": "fils.csv", "columns": ["Interlocuteur"], "rows": []}
    assert validate_reply_block(card) is None
