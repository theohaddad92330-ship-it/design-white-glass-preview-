"""#3229 (recette prod 02/10, Y11) — les contacts lus par un outil sortent TOUJOURS en carte
`contact_list`, jamais en puces à plat ; 5 contacts annoncés = « Voir les 2 autres » à l'écran.

Question exacte à poser en recette dans /chat : « Qui sont les contacts de Société Générale ? »
— attendu : une carte contacts (3 visibles + « Voir les 2 autres »), pas une liste à puces."""

from __future__ import annotations

import pytest

from app.services import chat_orchestrator
from app.services.contact_card_fallback import contact_block_from_tool_output, with_contact_card
from app.services.reply_blocks import split_reply_blocks
from tests.test_chat_orchestrator import _install_client, _patch_env, _resp, _text, _tool_use  # noqa: F401

PEOPLE = [
    {"full_name": f"Personne {i}", "title": f"Responsable {i}", "company_name": "Société Générale"} for i in range(1, 6)
]
OUTPUT = {"contacts": PEOPLE, "total": 7, "truncated": True, "presented_count": 5}


def test_five_contacts_become_a_five_row_card_with_the_total_named_as_a_limit():
    block = contact_block_from_tool_output(OUTPUT)
    assert block is not None and block["type"] == "contact_list"
    assert [i["name"] for i in block["items"]] == [p["full_name"] for p in PEOPLE]
    assert block["items"][0]["role"] == "Responsable 1" and block["items"][0]["company"] == "Société Générale"
    assert any("5" in m and "7" in m for m in block["missing"])


@pytest.mark.parametrize(
    "output",
    [{"error": "x"}, {"contacts": []}, {"contacts": [{"title": "sans nom"}]}, "texte", None],
)
def test_no_card_when_there_is_no_one_to_show(output):
    assert contact_block_from_tool_output(output) is None


def test_the_card_is_appended_and_the_flat_bullets_that_repeat_it_are_dropped():
    block = contact_block_from_tool_output(OUTPUT)
    reply = "Voici les contacts :\n- Personne 1 — Responsable 1\n- Personne 2 — Responsable 2\n\nLe comité est incomplet."
    out = with_contact_card(reply, block)
    kinds = [(s.kind, (s.block or {}).get("type")) for s in split_reply_blocks(out)]
    assert ("block", "contact_list") in kinds
    assert "- Personne 1" not in out and "Le comité est incomplet." in out


def test_a_reply_that_already_carries_a_contact_card_is_left_alone():
    block = contact_block_from_tool_output(OUTPUT)
    once = with_contact_card("Voici.", block)
    assert with_contact_card(once, block) == once
    assert with_contact_card("Voici.", None) == "Voici."


@pytest.mark.asyncio
async def test_replayed_turn_flat_bullets_from_the_model_come_out_as_a_card(monkeypatch):
    _install_client(
        monkeypatch,
        [
            _resp("tool_use", [_tool_use("get_account_contacts", {"account_id": "a1"})]),
            _resp("end_turn", [_text("5 contacts :\n- Personne 1\n- Personne 2\n- Personne 3\n- Personne 4\n- Personne 5")]),
        ],
    )

    from app.services import bellum_api

    async def fake_contacts(user_id, account_id):  # noqa: ANN001
        return {"contacts": PEOPLE, "total": 7, "truncated": True, "account_sector": None}

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "account_contacts", fake_contacts)
    reply, _ = await chat_orchestrator.run_chat_with_tools(
        "sys", "Qui sont les contacts de SG ?", user_id="u1", profile_data=None, user_message="Qui sont les contacts de SG ?"
    )
    blocks = [s.block for s in split_reply_blocks(reply) if s.kind == "block"]
    assert blocks and blocks[0]["type"] == "contact_list" and len(blocks[0]["items"]) == 5
    assert "- Personne 1" not in reply
