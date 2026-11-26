"""RV4-E-FIX 4287.2 (#3399.6, recette prod 20/10) — « alternatives plus accessibles qu'Airbus » répondait « aucune
alternative mesurablement plus accessible » : le secteur / la base d'une question PRÉCÉDENTE, recopiés par le modèle
dans l'appel, restaient appliqués. Le secteur et la base d'une alternative se lisent sur le compte VISÉ ; le filtre
d'un autre tour ne s'applique que si le message du tour le nomme — et la réponse DIT ce qu'elle a remplacé."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services import chat_requested_mode
from app.services.chat_tools import execute_chat_tool

USER = "44444444-4444-4444-8444-444444444444"


def _stub(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    monkeypatch.setattr("app.services.supabase_client.get_supabase", MagicMock(return_value=MagicMock()))
    account = {
        "id": "acc-1",
        "company_name": "Airbus",
        "siren": "383474814",
        "naf_code": "30.30Z",
        "raw_analysis": {"plan": {"evaluation": {"verdict": "PRUDENT"}}},
    }
    monkeypatch.setattr("app.services.ownership.fetch_owned_account", AsyncMock(return_value=account))
    seen: list[dict[str, Any]] = []

    async def _search(search_input: dict[str, Any], **_k: Any) -> dict[str, Any]:
        seen.append(search_input)
        return {"items": []}

    monkeypatch.setattr("app.services.chat_tools._run_account_search", _search)
    monkeypatch.setattr("app.services.pappers.get_company", AsyncMock(side_effect=RuntimeError("down")))
    return seen


async def _run(message: str, tool_input: dict[str, Any]) -> dict[str, Any]:
    token = chat_requested_mode._TURN_THREAD.set((message, ()))  # noqa: SLF001
    try:
        return await execute_chat_tool("suggest_account_alternatives", tool_input, user_id=USER, profile_data=None)
    finally:
        chat_requested_mode._TURN_THREAD.reset(token)  # noqa: SLF001


@pytest.mark.asyncio
async def test_a_sector_filter_of_a_previous_question_does_not_pollute_the_turn(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen = _stub(monkeypatch)
    result = await _run(
        "Quelles alternatives plus accessibles qu'Airbus ?", {"account_id": "acc-1", "sectors": ["finance"]}
    )
    assert seen[0]["sectors"] == ["industry"], seen
    assert "finance" in result["sector_note"]


@pytest.mark.asyncio
async def test_a_sector_the_message_names_is_kept(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = _stub(monkeypatch)
    result = await _run("Des alternatives à Airbus dans la banque ?", {"account_id": "acc-1", "sectors": ["finance"]})
    assert seen[0]["sectors"] == ["finance"]
    assert "sector_note" not in result


@pytest.mark.asyncio
async def test_a_sector_of_the_target_section_is_untouched(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = _stub(monkeypatch)
    result = await _run("Alternatives à Airbus", {"account_id": "acc-1", "sectors": ["industry"]})
    assert seen[0]["sectors"] == ["industry"]
    assert "sector_note" not in result
