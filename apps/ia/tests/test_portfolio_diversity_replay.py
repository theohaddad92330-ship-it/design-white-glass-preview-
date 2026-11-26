"""#3245 (#3209.6) — REJEU du tour Laura : « où investir mon temps cette semaine ? »
→ `get_portfolio_priorities` est appelé → `diversityNotes` (profil de pari
DÉCLARÉ, calculé côté NestJS) arrive intact sous les yeux du modèle → sa réponse
nomme le déséquilibre. Aucune logique ici : la règle vit dans `derivePortfolioPriorities`."""

from __future__ import annotations

import asyncio
import json

from app.services import bellum_api, chat_orchestrator
from tests.test_unrouted_intent import USER, _resp, _text, _tool_use, fake_model  # noqa: F401

NOTE = {
    "code": "only_long_bets",
    "message": "Tous les comptes « maintenant » sont des paris longs : aucun ne peut conclure à court terme.",
}


def test_the_turn_calls_the_tool_and_the_model_sees_the_diversity_notes(fake_model, monkeypatch) -> None:
    async def portfolio(_user_id: str) -> dict:
        return {
            "now": [],
            "toVerify": [],
            "toWatch": [],
            "notNow": [],
            "capacityCap": 8,
            "emptyBuckets": [],
            "diversityNotes": [NOTE],
        }

    monkeypatch.setattr(bellum_api, "portfolio_priorities", portfolio)
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    messages = fake_model(
        [
            _resp("tool_use", [_tool_use("get_portfolio_priorities", {}, "t1")]),
            _resp("end_turn", [_text("Attention : tous vos comptes « maintenant » sont des paris longs.")]),
        ]
    )

    async def emit(_event: dict) -> None:
        return None

    reply, _ = asyncio.run(
        chat_orchestrator.run_chat_with_tools(
            "system",
            "Où investir mon temps cette semaine ?",
            user_id=USER,
            profile_data={"esn_name": "Skaizen"},
            emit=emit,
        )
    )

    assert len(messages.calls) == 2
    tool_result = json.dumps(messages.calls[1]["messages"][-1], ensure_ascii=False, default=str)
    assert "only_long_bets" in tool_result, tool_result
    assert "paris longs" in reply


def test_the_advisor_prompt_tells_laura_to_say_the_notes_and_never_to_guess() -> None:
    from app.prompts import bellum_advisor

    source = json.dumps(vars(bellum_advisor), default=str, ensure_ascii=False)
    assert "diversityNotes" in source
    assert "ne se suppose pas" in source
