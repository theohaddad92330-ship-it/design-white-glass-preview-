"""Épopée #2778 (lot b, 27/09) — `search_missions`.

Classé `_deferred_fit` par le lot du 26/09 (« missions à échéance — fin
opérationnelle, validité du bon de commande — compatible `file_export`, non
câblé ce lot »). FINIR-V2-27-09 : un « reste » compatible se lève ce tour.
Le handler (`chat_tools.py`, branche `search_missions`) rend déjà une liste
PLATE et bornée (`id`, `label`, `account`, `ends_on`, `renewal_window`,
`po_valid_until`?) — sans classement ni score.
"""

from __future__ import annotations

import pytest

from app.models.reply_blocks import validate_reply_block
from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool


def _tool(name: str) -> dict:
    return next(t for t in CHAT_TOOLS if t["name"] == name)


def test_search_missions_instructs_the_file_export_card() -> None:
    description = _tool("search_missions")["description"]
    assert "carte `file_export`" in description
    assert "pas de carte" in description


@pytest.mark.asyncio
async def test_search_missions_output_can_fill_the_file_export_card(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _missions_ending(*_a: object, **_k: object) -> dict:
        return {
            "missions": [
                {
                    "id": "m-1",
                    "label": "Refonte SI",
                    "accountName": "ACME",
                    "ends_on": "2026-10-15",
                    "renewal": "a_traiter",
                },
                {"id": "m-2", "label": "Support", "accountName": "Latecoere", "ends_on": None, "renewal": "unknown"},
            ]
        }

    monkeypatch.setattr(bellum_api, "missions_ending", _missions_ending)
    result = await execute_chat_tool(
        "search_missions",
        {},
        user_id="33333333-3333-4333-8333-333333333333",
        profile_data=None,
    )
    missions = result["missions"]
    card = {
        "type": "file_export",
        "filename": "missions.csv",
        "columns": ["Mission", "Compte", "Fin opérationnelle"],
        "rows": [{"cells": [m["label"], m["account"], m["ends_on"]]} for m in missions],
    }
    validated = validate_reply_block(card)
    assert validated is not None
    # « Non mesuré » : une mission sans date de fin reste `None`, jamais « 0 ».
    assert validated["rows"][1]["cells"][2] is None


def test_no_mission_ending_yields_no_card_content() -> None:
    """SAIT DIRE NON — `file_export.rows` exige au moins une ligne (min 1)."""
    card = {"type": "file_export", "filename": "missions.csv", "columns": ["Mission"], "rows": []}
    assert validate_reply_block(card) is None
