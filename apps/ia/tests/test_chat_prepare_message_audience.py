"""#3894.3 (lot RAE2, 10/10) — un message à PLUSIEURS contacts, SEULEMENT sur demande explicite.

Décision Louis 10/10/2026 (c74 assoupli) : « je veux du multi contact aussi si
je le demande ». Un message s'adresse à UN contact par défaut ; à plusieurs
uniquement quand l'utilisateur les nomme (« pour Marie et Paul », « pour les 3
décideurs »). Jamais une audience devinée.

Ce que ces tests verrouillent :
  1. l'outil unitaire accepte `contact_ids` + l'attestation `explicit_multi_contact` ;
  2. deux contacts nommés + attestation → UNE proposition `prepare_message_audience`
     avec chaque destinataire nommé ;
  3. SAIT DIRE NON : sans attestation, ou avec un seul contact, jamais d'audience —
     le comportement d'avant (un seul brouillon) reste byte-identique ;
  4. un contact refusé par les garde-fous unitaires (opt-out…) est NOMMÉ, pas tu ;
  5. rien n'est écrit, rien n'est envoyé.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool

_CONTACTS = {
    f"aaaaaaaa-aaaa-4aaa-8aaa-00000000000{n}": {
        "id": f"aaaaaaaa-aaaa-4aaa-8aaa-00000000000{n}",
        "full_name": name,
        "title": "DSI",
        "account_id": "22222222-2222-4222-8222-222222222222",
        "email": f"c{n}@example.com",
    }
    for n, name in enumerate(("Marie Durand", "Paul Martin", "Claire Dubois"), start=1)
}
_IDS = list(_CONTACTS)


def _sb(stopped: set[str] | None = None) -> MagicMock:
    """Double Supabase : toute écriture lève ; `contact_stops` ne renvoie une ligne
    que pour les contacts de `stopped`."""
    sb = MagicMock()

    def _explode(*_a, **_k):
        raise AssertionError("un outil de proposition ne doit JAMAIS écrire")

    table = MagicMock()
    table.insert.side_effect = _explode
    table.update.side_effect = _explode
    table.upsert.side_effect = _explode
    table.delete.side_effect = _explode
    no_row = MagicMock()
    no_row.data = None
    table.select.return_value.eq.return_value.maybe_single.return_value.aexecute = AsyncMock(return_value=no_row)
    sb.table.return_value = table
    return sb


async def _owned(contact_id: str, *_a, **_k):
    return _CONTACTS.get(contact_id)


async def _run(tool_input: dict, *, stopped: set[str] | None = None) -> dict:
    async def _stop(_sb, contact_id):
        return {"reason": "unsubscribed"} if stopped and contact_id in stopped else None

    with (
        patch("app.services.supabase_client.get_supabase", return_value=_sb()),
        patch("app.services.chat_tools._resolve_owned_contact", side_effect=_owned),
        patch("app.services.ownership.fetch_contact_stop", side_effect=_stop),
    ):
        return await execute_chat_tool("prepare_message_for_contact", tool_input, user_id="user-1", profile_data=None)


def test_schema_exposes_the_explicit_multi_contact_door() -> None:
    tool = next(t for t in CHAT_TOOLS if t["name"] == "prepare_message_for_contact")
    props = tool["input_schema"]["properties"]
    assert "contact_ids" in props and "explicit_multi_contact" in props
    # Un contact_id seul reste valide : la porte multi n'est jamais obligatoire.
    assert "contact_ids" not in tool["input_schema"]["required"]
    assert "EXPLICITE" in tool["description"]


@pytest.mark.asyncio
async def test_two_named_contacts_with_attestation_yield_one_audience_proposal() -> None:
    out = await _run({"contact_ids": _IDS[:2], "explicit_multi_contact": True, "channel": "email", "angle": "cloud"})
    assert out["status"] == "pending_confirmation"
    proposal = out["proposal"]
    assert proposal["action"] == "prepare_message_audience"
    assert proposal["explicit_multi_contact"] is True
    assert [r["contact_name"] for r in proposal["recipients"]] == ["Marie Durand", "Paul Martin"]
    assert proposal["channel"] == "email" and proposal["angle"] == "cloud"
    assert proposal["sends_email"] is False and proposal["cost_credits"] == 0


@pytest.mark.asyncio
async def test_without_the_attestation_there_is_never_an_audience() -> None:
    """SAIT DIRE NON — plusieurs identifiants sans pluriel explicite ne font PAS
    une audience : refus net, jamais un élargissement implicite."""
    out = await _run({"contact_ids": _IDS[:2], "channel": "email"})
    assert "error" in out and "proposal" not in out


@pytest.mark.asyncio
async def test_a_single_contact_stays_a_single_draft_even_with_the_attestation() -> None:
    out = await _run({"contact_ids": [_IDS[0]], "explicit_multi_contact": True, "channel": "email"})
    assert out["proposal"]["action"] == "prepare_message"
    assert out["proposal"]["contact_id"] == _IDS[0]


@pytest.mark.asyncio
async def test_the_same_contact_twice_is_not_two_recipients() -> None:
    out = await _run({"contact_ids": [_IDS[0], _IDS[0]], "explicit_multi_contact": True, "channel": "email"})
    assert out["proposal"]["action"] == "prepare_message"


@pytest.mark.asyncio
async def test_the_classic_single_contact_call_is_unchanged() -> None:
    out = await _run({"contact_id": _IDS[0], "channel": "linkedin"})
    assert out["proposal"]["action"] == "prepare_message"
    assert "recipients" not in out["proposal"]


@pytest.mark.asyncio
async def test_a_stopped_contact_is_named_in_skipped_not_silently_dropped() -> None:
    out = await _run(
        {"contact_ids": _IDS, "explicit_multi_contact": True, "channel": "email"},
        stopped={_IDS[1]},
    )
    proposal = out["proposal"]
    assert proposal["action"] == "prepare_message_audience"
    assert [r["contact_name"] for r in proposal["recipients"]] == ["Marie Durand", "Claire Dubois"]
    assert [s["contact_name"] for s in proposal["skipped"]] == ["Paul Martin"]
    assert "Désabonnement" in proposal["skipped"][0]["reason"]


@pytest.mark.asyncio
async def test_when_only_one_contact_survives_it_is_a_single_draft_and_the_other_is_named() -> None:
    out = await _run(
        {"contact_ids": _IDS[:2], "explicit_multi_contact": True, "channel": "email"},
        stopped={_IDS[1]},
    )
    assert out["proposal"]["action"] == "prepare_message"
    assert out["proposal"]["contact_id"] == _IDS[0]
    assert [s["contact_name"] for s in out["skipped"]] == ["Paul Martin"]


@pytest.mark.asyncio
async def test_every_contact_refused_is_an_error_that_names_them() -> None:
    out = await _run(
        {"contact_ids": _IDS[:2], "explicit_multi_contact": True, "channel": "email"},
        stopped={_IDS[0], _IDS[1]},
    )
    assert "proposal" not in out and "Marie Durand" in out["error"] and "Paul Martin" in out["error"]


@pytest.mark.asyncio
async def test_an_oversized_audience_is_refused() -> None:
    ids = [f"bbbbbbbb-bbbb-4bbb-8bbb-{n:012d}" for n in range(11)]
    out = await _run({"contact_ids": ids, "explicit_multi_contact": True, "channel": "email"})
    assert "error" in out and "proposal" not in out
