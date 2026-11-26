"""#3247.r40 — recette R40 : « quelles alternatives à Safran ? » (groupe ABSENT du portefeuille).

L'outil exigeait un compte analysé du portefeuille : sans `account_id`, Laura répondait en prose
(Airbus/Thales/Renault) avec un verdict global. Hors portefeuille, l'outil cherche quand même, et CHAQUE
candidat porte ses trois lectures (relation CRM, présence marché, preuve dans ce secteur) — une lecture
« rien vu » se dit, elle ne se tait pas.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.models.reply_blocks import RankedAccount
from app.services.chat_tools import execute_chat_tool
from tests.test_chat_alternatives_autonomous_subsidiary_3247 import USER, _stub


async def _run(monkeypatch: pytest.MonkeyPatch, tool_input: dict) -> dict:
    _stub(monkeypatch, {})
    monkeypatch.setattr("app.services.bellum_api.access_by_siren", AsyncMock(return_value={}))
    monkeypatch.setattr("app.services.bellum_api.community_access_by_siren", AsyncMock(return_value={
        "111": {"owned": False, "community": {"value": "ouvert", "isCommunity": True, "sourcesCount": 3, "conflict": False}}
    }))
    return await execute_chat_tool("suggest_account_alternatives", tool_input, user_id=USER, profile_data=None)


@pytest.mark.asyncio
async def test_a_group_outside_the_portfolio_still_gets_alternatives(monkeypatch: pytest.MonkeyPatch) -> None:
    result = await _run(monkeypatch, {"company_name": "Safran", "sectors": ["finance"]})
    assert "error" not in result
    assert result["alternatives"], result
    # Aucun verdict n'est inventé pour un groupe que l'espace n'a pas analysé.
    assert result["source_account_verdict"] is None
    assert "portefeuille" in result["source_account_note"]


@pytest.mark.asyncio
async def test_without_account_nor_name_the_tool_still_refuses(monkeypatch: pytest.MonkeyPatch) -> None:
    result = await _run(monkeypatch, {"sectors": ["finance"]})
    assert "error" in result


@pytest.mark.asyncio
async def test_each_candidate_carries_crm_market_and_proof_readings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.services.chat_tools._pool_market_memory_signal", AsyncMock(return_value={"ex_esn_observed": False})
    )
    monkeypatch.setattr("app.services.chat_tools._pool_crm_relation_signal", AsyncMock(return_value={"matched": False}))
    result = await _run(monkeypatch, {"company_name": "Safran", "sectors": ["finance"]})
    checked = " | ".join(result["alternatives"][0]["checked"])
    assert "relation CRM" in checked
    assert "présence marché" in checked
    assert "preuve dans ce secteur" in checked


@pytest.mark.asyncio
async def test_a_failed_reading_is_named_missing_never_said_none(monkeypatch: pytest.MonkeyPatch) -> None:
    result = await _run(monkeypatch, {"company_name": "Safran", "sectors": ["finance"]})
    alt = result["alternatives"][0]
    assert not any("relation CRM" in c for c in alt["checked"])
    assert any("relation CRM" in m for m in alt["missing_check"])


def test_a_complete_missing_partner_sentence_fits_the_card() -> None:
    sentence = "chemin d'accès (partenaire) — aucun partenaire déclaré sur ce compte, absence de ligne et non preuve d'absence"
    assert len(sentence) > 80
    card = RankedAccount(name="X", why=["a"], not_evaluated=[sentence])
    assert card.not_evaluated == [sentence]
