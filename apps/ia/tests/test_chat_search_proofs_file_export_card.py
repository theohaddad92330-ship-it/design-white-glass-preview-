"""Épopée #2778 (lot b, 27/09) — `search_proofs`.

Classé `_deferred_fit` par le lot du 26/09 (« références mobilisables — preuve,
consentement — compatible `file_export`, non câblé ce lot »). FINIR-V2-27-09 :
un « reste » compatible se lève ce tour. `usableProofs`
(`capitalisation.service.ts`) rend déjà une liste PLATE de `Proof` (`claim`,
`sector`, `strength`, ...) — sans classement ni score.
"""

from __future__ import annotations

import pytest

from app.models.reply_blocks import validate_reply_block
from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool


def _tool(name: str) -> dict:
    return next(t for t in CHAT_TOOLS if t["name"] == name)


def test_search_proofs_instructs_the_file_export_card() -> None:
    description = _tool("search_proofs")["description"]
    assert "carte `file_export`" in description
    assert "pas de carte" in description


@pytest.mark.asyncio
async def test_search_proofs_output_can_fill_the_file_export_card(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _usable_proofs(*_a: object, **_k: object) -> dict:
        return {
            "items": [
                {"id": "p-1", "claim": "Migration cloud livrée en 3 mois", "sector": "Banque", "strength": "forte"},
                {"id": "p-2", "claim": "Support 24/7 mis en place", "sector": None, "strength": "moyenne"},
            ]
        }

    monkeypatch.setattr(bellum_api, "usable_proofs", _usable_proofs)
    result = await execute_chat_tool(
        "search_proofs",
        {},
        user_id="33333333-3333-4333-8333-333333333333",
        profile_data=None,
    )
    proofs = result["proofs"]
    card = {
        "type": "file_export",
        "filename": "preuves.csv",
        "columns": ["Preuve", "Secteur", "Force"],
        "rows": [{"cells": [p["claim"], p["sector"], p["strength"]]} for p in proofs],
    }
    validated = validate_reply_block(card)
    assert validated is not None
    # « Non mesuré » : un secteur absent reste `None`, jamais une cellule vide.
    assert validated["rows"][1]["cells"][1] is None


def test_no_proof_found_yields_no_card_content() -> None:
    """SAIT DIRE NON — `file_export.rows` exige au moins une ligne (min 1)."""
    card = {"type": "file_export", "filename": "preuves.csv", "columns": ["Preuve"], "rows": []}
    assert validate_reply_block(card) is None
