"""#4287.14 / #4287.11 (recette 21/10, N2) — « relance les 2 derniers contacts » prépare 2 brouillons.

Laura retrouvait les deux personnes puis répondait « aucune relance n'a encore été préparée » : l'outil
refusait (a) la pluriel sans attestation ``explicit_multi_contact`` et (b) une « relance identique » à un
message déjà sorti sans réponse — alors que RELANCER est précisément la demande. Quand le message de la
personne demande la relance des N derniers contacts, l'audience est NOMMÉE par le tri et la relance est
la raison. Rien n'est envoyé : chaque brouillon est une carte à valider.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.chat_requested_mode import set_turn_thread
from app.services.chat_tools import execute_chat_tool

_IDS = [f"bbbbbbbb-bbbb-4bbb-8bbb-00000000000{n}" for n in (1, 2)]
_CONTACTS = {
    _IDS[0]: {
        "id": _IDS[0],
        "full_name": "Marie Durand",
        "title": "DSI",
        "account_id": "a" * 8 + "-aaaa-4aaa-8aaa-" + "a" * 12,
        "email": "m@example.com",
    },
    _IDS[1]: {
        "id": _IDS[1],
        "full_name": "Paul Martin",
        "title": "DAF",
        "account_id": "a" * 8 + "-aaaa-4aaa-8aaa-" + "a" * 12,
        "email": "p@example.com",
    },
}
_PREVIOUS = {"user_id": "user-1", "reason": "Premier contact", "created_at": "2026-10-10"}


def _sb() -> MagicMock:
    sb = MagicMock()

    def _explode(*_a, **_k):
        raise AssertionError("un outil de proposition ne doit JAMAIS écrire")

    table = MagicMock()
    for method in ("insert", "update", "upsert", "delete"):
        getattr(table, method).side_effect = _explode
    sb.table.return_value = table
    return sb


async def _owned(contact_id: str, *_a, **_k):
    return _CONTACTS.get(contact_id)


async def _run(message: str, tool_input: dict, *, previous=None) -> dict:
    set_turn_thread(message, [])

    async def _outreach(contact_id, *_a, **_k):
        return previous(contact_id) if callable(previous) else previous

    with (
        patch("app.services.supabase_client.get_supabase", return_value=_sb()),
        patch("app.services.chat_tools._resolve_owned_contact", side_effect=_owned),
        patch("app.services.ownership.fetch_contact_stop", AsyncMock(return_value=None)),
        patch("app.services.chat_tools._recent_outreach_for_contact", side_effect=_outreach),
        patch("app.services.chat_tools._recent_action_plan_item_for_contact", AsyncMock(return_value=None)),
        patch("app.services.chat_tools._contact_solicitation_collision", AsyncMock(return_value=False)),
    ):
        return await execute_chat_tool("prepare_message_for_contact", tool_input, user_id="user-1", profile_data=None)


@pytest.mark.asyncio
async def test_relance_des_2_derniers_contacts_prepare_2_brouillons_sans_attestation_ni_angle() -> None:
    out = await _run("relance les 2 derniers contacts", {"contact_ids": _IDS}, previous=_PREVIOUS)
    assert "error" not in out, out
    proposal = out["proposal"]
    assert proposal["action"] == "prepare_message_audience"
    assert [r["contact_name"] for r in proposal["recipients"]] == ["Marie Durand", "Paul Martin"]
    assert proposal["channel"] == "email"  # l'adresse est connue : aucune question
    assert proposal["sends_email"] is False and proposal["cost_credits"] == 0
    assert out["status"] == "pending_confirmation"  # une carte en attente, jamais un envoi


@pytest.mark.asyncio
async def test_non_sans_demande_de_relance_le_pluriel_reste_refuse() -> None:
    out = await _run("écris à des contacts", {"contact_ids": _IDS}, previous=None)
    assert "error" in out and "proposal" not in out


@pytest.mark.asyncio
async def test_non_sans_demande_de_relance_la_relance_identique_reste_refusee() -> None:
    out = await _run("prépare un message pour Marie", {"contact_id": _IDS[0], "channel": "email"}, previous=_PREVIOUS)
    assert "error" in out and "identique" in out["error"]


@pytest.mark.asyncio
async def test_non_un_message_deja_envoye_par_un_collegue_n_est_jamais_releve() -> None:
    colleague = {**_PREVIOUS, "user_id": "autre-collegue"}

    def _previous(contact_id: str):
        return colleague if contact_id == _IDS[1] else _PREVIOUS

    out = await _run("relance les 2 derniers contacts", {"contact_ids": _IDS}, previous=_previous)
    # un seul survivant : brouillon unitaire, l'autre est NOMMÉ comme écarté
    assert out["proposal"]["action"] == "prepare_message"
    assert out["proposal"]["contact_name"] == "Marie Durand"
    assert [s["contact_name"] for s in out["skipped"]] == ["Paul Martin"]
