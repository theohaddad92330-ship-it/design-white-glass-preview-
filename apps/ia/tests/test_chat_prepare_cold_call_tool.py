"""#2376 (LAU-FINAL-091) — LE BRIEF D'APPEL, avant un appel de prospection.

Même motif que `enrich_contact` (`test_chat_action_tools.py`) : l'exécuteur ne
fait que des LECTURES (identité, entreprise, fonction résolues sur la fiche du
contact — jamais écrites par le modèle), et renvoie une PROPOSITION. Le reste
— raison, objectif, ouverture, questions, objection, repli, résultat attendu —
est la préparation de Laura, vérifiée présente ici plutôt que refusée par Zod
sans dire au modèle ce qui manque.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.services.chat_tools import CHAT_TOOLS, WRITE_TOOL_NAMES, execute_chat_tool

_CONTACT = {
    "id": "11111111-1111-4111-8111-111111111111",
    "full_name": "Claire Dubois",
    "title": "DSI",
    "account_id": "22222222-2222-4222-8222-222222222222",
    "email": "claire@example.com",
    "entity": "ACME Digital",
}

_MINIMAL_INPUT = {
    "contact_id": _CONTACT["id"],
    "reason": "Aucun échange depuis le salon VivaTech (avril).",
    "objective": "Qualifier un besoin de renfort DevOps pour le T4.",
    "opening_question": "Vous avez trente secondes pour que je vous explique pourquoi je vous appelle ?",
    "next_questions": [
        "Qui pilote le périmètre applicatif chez vous ?",
        "Où en est le projet de migration cloud ?",
    ],
    "objection": "On a déjà un prestataire sur ce périmètre.",
    "fallback": "Demander qui pilote le sujet en interne, sans insister.",
    "expected_outcome": "Un besoin identifié ou une orientation vers le bon interlocuteur.",
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
        return await execute_chat_tool(
            "prepare_cold_call", tool_input, user_id="user-1", profile_data=None
        )


async def _run_foreign(tool_input: dict) -> dict:
    with (
        patch("app.services.supabase_client.get_supabase", return_value=_sb_that_forbids_writes()),
        patch(
            "app.services.ownership.fetch_owned_contact",
            new_callable=AsyncMock,
            side_effect=HTTPException(status_code=404, detail="Contact not found"),
        ),
    ):
        return await execute_chat_tool(
            "prepare_cold_call", tool_input, user_id="user-1", profile_data=None
        )


def test_registry_exposes_the_tool_and_counts_it_as_a_proposal_tool():
    names = {t["name"] for t in CHAT_TOOLS}
    assert "prepare_cold_call" in names
    assert "prepare_cold_call" in WRITE_TOOL_NAMES


def test_description_announces_the_confirmation_step_and_the_frame_not_script_rule():
    tool = next(t for t in CHAT_TOOLS if t["name"] == "prepare_cold_call")
    assert "n'écrit" in tool["description"]
    assert "valid" in tool["description"].lower()
    assert "cadre" in tool["description"].lower()


@pytest.mark.asyncio
async def test_returns_a_proposal_with_identity_read_from_the_record_and_writes_nothing():
    out = await _run(_MINIMAL_INPUT)
    assert out["status"] == "pending_confirmation"
    proposal = out["proposal"]
    assert proposal["action"] == "prepare_cold_call"
    assert proposal["contact_id"] == _CONTACT["id"]
    # Identité/entreprise/fonction viennent de la FICHE, jamais du modèle : le
    # modèle ne les a pas fournies dans `_MINIMAL_INPUT`.
    assert proposal["contact_name"] == "Claire Dubois"
    assert proposal["contact_title"] == "DSI"
    assert proposal["organization_name"] == "ACME Digital"
    assert proposal["reason"] == _MINIMAL_INPUT["reason"]
    assert proposal["next_questions"] == _MINIMAL_INPUT["next_questions"]
    assert proposal["context"] is None
    assert proposal["cost_credits"] == 0


@pytest.mark.asyncio
async def test_falls_back_to_the_account_name_as_org_anchor_without_an_entity():
    contact = {**_CONTACT, "entity": None}
    dossiers = [{"account_id": _CONTACT["account_id"], "company_name": "ACME SA"}]
    with patch("app.services.chat_tools._owned_account_dossiers", new_callable=AsyncMock, return_value=dossiers):
        out = await _run(_MINIMAL_INPUT, contact=contact)
    assert out["proposal"]["organization_name"] == "ACME SA"


@pytest.mark.asyncio
async def test_without_any_org_anchor_is_refused():
    contact = {**_CONTACT, "entity": None}
    with patch("app.services.chat_tools._owned_account_dossiers", new_callable=AsyncMock, return_value=[]):
        out = await _run(_MINIMAL_INPUT, contact=contact)
    assert "error" in out and "proposal" not in out


@pytest.mark.asyncio
async def test_on_a_foreign_contact_yields_no_proposal():
    out = await _run_foreign({**_MINIMAL_INPUT, "contact_id": "33333333-3333-4333-8333-333333333333"})
    assert "error" in out and "proposal" not in out


@pytest.mark.asyncio
async def test_requires_a_contact_id():
    out = await _run({**_MINIMAL_INPUT, "contact_id": ""})
    assert "error" in out and "proposal" not in out


@pytest.mark.asyncio
async def test_names_each_missing_preparation_field_instead_of_a_silent_zod_refusal():
    for field in ("reason", "objective", "opening_question", "objection", "fallback", "expected_outcome"):
        out = await _run({**_MINIMAL_INPUT, field: ""})
        assert "error" in out and "proposal" not in out

    out = await _run({**_MINIMAL_INPUT, "next_questions": []})
    assert "error" in out and "proposal" not in out
