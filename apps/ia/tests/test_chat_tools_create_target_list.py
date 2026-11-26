"""Épopée #2853 (#2157.1) — « Créer une cible » depuis Laura.

La MÊME capacité que le dossier compte (`useCreateTargetFromAccount.ts`,
#2164.44, la surface « Analyser »), accessible depuis la conversation —
jamais un second moteur de création. Même patron que
`create_contact_from_crm_presence` (`test_chat_write_tools.py`) : l'outil ne
fait QUE relire le compte possédé et rendre une proposition, jamais écrire.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.chat_tools import CHAT_TOOLS, WRITE_TOOL_NAMES, execute_chat_tool

_ACCOUNT_DOSSIER = {"account_id": "33333333-3333-4333-8333-333333333333", "company_name": "RENAULT"}


def _sb_that_forbids_writes() -> MagicMock:
    """Supabase double dont toute écriture lève : si l'outil écrivait, le
    test casserait au lieu de passer en silence."""
    sb = MagicMock()

    def _explode(*_a, **_k):
        raise AssertionError("un outil de proposition ne doit JAMAIS écrire")

    table = MagicMock()
    table.insert.side_effect = _explode
    table.update.side_effect = _explode
    table.upsert.side_effect = _explode
    table.delete.side_effect = _explode
    sb.table.return_value = table
    return sb


def _patch_owned_account(dossiers=(_ACCOUNT_DOSSIER,)):
    """Le compte possédé, résolu server-side. Liste vide = compte étranger
    (ou halluciné) : l'outil doit refuser, pas proposer."""
    return (
        patch("app.services.supabase_client.get_supabase", return_value=_sb_that_forbids_writes()),
        patch(
            "app.services.chat_tools._owned_account_dossiers",
            new_callable=AsyncMock,
            return_value=list(dossiers),
        ),
    )


def test_create_target_list_from_account_is_registered_as_a_write_tool():
    tool = next(t for t in CHAT_TOOLS if t["name"] == "create_target_list_from_account")
    assert tool["name"] in WRITE_TOOL_NAMES
    assert tool["input_schema"]["required"] == ["account_id"]
    # Le nom de liste n'est jamais EXIGÉ : un nom générique se pose au clic.
    assert "name" in tool["input_schema"]["properties"]


@pytest.mark.asyncio
async def test_create_target_list_from_account_returns_a_proposal_and_writes_nothing():
    sb_patch, account_patch = _patch_owned_account()
    with sb_patch, account_patch:
        out = await execute_chat_tool(
            "create_target_list_from_account",
            {"account_id": _ACCOUNT_DOSSIER["account_id"]},
            user_id="user-1",
            profile_data=None,
        )
    assert out["status"] == "pending_confirmation"
    proposal = out["proposal"]
    assert proposal["action"] == "create_target_list_from_account"
    assert proposal["account_id"] == _ACCOUNT_DOSSIER["account_id"]
    # Le nom CANONIQUE du dossier possédé, jamais celui tapé dans la conversation.
    assert proposal["company"] == "RENAULT"
    assert proposal["cost_credits"] == 0
    # Aucun nom demandé dans le message : jamais un nom de liste inventé.
    assert proposal["name"] is None


@pytest.mark.asyncio
async def test_create_target_list_from_account_carries_the_requested_name():
    sb_patch, account_patch = _patch_owned_account()
    with sb_patch, account_patch:
        out = await execute_chat_tool(
            "create_target_list_from_account",
            {"account_id": _ACCOUNT_DOSSIER["account_id"], "name": "Grands comptes IDF"},
            user_id="user-1",
            profile_data=None,
        )
    assert out["proposal"]["name"] == "Grands comptes IDF"


@pytest.mark.asyncio
async def test_create_target_list_from_account_on_a_foreign_account_yields_no_proposal():
    """SAIT DIRE NON — un `account_id` halluciné (ou d'un autre espace) ne
    donne aucune proposition : elle nommerait une cible sur un dossier qui
    n'appartient pas au caller."""
    sb_patch, account_patch = _patch_owned_account(dossiers=())
    with sb_patch, account_patch:
        out = await execute_chat_tool(
            "create_target_list_from_account",
            {"account_id": "00000000-0000-4000-8000-000000000000"},
            user_id="user-1",
            profile_data=None,
        )
    assert "error" in out and "proposal" not in out
