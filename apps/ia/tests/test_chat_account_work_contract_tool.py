"""#2300 LAU-FINAL-041 — l'APPELANT du compilateur de contrat de travail.

Un contrat juste que personne n'appelle ne compte pas (piège n°1 du dépôt,
mesuré sur `commercial_status='decideur'` : circuit complet sauf l'entrée).
Ce test verrouille l'entrée : le nouvel outil de chat `get_account_work_contract`
est exposé au modèle, résout l'ownership du compte AVANT de compiler, et ne
compile JAMAIS pour un compte étranger ou introuvable.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.services.chat_tools import CHAT_TOOLS, WRITE_TOOL_NAMES, execute_chat_tool

USER = "33333333-3333-4333-8333-333333333333"
_ACCOUNT = {"id": "acc-owned", "company_name": "ACME"}


async def _run(tool_input: dict, *, account: dict | Exception = _ACCOUNT) -> dict:
    side_effect = account if isinstance(account, Exception) else None
    return_value = None if isinstance(account, Exception) else account
    with (
        patch("app.services.supabase_client.get_supabase", return_value=MagicMock()),
        patch(
            "app.services.ownership.fetch_owned_account",
            new_callable=AsyncMock,
            return_value=return_value,
            side_effect=side_effect,
        ),
    ):
        return await execute_chat_tool("get_account_work_contract", tool_input, user_id=USER, profile_data=None)


def test_registry_exposes_the_tool() -> None:
    names = {t["name"] for t in CHAT_TOOLS}
    assert "get_account_work_contract" in names
    # Additif : les outils déjà exposés restent tous là.
    assert "offer_reply_options" in names


def test_it_is_a_pure_read_never_a_write_tool() -> None:
    # Lecture pure, aucune écriture : pas de porte de confirmation à ouvrir.
    assert "get_account_work_contract" not in WRITE_TOOL_NAMES


def test_schema_requires_account_id() -> None:
    tool = next(t for t in CHAT_TOOLS if t["name"] == "get_account_work_contract")
    assert tool["input_schema"]["required"] == ["account_id"]


@pytest.mark.asyncio
async def test_requires_an_account_id() -> None:
    result = await execute_chat_tool("get_account_work_contract", {}, user_id=USER, profile_data=None)
    assert "error" in result
    # #2852.6-53 (lot t02-29-09) — même enveloppe canonique que
    # get_account_briefing sur une lecture à un seul enregistrement.
    assert result["status"] == "invalid_input"
    assert result["result_type"] == "account_work_contract"
    assert result["error_code"] == "missing_account_id"


@pytest.mark.asyncio
async def test_refuses_a_foreign_or_missing_account() -> None:
    result = await _run({"account_id": "acc-x"}, account=HTTPException(status_code=404, detail="Account not found"))
    assert "error" in result
    assert "canonical_goals" not in result
    assert result["status"] == "empty"
    assert result["result_type"] == "account_work_contract"


@pytest.mark.asyncio
async def test_owned_account_compiles_the_contract() -> None:
    result = await _run({"account_id": "acc-owned", "raw_goal": "préparer un rendez-vous"})
    assert result["account_id"] == "acc-owned"
    assert result["objective"]["id"] == "preparer_rendez_vous"
    assert result["identified"] is True
    assert result["status"] == "success"
    assert result["result_type"] == "account_work_contract"
    assert result["sources_consulted"] == ["bellum_workspace"]


@pytest.mark.asyncio
async def test_no_goal_yet_says_so_and_never_invents_one() -> None:
    result = await _run({"account_id": "acc-owned"})
    assert result["identified"] is False
    assert "guidance" in result
    assert "objective" not in result


@pytest.mark.asyncio
async def test_relays_the_internal_fields_the_model_supplies() -> None:
    result = await _run(
        {
            "account_id": "acc-owned",
            "territory": "Île-de-France",
            "expected_result": "un rendez-vous signé",
            "primary_result_kind": "brief de rendez-vous",
            "secondary_steps": ["trouver le bon contact"],
        }
    )
    assert result["territory"] == "Île-de-France"
    assert result["expected_result"] == "un rendez-vous signé"
    assert result["primary_result_kind"] == "brief de rendez-vous"
    assert result["secondary_steps"] == ["trouver le bon contact"]
