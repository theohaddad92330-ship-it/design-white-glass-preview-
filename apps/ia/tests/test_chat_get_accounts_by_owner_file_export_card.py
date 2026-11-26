"""Épopée #2778 (54 outils de lecture sans carte structurée) — `get_accounts_by_owner`.

Trouvé par la garde de couverture (`chat_read_tool_card_coverage.py`) : cet
outil (#3094) est apparu APRÈS le lot qui a construit la garde, et n'y était
pas classé. Même forme que `search_workspace_accounts` — une liste PLATE de
comptes (`CopilotAccountsSearchController.byOwner`, deux colonnes, aucun
classement, aucun score) — juste filtrée par membre plutôt que par nom/secteur.
"""

from __future__ import annotations

import pytest

from app.models.reply_blocks import validate_reply_block
from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool


def _tool(name: str) -> dict:
    return next(t for t in CHAT_TOOLS if t["name"] == name)


def test_get_accounts_by_owner_instructs_the_file_export_card() -> None:
    description = _tool("get_accounts_by_owner")["description"]
    assert "carte `file_export`" in description
    assert "pas de carte" in description


@pytest.mark.asyncio
async def test_get_accounts_by_owner_output_can_fill_the_file_export_card(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _by_owner(*_a: object, **_k: object) -> dict:
        return {
            "memberFound": True,
            "ownerName": "Camille R.",
            "accounts": [
                {"account_id": "a-1", "company_name": "ACME", "sector": "SSII"},
                {"account_id": "a-2", "company_name": "Latecoere", "sector": None},
            ],
        }

    monkeypatch.setattr(bellum_api, "workspace_accounts_by_owner", _by_owner)
    result = await execute_chat_tool(
        "get_accounts_by_owner",
        {"owner_name": "Camille"},
        user_id="33333333-3333-4333-8333-333333333333",
        profile_data=None,
    )
    accounts = result["accounts"]
    card = {
        "type": "file_export",
        "filename": "comptes.csv",
        "columns": ["Compte", "Secteur"],
        "rows": [{"cells": [a["company_name"], a["sector"]]} for a in accounts],
    }
    validated = validate_reply_block(card)
    assert validated is not None
    # « Non mesuré » : un secteur absent reste `None`, jamais une cellule de
    # remplissage (« 0 », « - »…).
    assert validated["rows"][1]["cells"][1] is None


@pytest.mark.asyncio
async def test_member_not_found_yields_no_card_content(monkeypatch: pytest.MonkeyPatch) -> None:
    """SAIT DIRE NON — sans membre résolu, `accounts` est vide et
    `file_export.rows` exige au moins une ligne (min 1) : pas de carte."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _by_owner(*_a: object, **_k: object) -> dict:
        return {"memberFound": False, "accounts": []}

    monkeypatch.setattr(bellum_api, "workspace_accounts_by_owner", _by_owner)
    result = await execute_chat_tool(
        "get_accounts_by_owner",
        {"owner_name": "Quelqu'un d'inexistant"},
        user_id="33333333-3333-4333-8333-333333333333",
        profile_data=None,
    )
    assert result["member_found"] is False
    assert result["accounts"] == []
    card = {"type": "file_export", "filename": "comptes.csv", "columns": ["Compte"], "rows": []}
    assert validate_reply_block(card) is None
