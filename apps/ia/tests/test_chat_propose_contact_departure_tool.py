"""#3871.1 (lot V11, 07/10, recette prod 2e passe) — `propose_contact_departure`.

Recette KO : « Eynatte… a quitté l'entreprise. Mets à jour le dossier » →
Laura répondait « je ne peux pas modifier directement le statut de la fiche »,
sans jamais proposer le geste. Ce test verrouille :

  1. l'outil est exposé au modèle et compté comme un outil d'écriture ;
  2. son exécution renvoie une PROPOSITION (jamais un effet) qui vise
     directement `historique` — ARCHIVE, jamais une suppression ;
  3. un contact déjà en historique, ou déjà écarté (`rejete`, terminal plus
     fort), ne redonne pas lieu à une proposition ;
  4. un contact étranger ne donne lieu à AUCUNE proposition.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.services.chat_tools import CHAT_TOOLS, WRITE_TOOL_NAMES, execute_chat_tool

_CONTACT = {
    "id": "11111111-1111-4111-8111-111111111111",
    "full_name": "Pierre Eynatte",
    "account_id": "22222222-2222-4222-8222-222222222222",
    "lifecycle_state": "actionnable",
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


async def _run(tool_input: dict, contact=_CONTACT) -> dict:
    with (
        patch("app.services.supabase_client.get_supabase", return_value=_sb_that_forbids_writes()),
        patch("app.services.ownership.fetch_owned_contact", new_callable=AsyncMock, return_value=contact),
    ):
        return await execute_chat_tool("propose_contact_departure", tool_input, user_id="user-1", profile_data=None)


async def _run_foreign(tool_input: dict) -> dict:
    with (
        patch("app.services.supabase_client.get_supabase", return_value=_sb_that_forbids_writes()),
        patch(
            "app.services.ownership.fetch_owned_contact",
            new_callable=AsyncMock,
            side_effect=HTTPException(status_code=404, detail="Contact not found"),
        ),
    ):
        return await execute_chat_tool("propose_contact_departure", tool_input, user_id="user-1", profile_data=None)


def test_registry_exposes_the_tool_as_a_write_tool():
    names = {t["name"] for t in CHAT_TOOLS}
    assert "propose_contact_departure" in names
    assert "propose_contact_departure" in WRITE_TOOL_NAMES


def test_tool_description_announces_the_confirmation_step_and_never_deletes():
    tool = next(t for t in CHAT_TOOLS if t["name"] == "propose_contact_departure")
    assert "n'écrit" in tool["description"]
    assert "supprimé" in tool["description"]


@pytest.mark.asyncio
async def test_propose_contact_departure_returns_a_proposal_and_writes_nothing():
    out = await _run({"contact_id": _CONTACT["id"]})
    assert out["status"] == "pending_confirmation"
    proposal = out["proposal"]
    assert proposal["action"] == "propose_contact_departure"
    assert proposal["contact_id"] == _CONTACT["id"]
    assert proposal["contact_name"] == "Pierre Eynatte"
    assert proposal["account_id"] == _CONTACT["account_id"]
    assert proposal["cost_credits"] == 0


@pytest.mark.asyncio
async def test_requires_a_contact_id():
    out = await _run({})
    assert "error" in out and "proposal" not in out


@pytest.mark.asyncio
async def test_a_contact_already_historical_is_named_rather_than_reproposed():
    out = await _run({"contact_id": _CONTACT["id"]}, contact={**_CONTACT, "lifecycle_state": "historique"})
    assert "proposal" not in out
    assert "historique" in out["error"]


@pytest.mark.asyncio
async def test_rejete_outranks_historique_and_is_never_overwritten():
    out = await _run({"contact_id": _CONTACT["id"]}, contact={**_CONTACT, "lifecycle_state": "rejete"})
    assert "proposal" not in out
    assert "écarté" in out["error"]


@pytest.mark.asyncio
async def test_propose_contact_departure_on_a_foreign_contact_yields_no_proposal():
    out = await _run_foreign({"contact_id": "33333333-3333-4333-8333-333333333333"})
    assert "error" in out and "proposal" not in out
