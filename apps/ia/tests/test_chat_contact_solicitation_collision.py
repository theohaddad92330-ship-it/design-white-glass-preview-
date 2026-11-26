"""#3264.14 (épopée #3264, lot R11 29/09) — « AUTRES COLLÈGUES ACTIFS », AVANT GÉNÉRATION.

`detectContactSolicitationCollisions` (`@bellum/contracts`, #2325.35) détecte déjà
la collision au niveau des séquences, côté NestJS (`ProjectPipelineService`). Mais
`prepare_message_for_contact` (Python, `apps/ia`) n'avait aucun moyen de
l'interroger avant de préparer un message — `apps/ia` ne peut pas importer
`packages/contracts` et n'avait pas de client vers cet endpoint.

Ce lot expose `POST /internal/copilot/outreach/contact-collision`
(`ProjectPipelineService.contactSolicitationCollisionFor`, réduit à UN contact) et
câble la même refuse-avant-génération que #3264.13 (contact_stops, côté API) :
`bellum_api.contact_solicitation_collision` → `_contact_solicitation_collision` →
refus si un COLLÈGUE a déjà une séquence active sur ce contact.

Contrairement aux portes #3211/#3265.10 (TA propre relance), celle-ci ne s'efface
JAMAIS sur un angle nouveau : la collision porte sur quelqu'un d'AUTRE, qu'une
raison nouvelle de ta part ne résout pas.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.chat_tools import execute_chat_tool

_CONTACT = {
    "id": "11111111-1111-4111-8111-111111111111",
    "full_name": "Karim Belaïd",
    "title": "Directeur des opérations",
    "account_id": "22222222-2222-4222-8222-222222222222",
    "email": "karim@example.com",
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


async def _run(tool_input: dict, *, collision_result: dict | None) -> dict:
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
            return_value=None,
        ),
        patch(
            "app.services.bellum_api.contact_solicitation_collision",
            new_callable=AsyncMock,
            return_value=collision_result,
        ),
    ):
        return await execute_chat_tool(
            "prepare_message_for_contact",
            {"contact_id": _CONTACT["id"], "channel": "email", "angle": "renouvellement de contrat", **tool_input},
            user_id="user-1",
            profile_data=None,
        )


@pytest.mark.asyncio
async def test_3264_14_sans_collision_la_proposition_passe() -> None:
    out = await _run({}, collision_result={"collision": False, "sequenceCount": 0})
    assert out["status"] == "pending_confirmation"


@pytest.mark.asyncio
async def test_3264_14_pont_eteint_ou_en_echec_ne_bloque_jamais() -> None:
    out = await _run({}, collision_result=None)
    assert out["status"] == "pending_confirmation"


@pytest.mark.asyncio
async def test_3264_14_une_collision_refuse_la_preparation() -> None:
    out = await _run({}, collision_result={"collision": True, "sequenceCount": 2})
    assert "error" in out and "proposal" not in out
    assert "Karim Belaïd" in out["error"]


@pytest.mark.asyncio
async def test_3264_14_un_angle_nouveau_ne_leve_pas_le_refus() -> None:
    """Contrairement à #3211/#3265.10 : la collision porte sur un AUTRE
    commercial, qu'une raison nouvelle de TA part ne résout pas."""
    out = await _run({"angle": "information totalement nouvelle"}, collision_result={"collision": True})
    assert "error" in out and "proposal" not in out
