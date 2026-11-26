"""Épopée #2955 (#2394.6/.19/.43) — `propose_crm_note`, l'appelant manquant
qui matérialise `suggested_writeback` (`thread_compiler.py`) en proposition.

`suggest_writeback` calculait déjà un diff CRM pour un fil « à répondre » ou
« à relancer », mais aucun outil ne pouvait le transformer en carte : le
modèle voyait la donnée, n'avait rien à appeler (six lots l'ont vérifié entre
le 25 et le 29/09, `#2955`). Ce test verrouille :

  1. l'outil est exposé au modèle et compté comme un outil d'écriture ;
  2. son exécution renvoie une PROPOSITION, jamais un effet ;
  3. sans CRM connecté ou sans note, il le DIT plutôt que de proposer un
     geste fantôme ;
  4. un contact étranger ne donne lieu à AUCUNE proposition.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.services.chat_tools import CHAT_TOOLS, WRITE_TOOL_NAMES, execute_chat_tool

_CONTACT = {
    "id": "11111111-1111-4111-8111-111111111111",
    "full_name": "Claire Dubois",
    "account_id": "22222222-2222-4222-8222-222222222222",
}


def _sb_that_forbids_writes() -> MagicMock:
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


async def _run(tool_input: dict, contact=_CONTACT, **kwargs) -> dict:
    with (
        patch("app.services.supabase_client.get_supabase", return_value=_sb_that_forbids_writes()),
        patch("app.services.ownership.fetch_owned_contact", new_callable=AsyncMock, return_value=contact),
    ):
        return await execute_chat_tool(
            "propose_crm_note", tool_input, user_id="user-1", profile_data=None, **kwargs
        )


async def _run_foreign(tool_input: dict, **kwargs) -> dict:
    with (
        patch("app.services.supabase_client.get_supabase", return_value=_sb_that_forbids_writes()),
        patch(
            "app.services.ownership.fetch_owned_contact",
            new_callable=AsyncMock,
            side_effect=HTTPException(status_code=404, detail="Contact not found"),
        ),
    ):
        return await execute_chat_tool(
            "propose_crm_note", tool_input, user_id="user-1", profile_data=None, **kwargs
        )


def test_registry_exposes_the_tool_as_a_write_tool():
    names = {t["name"] for t in CHAT_TOOLS}
    assert "propose_crm_note" in names
    assert "propose_crm_note" in WRITE_TOOL_NAMES


def test_tool_description_announces_the_confirmation_step():
    tool = next(t for t in CHAT_TOOLS if t["name"] == "propose_crm_note")
    assert "valid" in tool["description"].lower()
    assert "n'écrit" in tool["description"]


@pytest.mark.asyncio
async def test_propose_crm_note_returns_a_proposal_and_writes_nothing():
    out = await _run(
        {"contact_id": _CONTACT["id"], "note": "Relancer sur le devis, silence depuis 8 jours."},
        crm_connected=True,
        crm_provider="hubspot",
    )
    assert out["status"] == "pending_confirmation"
    proposal = out["proposal"]
    assert proposal["action"] == "propose_crm_note"
    assert proposal["contact_id"] == _CONTACT["id"]
    assert proposal["contact_name"] == "Claire Dubois"
    assert proposal["note"] == "Relancer sur le devis, silence depuis 8 jours."
    # Jamais un export : aucun champ de fiche (email/titre/société) proposé.
    assert "provider" not in proposal
    assert "contact_email" not in proposal
    assert proposal["cost_credits"] == 0


@pytest.mark.asyncio
async def test_propose_crm_note_carries_the_thread_id_when_given():
    out = await _run(
        {"contact_id": _CONTACT["id"], "note": "À relancer.", "thread_id": "thread-42"},
        crm_connected=True,
        crm_provider="hubspot",
    )
    assert out["proposal"]["thread_id"] == "thread-42"


@pytest.mark.asyncio
async def test_propose_crm_note_omits_thread_id_when_absent():
    out = await _run(
        {"contact_id": _CONTACT["id"], "note": "À relancer."},
        crm_connected=True,
        crm_provider="hubspot",
    )
    assert "thread_id" not in out["proposal"]


@pytest.mark.asyncio
async def test_propose_crm_note_says_it_when_no_crm_is_connected():
    out = await _run(
        {"contact_id": _CONTACT["id"], "note": "À relancer."},
        crm_connected=False,
    )
    assert "proposal" not in out
    assert "CRM" in out["error"]


@pytest.mark.asyncio
async def test_propose_crm_note_without_a_note_is_refused():
    out = await _run({"contact_id": _CONTACT["id"]}, crm_connected=True, crm_provider="hubspot")
    assert "proposal" not in out and "error" in out


@pytest.mark.asyncio
async def test_propose_crm_note_on_a_foreign_contact_yields_no_proposal():
    out = await _run_foreign(
        {"contact_id": "33333333-3333-4333-8333-333333333333", "note": "À relancer."},
        crm_connected=True,
        crm_provider="hubspot",
    )
    assert "error" in out and "proposal" not in out
