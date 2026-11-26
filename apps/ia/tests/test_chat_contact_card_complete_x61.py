"""#3229 (recette prod 02/10, Y14) — « Qui sont les contacts de Société Générale ? » : la carte écrite par
le modèle ne portait que 3 des 5 contacts lus ; « Voir les 2 autres » était remplacé par la phrase
« Veux-tu que je déroule les 2 contacts… ». Désormais la carte du modèle est COMPLÉTÉE des contacts que
l'outil a lus (jamais inventés), l'écran rend le bouton, et la phrase qui le remplaçait est retirée.

Question exacte à poser en recette (/chat, espace entier) : « Qui sont les contacts de Société Générale ? »
→ une carte « Premiers contacts de Société Générale », 3 lignes, « 5 contacts » au-dessus et le BOUTON
« Voir les 2 autres » (pas une phrase).
"""

from __future__ import annotations

import json

import pytest

from app.services import bellum_api, chat_orchestrator
from app.services.contact_card_fallback import contact_block_from_tool_output, with_contact_card
from app.services.reply_blocks import REPLY_BLOCK_FENCE, split_reply_blocks
from tests.test_chat_orchestrator import _install_client, _patch_env, _resp, _text, _tool_use  # noqa: F401

PEOPLE = [{"full_name": f"Personne {i}", "title": f"Responsable {i}", "company_name": "SG"} for i in range(1, 6)]


def _fence(block: dict) -> str:
    return f"```{REPLY_BLOCK_FENCE}\n{json.dumps(block, ensure_ascii=False)}\n```"


def _three_row_card() -> dict:
    return {
        "type": "contact_list",
        "title": "Premiers contacts de Société Générale",
        "items": [{"name": f"Personne {i}", "role": f"Responsable {i}", "company": "SG"} for i in range(1, 4)],
    }


def test_a_model_card_with_fewer_rows_than_read_is_completed_and_the_unroll_question_dropped():
    reply = (
        "Voici les 5 contacts de Société Générale.\n\n"
        + _fence(_three_row_card())
        + "\n\nVeux-tu que je déroule les 2 contacts restants ?"
    )
    out = with_contact_card(reply, contact_block_from_tool_output({"contacts": PEOPLE}))

    blocks = [s.block for s in split_reply_blocks(out) if s.kind == "block"]
    assert len(blocks) == 1 and len(blocks[0]["items"]) == 5
    assert blocks[0]["title"] == "Premiers contacts de Société Générale"
    assert blocks[0]["items"][3]["name"] == "Personne 4"
    assert "déroule" not in out and "Voici les 5 contacts" in out


def test_a_complete_card_is_left_byte_identical():
    full = _three_row_card()
    full["items"] = [{"name": p["full_name"]} for p in PEOPLE]
    reply = "Voici.\n\n" + _fence(full)
    assert with_contact_card(reply, contact_block_from_tool_output({"contacts": PEOPLE})) == reply


def test_a_contact_the_tool_never_read_is_never_added():
    card = _three_row_card()
    card["items"].append({"name": "Inventé Pas Lu"})
    out = with_contact_card(_fence(card), contact_block_from_tool_output({"contacts": PEOPLE[:3]}))
    names = [i["name"] for s in split_reply_blocks(out) if s.block for i in s.block["items"]]
    assert "Inventé Pas Lu" in names  # on ne retire pas ce que le modèle a écrit…
    assert len(names) == 4  # …mais on n'ajoute rien que l'outil n'a pas rendu


@pytest.mark.asyncio
async def test_the_full_turn_renders_five_rows_so_the_button_appears(monkeypatch):
    reply_model = "Voici 5 contacts.\n\n" + _fence(_three_row_card()) + "\n\nVeux-tu que je déroule les 2 contacts restants ?"
    _install_client(
        monkeypatch,
        [
            _resp("tool_use", [_tool_use("get_account_contacts", {"account_id": "a1"})]),
            _resp("end_turn", [_text(reply_model)]),
        ],
    )

    async def fake_contacts(user_id, account_id):  # noqa: ANN001
        return {"contacts": PEOPLE, "total": 5, "truncated": False, "account_sector": None}

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "account_contacts", fake_contacts)
    q = "Qui sont les contacts de Société Générale ?"
    reply, _ = await chat_orchestrator.run_chat_with_tools("sys", q, user_id="u1", profile_data=None, user_message=q)

    block = next(s.block for s in split_reply_blocks(reply) if s.kind == "block")
    assert len(block["items"]) == 5
    assert "déroule" not in reply
