"""#3399 / #3245 (lot RAT, recette NF 10/10, prod b5c1ee1480) — « Quel compte attaquer en premier ? » :
prose sur Société Générale, 0 carte, 0 « Interlocuteur ». Journal IA 19:44:24 (cid f45bfbc8) :
`get_portfolio_priorities` APPELÉ, puis vérificateur REPAIR (reponse_trop_longue). Le test RAN
appelait `shape_read_from_tool` directement ; celui-ci rejoue le TOUR (`run_chat_with_tools`) avec
la réponse du pont telle que la rend NestJS."""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from app.services import chat_orchestrator
from app.services.chat_requested_mode import set_turn_thread

TOOL = "get_portfolio_priorities"


class _Throttle:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_a):
        return False


class _Stream:
    def __init__(self, response):
        self._response = response

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc):
        return False

    async def __aiter__(self):
        for block in self._response.content:
            if block.type == "text":
                yield SimpleNamespace(type="text", text=block.text)

    async def get_final_message(self):
        return self._response


class _Messages:
    def __init__(self, responses):
        self._responses = list(responses)

    def stream(self, **_kwargs):
        return _Stream(self._responses.pop(0))


def _install(monkeypatch, responses):
    fake = SimpleNamespace(messages=_Messages(responses))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _p: _Throttle())
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)


def _row(i: str, name: str, **extra):
    return {"id": i, "companyName": name, "reason": "Signal frais.", "headquarters": "Paris", **extra}


_BRIDGE = {
    "now": [
        _row(
            "11111111-1111-4111-8111-111111111111",
            "SOCIETE GENERALE",
            interlocutor={"name": "Jeanne Roux", "role": "DSI", "scope": "Groupe"},
        )
    ],
    "toVerify": [],
    "toWatch": [
        _row("22222222-2222-4222-8222-222222222222", "ACCOR", betHorizon="long", interlocutor=None),
        _row("33333333-3333-4333-8333-333333333333", "AIRBUS", betHorizon="long", interlocutor=None),
    ],
    "notNow": [],
}


def _blocks(reply: str) -> list[dict]:
    out = []
    for part in reply.split("```bellum-block")[1:]:
        out.append(json.loads(part.split("```")[0]))
    return out


_MODEL_CARDS = {
    "prose": "Commence par Société Générale : signal frais.",
    # La carte écrite par le modèle, sans `axes` (champ requis) : invalide, retirée avant l'écran.
    "invalid_model_card": (
        "Commence par Société Générale.\n\n```bellum-block\n"
        + json.dumps(
            {"type": "account_ranking", "items": [{"name": "SOCIETE GENERALE", "why": ["Signal frais."]}]},
            ensure_ascii=False,
        )
        + "\n```"
    ),
}


@pytest.mark.asyncio
@pytest.mark.parametrize("model_text", list(_MODEL_CARDS))
async def test_rat_3399_the_priorities_turn_poses_the_card_with_interlocutor_and_long_bet(monkeypatch, model_text):
    set_turn_thread("Quel compte attaquer en premier ?", [])
    _install(
        monkeypatch,
        [
            SimpleNamespace(
                stop_reason="tool_use",
                content=[SimpleNamespace(type="tool_use", name=TOOL, input={}, id="t1")],
            ),
            SimpleNamespace(
                stop_reason="end_turn",
                content=[SimpleNamespace(type="text", text=_MODEL_CARDS[model_text])],
            ),
        ],
    )

    async def _bridge(_user_id):
        return dict(_BRIDGE)

    monkeypatch.setattr("app.services.bellum_api.portfolio_priorities", _bridge)
    monkeypatch.setattr("app.services.bellum_api.is_configured", lambda: True)

    reply, _actions = await chat_orchestrator.run_chat_with_tools(
        "sys",
        "Quel compte attaquer en premier ?",
        user_id="u1",
        profile_data=None,
        user_message="Quel compte attaquer en premier ?",
    )

    # La MÊME chaîne que `_run_chat_turn` (routers/chat.py) applique avant l'écran.
    from app.routers import chat as chat_router

    reply = chat_router.normalize_reply_blocks(chat_router.redact_secrets(reply))
    reply = chat_router.strip_status_preamble(reply, user_message="Quel compte attaquer en premier ?", failed_tools=frozenset())
    reply = chat_router.strip_slice_preamble(reply)
    reply = chat_router.strip_unnamed_account_closing(reply, account_named=True)

    cards = [b for b in _blocks(reply) if b.get("type") == "account_ranking"]
    assert cards, reply
    whys = {item["name"]: item["why"] for item in cards[0]["items"]}
    assert "Interlocuteur : Jeanne Roux, DSI (Groupe)." in whys["SOCIETE GENERALE"]
    assert "Pari long déclaré." in whys["ACCOR"]
    assert "Pari long déclaré." in whys["AIRBUS"]
