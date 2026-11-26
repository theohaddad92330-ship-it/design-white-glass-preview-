"""#3247 (décision Louis 15/10/2026) — l'accès à un compte HORS portefeuille se lit par SIREN : le verrou
communautaire (agrégat anonyme, partage réciproque) alimente les alternatives. Un verrou n'est un fait « plus
accessible » que s'il est confirmé OUVERT ; verrouillé, il est nommé (jamais caché) ; sans fait, rien n'est affirmé.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.services.chat_tools import execute_chat_tool
from tests.test_chat_alternatives_autonomous_subsidiary_3247 import USER, _stub


def _community(value: str | None, *, confirmed: bool, sources: int = 3, available: bool = False) -> dict[str, Any]:
    return {
        "owned": False,
        "community": {
            "value": value,
            "isCommunity": confirmed,
            "sourcesCount": sources,
            "conflict": False,
            "communityAvailable": available,
            "values": [],
        },
    }


async def _run(monkeypatch: pytest.MonkeyPatch, by_siren: Any) -> dict[str, Any]:
    _stub(monkeypatch, {})
    monkeypatch.setattr("app.services.bellum_api.access_by_siren", AsyncMock(return_value={}))
    monkeypatch.setattr("app.services.bellum_api.community_access_by_siren", AsyncMock(return_value=by_siren))
    return await execute_chat_tool(
        "suggest_account_alternatives",
        {"account_id": "acc-1", "sectors": ["finance"], "department": "75"},
        user_id=USER,
        profile_data=None,
    )


@pytest.mark.asyncio
async def test_open_confirmed_by_the_community_is_an_easier_fact(monkeypatch: pytest.MonkeyPatch) -> None:
    result = await _run(monkeypatch, {"111": _community("ouvert", confirmed=True)})
    alt = result["alternatives"][0]
    assert "communauté" in alt["why_easier"]
    assert "ouvert" in alt["why_easier"]


@pytest.mark.asyncio
async def test_locked_is_named_never_hidden_and_never_easier(monkeypatch: pytest.MonkeyPatch) -> None:
    result = await _run(monkeypatch, {"111": _community("verrouille", confirmed=True)})
    # Sans autre fait « plus accessible », l'alternative est écartée ; verrouillé n'en est pas un.
    assert result["alternatives"] == []


@pytest.mark.asyncio
async def test_an_unconfirmed_value_is_not_a_fact(monkeypatch: pytest.MonkeyPatch) -> None:
    result = await _run(monkeypatch, {"111": _community("ouvert", confirmed=False, sources=1)})
    assert result["alternatives"] == []


@pytest.mark.asyncio
async def test_an_owned_siren_is_never_read_as_community(monkeypatch: pytest.MonkeyPatch) -> None:
    result = await _run(monkeypatch, {"111": {"owned": True, "community": None}})
    assert result["alternatives"] == []


@pytest.mark.asyncio
async def test_bridge_down_changes_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    result = await _run(monkeypatch, None)
    assert result["alternatives"] == []
