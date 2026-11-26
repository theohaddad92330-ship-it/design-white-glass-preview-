"""BEL-SC-235 (#3264.13) — AVANT GÉNÉRATION : un contact avec un refus
enregistré (`contact_stops`) n'obtient jamais de message préparé, même une
proposition (jamais envoyée) — la génération elle-même est refusée."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from app.services.chat_tools import execute_chat_tool

_CONTACT = {
    "id": "11111111-1111-4111-8111-111111111111",
    "full_name": "Claire Dubois",
    "title": "DSI",
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


async def _prepare_message(*, stop: dict | None) -> dict:
    with (
        patch("app.services.supabase_client.get_supabase", return_value=_sb_that_forbids_writes()),
        patch("app.services.ownership.fetch_owned_contact", new_callable=AsyncMock, return_value=_CONTACT),
        patch("app.services.ownership.fetch_contact_stop", new_callable=AsyncMock, return_value=stop),
    ):
        return await execute_chat_tool(
            "prepare_message_for_contact",
            {"contact_id": _CONTACT["id"], "channel": "email"},
            user_id="user-1",
            profile_data=None,
        )


async def test_stopped_contact_never_gets_a_prepared_message():
    result = await _prepare_message(stop={"reason": "unsubscribed"})
    assert "error" in result
    assert "unsubscribed" in result["error"]
    assert result.get("status") != "pending_confirmation"


async def test_stopped_contact_reason_missing_still_refuses_without_inventing_one():
    result = await _prepare_message(stop={"reason": None})
    assert "error" in result
    assert "non précisée" in result["error"]


async def test_contact_without_a_stop_still_gets_a_proposal():
    result = await _prepare_message(stop=None)
    assert result.get("status") == "pending_confirmation"
    assert result["proposal"]["contact_id"] == _CONTACT["id"]
