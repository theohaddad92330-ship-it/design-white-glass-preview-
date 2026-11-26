"""Recette R15 prod (15/10) — #3894 : « Prépare un message pour Glauco Gomes et Adrien Weber ».

Laura demandait d'abord le canal alors que l'e-mail des deux contacts était connu, puis rendait les
deux brouillons dans UNE bulle. Deux gestes :
  1. canal non précisé + e-mail connu pour TOUS les destinataires → `email` par défaut, sans question ;
  2. une audience dit au modèle que chaque brouillon vit dans SA carte : il ne les recopie pas en texte."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.chat_tools import execute_chat_tool

_A = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001"
_B = "aaaaaaaa-aaaa-4aaa-8aaa-000000000002"


def _contacts(email_b: str | None = "adrien@example.com") -> dict[str, dict]:
    return {
        _A: {"id": _A, "full_name": "Glauco Gomes", "title": "Head of IT", "account_id": "acc-1", "email": "g@example.com"},
        _B: {"id": _B, "full_name": "Adrien Weber", "title": "Director of Analytics", "account_id": "acc-1", "email": email_b},
    }


async def _run(tool_input: dict, contacts: dict[str, dict]) -> dict:
    async def _owned(contact_id: str, *_a, **_k):
        return contacts.get(contact_id)

    async def _no_stop(_sb, _cid):
        return None

    sb = MagicMock()
    no_row = MagicMock()
    no_row.data = None
    sb.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.aexecute = AsyncMock(
        return_value=no_row
    )
    with (
        patch("app.services.supabase_client.get_supabase", return_value=sb),
        patch("app.services.chat_tools._resolve_owned_contact", side_effect=_owned),
        patch("app.services.ownership.fetch_contact_stop", side_effect=_no_stop),
    ):
        return await execute_chat_tool("prepare_message_for_contact", tool_input, user_id="user-1", profile_data=None)


@pytest.mark.asyncio
async def test_3894_channel_defaults_to_email_when_every_recipient_email_is_known() -> None:
    out = await _run({"contact_ids": [_A, _B], "explicit_multi_contact": True}, _contacts())
    assert "error" not in out
    assert out["proposal"]["action"] == "prepare_message_audience"
    assert out["proposal"]["channel"] == "email"


@pytest.mark.asyncio
async def test_3894_single_contact_without_channel_defaults_to_email() -> None:
    out = await _run({"contact_id": _A}, _contacts())
    assert out["proposal"]["channel"] == "email"


@pytest.mark.asyncio
async def test_3894_no_default_when_an_email_is_missing_the_channel_is_still_asked() -> None:
    out = await _run({"contact_ids": [_A, _B], "explicit_multi_contact": True}, _contacts(email_b=None))
    assert "error" in out and "proposal" not in out


@pytest.mark.asyncio
async def test_3894_an_audience_tells_the_model_not_to_copy_the_drafts_into_the_text() -> None:
    out = await _run({"contact_ids": [_A, _B], "explicit_multi_contact": True, "channel": "email"}, _contacts())
    assert "chaque brouillon" in str(out.get("presentation_directive", "")).lower()
