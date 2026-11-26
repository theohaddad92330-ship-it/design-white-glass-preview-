"""Épopée #2778 (54 outils de lecture sans carte structurée) — `list_accounts_to_act`.

Mesuré le 26/09/2026 : la carte `file_export` existe déjà (`reply-blocks.ts`,
`reply_blocks.py`) — zéro outil ne l'instruisait encore avant ce lot.
`list_accounts_to_act` rend une liste PLATE (compte, raison, dernière action —
`AccountsService.accountsAwaitingAction`, relayée TEL QUEL par
`bellum_api.accounts_to_act`) : exactement la forme qu'un `file_export`
attend (aucun axe, aucun classement) — une liste de relance à emporter.
"""

from __future__ import annotations

import pytest

from app.models.reply_blocks import validate_reply_block
from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool


def _tool(name: str) -> dict:
    return next(t for t in CHAT_TOOLS if t["name"] == name)


def test_list_accounts_to_act_instructs_the_file_export_card() -> None:
    description = _tool("list_accounts_to_act")["description"]
    assert "carte `file_export`" in description
    assert "pas de carte" in description


@pytest.mark.asyncio
async def test_list_accounts_to_act_output_can_fill_the_file_export_card(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _accounts_to_act(*_a: object, **_k: object) -> dict:
        return {
            "accounts": [
                {"id": "a-1", "companyName": "ACME", "reason": "awaiting_decision", "lastActionAt": None},
                {"id": "a-2", "companyName": "Latecoere", "reason": "no_recent_action", "lastActionAt": "2026-08-01"},
            ],
            "truncated": False,
        }

    monkeypatch.setattr(bellum_api, "accounts_to_act", _accounts_to_act)
    result = await execute_chat_tool(
        "list_accounts_to_act",
        {},
        user_id="33333333-3333-4333-8333-333333333333",
        profile_data=None,
    )
    accounts = result["accounts"]
    reason_label = {"awaiting_decision": "En attente de décision", "no_recent_action": "Aucune action récente"}
    card = {
        "type": "file_export",
        "filename": "comptes-a-relancer.csv",
        "columns": ["Compte", "Raison", "Dernière action"],
        "rows": [{"cells": [a["companyName"], reason_label[a["reason"]], a["lastActionAt"]]} for a in accounts],
    }
    validated = validate_reply_block(card)
    assert validated is not None
    # « Non mesuré » : aucune action encore journalisée reste `None`, jamais « - ».
    assert validated["rows"][0]["cells"][2] is None


@pytest.mark.asyncio
async def test_no_account_to_act_yields_no_card_content(monkeypatch: pytest.MonkeyPatch) -> None:
    """SAIT DIRE NON — `file_export.rows` exige au moins une ligne (min 1) :
    aucun compte en attente ne peut pas remplir cette carte."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _accounts_to_act(*_a: object, **_k: object) -> dict:
        return {"accounts": [], "truncated": False}

    monkeypatch.setattr(bellum_api, "accounts_to_act", _accounts_to_act)
    result = await execute_chat_tool(
        "list_accounts_to_act",
        {},
        user_id="33333333-3333-4333-8333-333333333333",
        profile_data=None,
    )
    assert result["accounts"] == []
    card = {"type": "file_export", "filename": "comptes-a-relancer.csv", "columns": ["Compte"], "rows": []}
    assert validate_reply_block(card) is None
