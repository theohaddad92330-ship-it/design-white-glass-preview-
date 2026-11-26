"""Épopée #2781 (#2150.30) — « Ajouter au portefeuille » depuis Laura.

La MÊME porte que #2150.32 (CRM, `useAddCrmCompanyToPortfolio.ts`) et #2150.42
(recherche globale, `useAddAccountToPortfolio.ts`) : `POST /accounts/portfolio`
(`accountsApi.addToPortfolio`) — décision LOT j1 (26/09) : uniformité plutôt
qu'un régime à part. `c84_analyse_recherche_enrichissement_partent_sans_carte`
ne s'applique pas ici : ADD est une ÉCRITURE qui attribue le compte à son
commercial, pas une lecture interne — elle garde donc sa carte, comme
`create_target_list_from_account` (même famille).

Même patron que `test_chat_tools_create_target_list.py` : l'outil ne fait QUE
préparer la proposition, jamais écrire — c'est le clic qui appelle
`POST /accounts/portfolio`.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.services.chat_tools import CHAT_TOOLS, WRITE_TOOL_NAMES, execute_chat_tool


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


def test_add_account_to_portfolio_is_registered_as_a_write_tool():
    tool = next(t for t in CHAT_TOOLS if t["name"] == "add_account_to_portfolio")
    assert tool["name"] in WRITE_TOOL_NAMES
    assert tool["input_schema"]["required"] == ["company_name"]


@pytest.mark.asyncio
async def test_add_account_to_portfolio_returns_a_proposal_and_writes_nothing():
    with patch("app.services.supabase_client.get_supabase", return_value=_sb_that_forbids_writes()):
        out = await execute_chat_tool(
            "add_account_to_portfolio",
            {"company_name": "OGF"},
            user_id="user-1",
            profile_data=None,
        )
    assert out["status"] == "pending_confirmation"
    proposal = out["proposal"]
    assert proposal["action"] == "add_account_to_portfolio"
    assert proposal["company_name"] == "OGF"
    assert proposal["cost_credits"] == 0
    # Un champ facultatif ABSENT de la conversation ne se devine jamais.
    assert "siren" not in proposal
    assert "sector" not in proposal
    assert "website" not in proposal


@pytest.mark.asyncio
async def test_add_account_to_portfolio_carries_the_optional_identifiers_given():
    with patch("app.services.supabase_client.get_supabase", return_value=_sb_that_forbids_writes()):
        out = await execute_chat_tool(
            "add_account_to_portfolio",
            {"company_name": "OGF", "siren": "123456789", "sector": "Funéraire", "website": "ogf.fr"},
            user_id="user-1",
            profile_data=None,
        )
    proposal = out["proposal"]
    assert proposal["siren"] == "123456789"
    assert proposal["sector"] == "Funéraire"
    assert proposal["website"] == "ogf.fr"


@pytest.mark.asyncio
async def test_add_account_to_portfolio_without_a_name_yields_no_proposal():
    """SAIT DIRE NON — un nom d'entreprise vide (ou halluciné en blanc) ne
    désigne rien, la carte ne se monte pas."""
    with patch("app.services.supabase_client.get_supabase", return_value=_sb_that_forbids_writes()):
        out = await execute_chat_tool(
            "add_account_to_portfolio",
            {"company_name": "   "},
            user_id="user-1",
            profile_data=None,
        )
    assert "error" in out and "proposal" not in out
