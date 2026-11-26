"""#3864.6 (lot M06, cause racine de la recette prod 09/10) — « trouve-moi des
besoins » faisait écrire au MODÈLE un `file_export` d'une colonne par champ de
besoin (~10), au-delà des 8 colonnes du contrat strict : la carte était refusée
puis aplatie en puces (le rendu de secours de G03 la sauve, il ne la corrige pas).

La carte se borne désormais À LA SOURCE : `find_needs` rend une carte
`file_export` déjà construite, colonnes choisies côté outil, validée par le
même contrat que l'écran. Le modèle la recopie, il ne choisit plus les colonnes.
"""

from __future__ import annotations

import pytest

from app.models.reply_blocks import validate_reply_block
from app.services import bellum_api
from app.services.chat_tools import FIND_NEEDS_TOOL, execute_chat_tool

USER = "11111111-1111-4111-8111-111111111111"

_ROW = {
    "id": "22222222-2222-4222-8222-222222222222",
    "title": "Data engineer Spark",
    "account_name": "ACME",
    "status": "open",
    "urgency": "high",
    "skills": ["Spark", "Scala", "AWS"],
    "start_on": "2026-11-02",
    "deadline_at": "2026-10-20",
    "next_action": "run_matching",
    "source": "email",
    "status_changed_at": "2026-10-01",
    "project_id": None,
    "contract_kind": "regie",
}


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)


async def _run(monkeypatch: pytest.MonkeyPatch, rows: list[dict]) -> dict:
    async def _find_needs(user_id: str, **kwargs: object) -> dict:
        return {"data": rows, "pagination": {"totalItems": len(rows)}}

    monkeypatch.setattr(bellum_api, "find_needs", _find_needs)
    return await execute_chat_tool("find_needs", {"query": "data"}, user_id=USER, profile_data=None)


@pytest.mark.asyncio
async def test_find_needs_hands_a_card_that_passes_the_strict_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    out = await _run(monkeypatch, [_ROW, {**_ROW, "id": "x", "title": "Java", "skills": None, "start_on": None}])
    card = out["card"]
    assert card["type"] == "file_export"
    assert 1 <= len(card["columns"]) <= 8
    assert validate_reply_block(card) is not None
    assert len(card["rows"]) == 2
    first = card["rows"][0]["cells"]
    assert "Data engineer Spark" in first and "ACME" in first
    assert "Spark, Scala, AWS" in first
    # An absent value stays absent (null = « non mesuré »), never a filler.
    assert None in card["rows"][1]["cells"]


@pytest.mark.asyncio
async def test_no_need_no_card(monkeypatch: pytest.MonkeyPatch) -> None:
    out = await _run(monkeypatch, [])
    # An empty list is said in text, never as a card without rows.
    assert "card" not in out


def test_the_tool_description_says_to_copy_the_card_not_to_pick_columns() -> None:
    assert "`card`" in FIND_NEEDS_TOOL["description"]
