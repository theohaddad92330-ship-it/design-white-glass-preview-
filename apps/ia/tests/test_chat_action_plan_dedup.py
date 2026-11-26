"""#3265.10 (épopée #3265, lot R11 29/09) — LE PLAN, PAS SEULEMENT L'HISTORIQUE D'ENVOI.

`_recent_outreach_for_contact` (#3211) refuse déjà une relance identique quand un
message a été réellement SORTI (`outreach_messages`). Mais `prepare_message_for_contact`
ne consultait pas le PLAN lui-même (`action_plan_items`) : une action déjà OUVERTE
(`todo`) ou déjà FAITE (`done`) pour ce contact sur ce canal n'empêchait rien —
Laura pouvait proposer une seconde relance qui ignorait une action déjà en cours.

#3265.9 (même soirée) a fermé la porte MANUELLE (`createFromPlan`, doublon posé
par n'importe qui dans l'espace) ; ce lot ferme la même porte côté PROACTIF,
symétrique à #3211 mais sur `action_plan_items` plutôt que `outreach_messages`.

Ces tests isolent la nouvelle vérification : `recent_outreach` est toujours
`None` (aucun message sorti), seul `recent_plan_item` varie.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.chat_tools import execute_chat_tool

_CONTACT = {
    "id": "11111111-1111-4111-8111-111111111111",
    "full_name": "Delphine Arnaud",
    "title": "Directrice achats",
    "account_id": "22222222-2222-4222-8222-222222222222",
    "email": "delphine@example.com",
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


async def _run(tool_input: dict, *, recent_plan_item: dict | None) -> dict:
    with (
        patch("app.services.supabase_client.get_supabase", return_value=_sb_that_forbids_writes()),
        patch("app.services.ownership.fetch_owned_contact", new_callable=AsyncMock, return_value=_CONTACT),
        # BEL-SC-235 (#3264.13) — aucun refus « ne me contactez plus » sur ce contact.
        patch("app.services.ownership.fetch_contact_stop", new_callable=AsyncMock, return_value=None),
        patch(
            "app.services.ownership.fetch_recent_outreach_for_contact",
            new_callable=AsyncMock,
            return_value=None,
        ),
        patch(
            "app.services.ownership.fetch_recent_action_plan_item_for_contact",
            new_callable=AsyncMock,
            return_value=recent_plan_item,
        ),
    ):
        return await execute_chat_tool(
            "prepare_message_for_contact",
            {"contact_id": _CONTACT["id"], **tool_input},
            user_id="user-1",
            profile_data=None,
        )


@pytest.mark.asyncio
async def test_3265_10_sans_action_planifiee_la_proposition_passe() -> None:
    out = await _run({"channel": "email", "angle": "renouvellement de contrat"}, recent_plan_item=None)
    assert out["status"] == "pending_confirmation"


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["todo", "done"])
async def test_3265_10_une_action_deja_ouverte_ou_faite_sans_angle_nouveau_est_refusee(status: str) -> None:
    out = await _run(
        {"channel": "email"},
        recent_plan_item={
            "id": "api-1",
            "channel": "email",
            "execution_status": status,
            "reason": None,
            "due_date": "2026-10-01",
        },
    )
    assert "error" in out and "proposal" not in out
    assert "Delphine Arnaud" in out["error"]
    assert "email" in out["error"]


@pytest.mark.asyncio
async def test_3265_10_le_meme_angle_que_la_raison_planifiee_est_une_relance_identique() -> None:
    out = await _run(
        {"channel": "email", "angle": "renouvellement de contrat"},
        recent_plan_item={
            "id": "api-1",
            "channel": "email",
            "execution_status": "todo",
            "reason": "Renouvellement de contrat",
            "due_date": "2026-10-01",
        },
    )
    assert "error" in out and "proposal" not in out


@pytest.mark.asyncio
async def test_3265_10_un_angle_different_est_une_raison_nouvelle_la_relance_passe() -> None:
    out = await _run(
        {"channel": "email", "angle": "nouvel interlocuteur nommé"},
        recent_plan_item={
            "id": "api-1",
            "channel": "email",
            "execution_status": "todo",
            "reason": "renouvellement de contrat",
            "due_date": "2026-10-01",
        },
    )
    assert out["status"] == "pending_confirmation"
    assert out["proposal"]["angle"] == "nouvel interlocuteur nommé"


@pytest.mark.asyncio
async def test_3265_10_changer_de_canal_reste_possible() -> None:
    out = await _run(
        {"channel": "linkedin"},
        recent_plan_item=None,  # la lecture est scopée au canal `linkedin` demandé, pas `email`
    )
    assert out["status"] == "pending_confirmation"
