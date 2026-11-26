"""#3395 (V02, recette prod 01/10) — le verdict d'aptitude sort TOUJOURS en carte,
statut traduit, même quand le modèle répond en phrase libre.

Question exacte à poser en recette dans /chat : « Faut-il prospecter Société
Générale maintenant ? » — attendu : une carte verdict (statut en français,
« Pas maintenant » / « À surveiller »…, jamais NO_GO_NOW), raisons étiquetées,
et ce qui n'a pas pu être évalué."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.services import chat_orchestrator
from app.services.reply_blocks import split_reply_blocks
from app.services.verdict_card_fallback import verdict_block_from_tool_output, with_verdict_card
from tests.test_chat_orchestrator import (  # noqa: F401 — fixtures autouse
    _install_client,
    _patch_env,
    _resp,
    _text,
    _tool_use,
)

NO_GO = {
    "status": "success",
    "verdict": "NO_GO_NOW",
    "verdict_label": "coût commercial supérieur à la valeur attendue à court terme",
    "dominant_reasons": [],
    "blocking_factors": [
        {"axis": "adéquation offre / besoin", "evidence": "aucune offre ne recoupe le besoin"},
        {"axis": "accessibilité", "evidence": "aucun contact joignable"},
    ],
    "unknowns": [{"axis": "différenciation", "reason": "aucune mesure n'existe."}],
    "recheck_condition": "À revérifier si un interlocuteur devient joignable.",
}


def test_block_translates_the_status_and_labels_reasons_and_limits():
    block = verdict_block_from_tool_output(NO_GO)
    assert block is not None
    assert "NO_GO_NOW" not in str(block)
    assert block["conclusion"].startswith("Pas maintenant")
    assert block["reasons"][0] == "adéquation offre / besoin : aucune offre ne recoupe le besoin"
    assert block["limits"] == ["différenciation — aucune mesure n'existe."]


@pytest.mark.parametrize(
    "output",
    [
        {"error": "Un identifiant de compte est requis."},
        {"verdict": "INCONNU", "dominant_reasons": [{"axis": "a", "evidence": "b"}]},
        {"verdict": "WATCH", "dominant_reasons": [], "blocking_factors": []},
        "pas un dict",
    ],
)
def test_no_card_when_there_is_nothing_true_to_show(output):
    assert verdict_block_from_tool_output(output) is None


def test_a_card_written_by_the_model_is_never_doubled():
    block = verdict_block_from_tool_output(NO_GO)
    once = with_verdict_card("Phrase libre.", block)
    assert once != "Phrase libre."
    assert with_verdict_card(once, block) == once


@pytest.mark.asyncio
async def test_replayed_turn_free_sentence_gets_a_verdict_card(monkeypatch):
    _install_client(
        monkeypatch,
        [
            _resp("tool_use", [_tool_use("get_account_suitability_verdict", {"account_id": "a-1"})]),
            _resp("end_turn", [_text("Pas maintenant : NO_GO_NOW, ni besoin ni accès.")]),
        ],
    )
    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", AsyncMock(return_value=NO_GO))

    reply, actions = await chat_orchestrator.run_chat_with_tools(
        "sys",
        "Faut-il prospecter Société Générale maintenant ?",
        user_id="u1",
        profile_data=None,
        user_message="Faut-il prospecter Société Générale maintenant ?",
    )

    blocks = [s.block for s in split_reply_blocks(reply) if s.kind == "block"]
    assert [b["type"] for b in blocks] == ["verdict"]
    assert blocks[0]["conclusion"].startswith("Pas maintenant")
    assert all("verdict_block" not in a for a in actions)


@pytest.mark.asyncio
async def test_replayed_turn_carries_the_verdict_status_for_the_reasoning_trace(monkeypatch):
    """#3223.7 (#3198) — le verdict RENDU par l'outil voyage sur l'action du
    tour : de quoi mesurer sur le trafic réel « verdict défavorable » et « NO_GO
    sans alternative », sans relire le texte de la réponse."""
    _install_client(
        monkeypatch,
        [
            _resp("tool_use", [_tool_use("get_account_suitability_verdict", {"account_id": "a-1"})]),
            _resp("end_turn", [_text("Pas maintenant.")]),
        ],
    )
    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", AsyncMock(return_value=NO_GO))
    _, actions = await chat_orchestrator.run_chat_with_tools(
        "sys",
        "Faut-il prospecter Société Générale maintenant ?",
        user_id="u1",
        profile_data=None,
        user_message="Faut-il prospecter Société Générale maintenant ?",
    )
    assert [a.get("account_verdict") for a in actions if a["tool"] == "get_account_suitability_verdict"] == [
        "NO_GO_NOW"
    ]


def test_verdict_status_is_none_for_an_error_or_an_unknown_verdict():
    from app.services.verdict_card_fallback import verdict_status_of

    assert verdict_status_of(NO_GO) == "NO_GO_NOW"
    assert verdict_status_of({"error": "x", "verdict": "NO_GO_NOW"}) is None
    assert verdict_status_of({"verdict": "BANANE"}) is None
    assert verdict_status_of("pas un dict") is None


@pytest.mark.asyncio
async def test_replayed_turn_without_the_verdict_tool_gets_no_card(monkeypatch):
    _install_client(monkeypatch, [_resp("end_turn", [_text("Bonjour.")])])
    reply, _ = await chat_orchestrator.run_chat_with_tools("sys", "Salut", user_id="u1", profile_data=None)
    assert reply == "Bonjour."


# ── #3395 (Y1 01/10) : statut toujours traduit sur la carte, prose et carte ne se répètent pas ──
#
# Question exacte à poser en recette dans /chat : « Faut-il prospecter Société
# Générale maintenant ? » — attendu : UNE carte Verdict dont la conclusion
# commence par le statut traduit (« Pas maintenant »), et une prose qui ne
# redit pas les raisons / la route déjà dans la carte.

MODEL_CARD_NO_STATUS = {
    "type": "verdict",
    "conclusion": "Pas la priorité aujourd'hui sur ce compte",
    "reasons": ["adéquation offre / besoin : aucune offre ne recoupe le besoin"],
    "route": "Attendre la feuille de route 2026-2029 avant toute approche directe",
}


def _fenced(block: dict) -> str:
    import json

    return f"```bellum-block\n{json.dumps(block, ensure_ascii=False)}\n```"


def test_a_model_card_without_the_translated_status_gets_it_prefixed():
    block = verdict_block_from_tool_output(NO_GO)
    reply = with_verdict_card(f"Voici mon avis.\n\n{_fenced(MODEL_CARD_NO_STATUS)}", block)
    cards = [s.block for s in split_reply_blocks(reply) if s.kind == "block"]
    assert len(cards) == 1
    assert cards[0]["conclusion"].startswith("Pas maintenant — ")
    assert "NO_GO_NOW" not in reply


def test_a_model_card_that_already_says_the_status_is_left_alone():
    block = verdict_block_from_tool_output(NO_GO)
    card = {**MODEL_CARD_NO_STATUS, "conclusion": "Pas maintenant — ni besoin ni accès"}
    reply = f"Avis.\n\n{_fenced(card)}"
    assert with_verdict_card(reply, block) == reply


def test_prose_that_repeats_the_card_is_dropped_but_other_prose_stays():
    block = verdict_block_from_tool_output(NO_GO)
    prose = (
        "Mon avis en deux mots.\n"
        "- Attendre la feuille de route 2026-2029 avant toute approche directe sur ce compte.\n"
        "Dis-moi si tu veux que je regarde un autre compte."
    )
    reply = with_verdict_card(f"{prose}\n\n{_fenced(MODEL_CARD_NO_STATUS)}", block)
    texts = " ".join(s.text for s in split_reply_blocks(reply) if s.kind == "text")
    assert "feuille de route" not in texts
    assert "Mon avis en deux mots." in texts
    assert "un autre compte" in texts
    assert sum(reply.count("feuille de route 2026-2029") for _ in [0]) == 1


def test_prose_without_a_repeated_line_is_byte_identical():
    block = verdict_block_from_tool_output(NO_GO)
    reply = f"Une phrase propre à ce tour.\n\n{_fenced({**MODEL_CARD_NO_STATUS, 'conclusion': 'Pas maintenant — ok'})}"
    assert with_verdict_card(reply, block) == reply


# ── #3763.1 (recette prod 08/10, 8c42a4032c) : la carte « Priorités du portefeuille »
# ne doit pas redire le « Pourquoi » déjà dans la carte verdict ──

RANKING_WITH_DUPLICATE_WHY = {
    "type": "account_ranking",
    "title": "Priorités du portefeuille",
    "axes": ["Priorité"],
    "items": [
        {
            "name": "Société Générale",
            "why": [
                "adéquation offre / besoin : aucune offre ne recoupe le besoin",
                "Compte suivi depuis le T2.",
            ],
        },
        {"name": "Autre Compte", "why": ["Signal de recrutement récent détecté."]},
    ],
}


def test_x_3763_1_portfolio_priorities_card_drops_a_why_line_repeated_by_the_verdict():
    block = verdict_block_from_tool_output(NO_GO)
    reply = with_verdict_card(
        f"Avis.\n\n{_fenced(MODEL_CARD_NO_STATUS)}\n\n{_fenced(RANKING_WITH_DUPLICATE_WHY)}", block
    )
    cards = [s.block for s in split_reply_blocks(reply) if s.kind == "block"]
    ranking = next(c for c in cards if c["type"] == "account_ranking")
    assert ranking["items"][0]["why"] == ["Compte suivi depuis le T2."]
    assert ranking["items"][1]["why"] == ["Signal de recrutement récent détecté."]


def test_x_3763_1_a_single_duplicate_why_line_is_kept_a_card_never_ships_empty():
    block = verdict_block_from_tool_output(NO_GO)
    ranking = {
        **RANKING_WITH_DUPLICATE_WHY,
        "items": [{"name": "Société Générale", "why": RANKING_WITH_DUPLICATE_WHY["items"][0]["why"][:1]}],
    }
    reply = with_verdict_card(f"Avis.\n\n{_fenced(MODEL_CARD_NO_STATUS)}\n\n{_fenced(ranking)}", block)
    cards = [s.block for s in split_reply_blocks(reply) if s.kind == "block"]
    found = next(c for c in cards if c["type"] == "account_ranking")
    assert found["items"][0]["why"] == ranking["items"][0]["why"]


def test_x_3763_1_a_ranking_card_without_repeated_why_is_untouched():
    block = verdict_block_from_tool_output(NO_GO)
    card = {**MODEL_CARD_NO_STATUS, "conclusion": "Pas maintenant — ni besoin ni accès"}
    ranking = {**RANKING_WITH_DUPLICATE_WHY, "items": [{"name": "Autre Compte", "why": ["Signal neuf."]}]}
    reply = f"Avis.\n\n{_fenced(card)}\n\n{_fenced(ranking)}"
    assert with_verdict_card(reply, block) == reply


def test_x32_3513_an_account_not_in_the_workspace_gets_a_named_not_evaluable_card():
    """#3513 (recette 02/10) — « Faut-il aller chez LVMH ? » rendait du texte sans carte
    quand le compte n'a aucune analyse : le « non évaluable » se NOMME, jamais un verdict deviné."""
    block = verdict_block_from_tool_output({"error": "Compte introuvable dans votre portefeuille."})
    assert block is not None and block["type"] == "verdict"
    assert block["conclusion"].startswith("Non évaluable")
    assert "NOT_EVALUABLE" not in str(block) and "NO_GO" not in str(block)
    assert block["reasons"] and block["next_action"]["label"]
