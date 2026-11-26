"""#3209 (LAU-FINAL-215, beta 28/09/2026) — `get_portfolio_priorities`.

La règle de répartition (4 catégories, plafond, diversité) vit côté NestJS
(`derivePortfolioPriorities`, testée seule là-bas). Cet outil relaie TEL
QUEL, comme `list_accounts_to_act` avant lui — même famille de tests que
`test_chat_list_accounts_to_act_file_export_card.py`.
"""

from __future__ import annotations

import pytest

from app.models.reply_blocks import validate_reply_block
from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool


def _tool(name: str) -> dict:
    return next(t for t in CHAT_TOOLS if t["name"] == name)


def test_get_portfolio_priorities_instructs_the_file_export_card_in_order() -> None:
    description = _tool("get_portfolio_priorities")["description"]
    assert "carte `file_export`" in description
    assert "maintenant" in description
    # NO-GO explicite de la spec — jamais un tri par score descendant.
    assert "jamais un tri par score" in description


@pytest.mark.asyncio
async def test_get_portfolio_priorities_relays_the_four_named_buckets(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    priorities = {
        "now": [
            {
                "id": "a-1",
                "companyName": "ACME",
                "bucket": "now",
                "reason": "Signal actuel.",
                "lastActionAt": None,
            }
        ],
        "toVerify": [],
        "toWatch": [
            {
                "id": "a-2",
                "companyName": "Latecoere",
                "bucket": "to_watch",
                "reason": "Sans mouvement.",
                "lastActionAt": None,
            }
        ],
        "notNow": [],
        "capacityCap": 8,
    }

    async def _portfolio_priorities(*_a: object, **_k: object) -> dict:
        return priorities

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "portfolio_priorities", _portfolio_priorities)
    result = await execute_chat_tool(
        "get_portfolio_priorities",
        {},
        user_id="33333333-3333-4333-8333-333333333333",
        profile_data=None,
    )
    assert {key: result[key] for key in priorities} == priorities

    card = {
        "type": "file_export",
        "filename": "portefeuille-priorites.csv",
        "columns": ["Compte", "Catégorie", "Raison"],
        "rows": [
            {"cells": [item["companyName"], item["bucket"], item["reason"]]}
            for item in result["now"] + result["toWatch"]
        ],
    }
    assert validate_reply_block(card) is not None


@pytest.mark.asyncio
async def test_get_portfolio_priorities_surfaces_a_clear_error_when_the_bridge_is_silent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _portfolio_priorities(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "portfolio_priorities", _portfolio_priorities)
    result = await execute_chat_tool(
        "get_portfolio_priorities",
        {},
        user_id="33333333-3333-4333-8333-333333333333",
        profile_data=None,
    )
    assert result["error"] == "Le portefeuille n'a pas répondu."
    assert result["status"] == "provider_error"
