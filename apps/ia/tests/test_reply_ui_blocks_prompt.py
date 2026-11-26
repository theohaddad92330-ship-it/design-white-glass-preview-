"""#3767 (BEL-LAU-1012) — Laura raisonne en BLOCS D'INTERFACE, pas en « je vais écrire une réponse ».

Trois demandes du corps de l'issue, une garde chacune :
  #3767.1 le prompt dit le rendu structuré — les six questions que Laura se pose
          avant d'écrire (type, blocs, visible tout de suite, dépliable, réserves,
          action finale) ;
  #3767.2 il demande explicitement sept choses (titre net, résumé décisionnel,
          blocs séparés, cartes homogènes, formulations courtes par carte,
          réserves explicites, prochaine action concrète) ;
  #3767.3 il interdit cinq défauts (répétition, puce pauvre, pavé, formulation
          vague, promesse non prouvée).

Et le tour est rejoué : une demande arrive sur `/chat/message`, le modèle est
appelé, et la consigne est dans le prompt système qu'il reçoit.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.models.reply_blocks import mentions_probability
from app.prompts.bellum_advisor import build_system_prompt
from app.prompts.reply_ui_blocks import (
    BLOCK_REPLY_UI_BLOCKS,
    UI_BLOCK_FORBIDDEN,
    UI_BLOCK_QUESTIONS,
    UI_BLOCK_REQUIREMENTS,
)
from app.services.claude_service import CACHE_SEGMENT_BREAK


def _invariant_segment() -> str:
    return build_system_prompt({}, {}, "", "").split(CACHE_SEGMENT_BREAK)[0]


def test_la_consigne_vit_dans_le_segment_invariant_du_prompt() -> None:
    assert BLOCK_REPLY_UI_BLOCKS in _invariant_segment()
    assert BLOCK_REPLY_UI_BLOCKS in build_system_prompt({}, {}, "", "", "")


def test_3767_1_les_six_questions_sont_posees_avant_d_ecrire() -> None:
    assert len(UI_BLOCK_QUESTIONS) == 6
    for question in UI_BLOCK_QUESTIONS:
        assert question in BLOCK_REPLY_UI_BLOCKS
    assert "Tu ne te demandes pas « comment écrire une réponse »" in BLOCK_REPLY_UI_BLOCKS


def test_3767_2_les_sept_exigences_sont_demandees() -> None:
    assert len(UI_BLOCK_REQUIREMENTS) == 7
    for requirement in UI_BLOCK_REQUIREMENTS:
        assert requirement in BLOCK_REPLY_UI_BLOCKS


def test_3767_3_les_cinq_defauts_sont_interdits() -> None:
    assert len(UI_BLOCK_FORBIDDEN) == 5
    for forbidden in UI_BLOCK_FORBIDDEN:
        assert forbidden in BLOCK_REPLY_UI_BLOCKS
    assert "INTERDIT" in BLOCK_REPLY_UI_BLOCKS


def test_elle_ne_licencie_ni_probabilite_ni_zero_ni_fournisseur() -> None:
    # Le mot n'apparaît que dans son interdit : « aucune probabilité », rien d'autre.
    assert "aucune probabilité" in BLOCK_REPLY_UI_BLOCKS
    assert not mentions_probability(BLOCK_REPLY_UI_BLOCKS.replace("aucune probabilité", ""))
    lowered = BLOCK_REPLY_UI_BLOCKS.lower()
    assert "non mesuré" in lowered
    assert "jamais « 0 »" in BLOCK_REPLY_UI_BLOCKS
    assert "apollo" not in lowered and "pappers" not in lowered and "firecrawl" not in lowered


def test_elle_ne_double_pas_le_format_des_questions_simples() -> None:
    """Une question simple reste une à quatre phrases : la consigne le redit."""
    assert "question simple" in BLOCK_REPLY_UI_BLOCKS.lower()
    assert "sans titre" in BLOCK_REPLY_UI_BLOCKS


@pytest.mark.parametrize("message", ["Priorise mes comptes de la semaine", "Prépare-moi le rendez-vous Thales"])
def test_tour_rejoue_la_consigne_atteint_le_modele(client: TestClient, monkeypatch, message: str) -> None:
    monkeypatch.setenv("CHAT_TOOLS_DISABLED", "true")
    call = AsyncMock(return_value=("Réponse.", None))
    with (
        patch("app.routers.chat.call_claude", call),
        patch("app.routers.chat.conversation_service.save_turn", AsyncMock()),
    ):
        res = client.post("/chat/message", json={"message": message, "user_id": "u1"})
    events = [
        json.loads(chunk.strip()[len("data:") :].strip())
        for chunk in res.text.strip().split("\n\n")
        if chunk.strip().startswith("data:")
    ]
    assert events[-1]["success"] is True
    assert BLOCK_REPLY_UI_BLOCKS in call.await_args.args[0]
