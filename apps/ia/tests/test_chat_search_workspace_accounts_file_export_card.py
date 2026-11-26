"""Épopée #2778 (54 outils de lecture sans carte structurée) — `search_workspace_accounts`.

Mesuré le 26/09/2026 : la carte `file_export` existe déjà (`reply-blocks.ts`,
`reply_blocks.py`, `downloadCSV`) — zéro outil ne l'instruisait encore.
`search_workspace_accounts` rend une liste PLATE (nom, secteur, date de
dernière analyse — `CopilotAccountsSearchController.search`, trois colonnes,
aucun axe à noter) : la forme même qu'un `file_export` attend, sans en forcer
aucune (aucun classement, aucun score).
"""

from __future__ import annotations

import pytest

from app.models.reply_blocks import validate_reply_block
from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool


def _tool(name: str) -> dict:
    return next(t for t in CHAT_TOOLS if t["name"] == name)


def test_search_workspace_accounts_instructs_the_file_export_card() -> None:
    description = _tool("search_workspace_accounts")["description"]
    assert "carte `file_export`" in description
    assert "pas de carte" in description


@pytest.mark.asyncio
async def test_search_workspace_accounts_output_can_fill_the_file_export_card(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _workspace_accounts(*_a: object, **_k: object) -> dict:
        return {
            "accounts": [
                {"account_id": "a-1", "company_name": "ACME", "sector": "SSII", "last_analyzed_at": "2026-09-01"},
                {"account_id": "a-2", "company_name": "Latecoere", "sector": None, "last_analyzed_at": None},
            ],
            "total": 2,
            "truncated": False,
        }

    monkeypatch.setattr(bellum_api, "workspace_accounts", _workspace_accounts)
    result = await execute_chat_tool(
        "search_workspace_accounts",
        {"query": "a"},
        user_id="33333333-3333-4333-8333-333333333333",
        profile_data=None,
    )
    accounts = result["accounts"]
    card = {
        "type": "file_export",
        "filename": "comptes.csv",
        "columns": ["Compte", "Secteur", "Dernière analyse"],
        "rows": [{"cells": [a["company_name"], a["sector"], a["last_analyzed_at"]]} for a in accounts],
    }
    validated = validate_reply_block(card)
    assert validated is not None
    # « Non mesuré » : un secteur ou une date absente reste `None`, jamais une
    # cellule de remplissage (« 0 », « - »…).
    assert validated["rows"][1]["cells"][1] is None
    assert validated["rows"][1]["cells"][2] is None


@pytest.mark.asyncio
async def test_no_matching_account_yields_no_card_content(monkeypatch: pytest.MonkeyPatch) -> None:
    """SAIT DIRE NON — `file_export.rows` exige au moins une ligne (min 1) :
    une recherche sans résultat ne peut pas remplir cette carte."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _workspace_accounts(*_a: object, **_k: object) -> dict:
        return {"accounts": [], "total": 0, "truncated": False}

    monkeypatch.setattr(bellum_api, "workspace_accounts", _workspace_accounts)
    result = await execute_chat_tool(
        "search_workspace_accounts",
        {"query": "inexistant"},
        user_id="33333333-3333-4333-8333-333333333333",
        profile_data=None,
    )
    assert result["accounts"] == []
    card = {"type": "file_export", "filename": "comptes.csv", "columns": ["Compte"], "rows": []}
    assert validate_reply_block(card) is None
