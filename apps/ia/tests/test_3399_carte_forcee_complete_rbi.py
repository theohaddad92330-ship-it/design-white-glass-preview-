"""#3399 / #3245 (lot RBI, recette G6 prod 03f2b2e83a, 11/10) — « Quel compte attaquer en premier ? » :
l'outil est bien forcé (RAW) mais la carte rendue s'intitule « Compte à vérifier en premier » avec
2 lignes ; Accor et Airbus absents, 0 « Pari long déclaré. ». « Où investir ? » rend 20 lignes.

CAUSE : la porte de forme (`known_shape_gate.apply_known_shape_gate`) ne double jamais une carte
`account_ranking` écrite par le modèle (`present & satisfied`). Le modèle, FORCÉ à lire tout le
portefeuille, répond à la question « lequel en premier » par SA carte de 2 lignes — et la porte la
garde telle quelle. Le test rejoue le TOUR entier (outil forcé → pont → carte du modèle → chaîne de
`chat.py`)."""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from app.services import chat_orchestrator
from app.services.chat_requested_mode import set_turn_thread

TOOL = "get_portfolio_priorities"
QUESTION = "Quel compte attaquer en premier ?"


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


def _row(n: int, name: str, **extra):
    return {"id": f"{n:08d}-1111-4111-8111-111111111111", "companyName": name, "reason": f"Signal {n}.", **extra}


def _bridge() -> dict:
    """22 comptes comme la prod : 2 « à vérifier » en tête, Accor et Airbus loin dans « à surveiller »."""
    watch = [_row(i, f"COMPTE {i}") for i in range(3, 20)]
    watch += [_row(30, "ACCOR", betHorizon="long"), _row(31, "AIRBUS", betHorizon="long")]
    return {
        "now": [],
        "toVerify": [_row(1, "RECETTE 10-10"), _row(2, "QUIETALIS")],
        "toWatch": watch,
        "notNow": [],
    }


def _blocks(reply: str) -> list[dict]:
    return [json.loads(part.split("```")[0]) for part in reply.split("```bellum-block")[1:]]


def _model_card_two_rows() -> str:
    card = {
        "type": "account_ranking",
        "title": "Compte à vérifier en premier",
        "axes": ["Priorité"],
        "items": [
            {"name": "RECETTE 10-10", "level": "to_qualify", "why": ["Signal 1."]},
            {"name": "QUIETALIS", "level": "to_qualify", "why": ["Signal 2."]},
        ],
    }
    return "Commence par là.\n\n```bellum-block\n" + json.dumps(card, ensure_ascii=False) + "\n```"


async def _run_turn(monkeypatch, model_text: str) -> list[dict]:
    set_turn_thread(QUESTION, [])
    _install(
        monkeypatch,
        [
            SimpleNamespace(stop_reason="tool_use", content=[SimpleNamespace(type="tool_use", name=TOOL, input={}, id="t1")]),
            SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text=model_text)]),
        ],
    )

    async def _bridge_call(_user_id):
        return _bridge()

    monkeypatch.setattr("app.services.bellum_api.portfolio_priorities", _bridge_call)
    monkeypatch.setattr("app.services.bellum_api.is_configured", lambda: True)

    reply, _actions = await chat_orchestrator.run_chat_with_tools(
        "sys", QUESTION, user_id="u1", profile_data=None, user_message=QUESTION
    )
    from app.routers import chat as chat_router

    reply = chat_router.normalize_reply_blocks(chat_router.redact_secrets(reply))
    reply = chat_router.strip_status_preamble(reply, user_message=QUESTION, failed_tools=frozenset())
    reply = chat_router.strip_slice_preamble(reply)
    return [b for b in _blocks(reply) if b.get("type") == "account_ranking"]


@pytest.mark.asyncio
async def test_rbi_3399_a_truncated_model_card_is_replaced_by_the_full_portfolio_card(monkeypatch):
    cards = await _run_turn(monkeypatch, _model_card_two_rows())

    assert len(cards) == 1
    items = {item["name"]: item for item in cards[0]["items"]}
    assert len(items) == 20  # même plafond que « Où investir ? »
    assert "ACCOR" in items and "AIRBUS" in items
    assert "Pari long déclaré." in items["ACCOR"]["why"]
    assert "Pari long déclaré." in items["AIRBUS"]["why"]
    assert cards[0]["title"] != "Compte à vérifier en premier"


@pytest.mark.asyncio
async def test_rbi_3399_no_model_card_still_poses_the_tool_card(monkeypatch):
    # Le modèle n'écrit AUCUNE carte : la porte pose la carte de l'outil (inchangé).
    cards = await _run_turn(monkeypatch, "Commence par RECETTE 10-10.")

    assert len(cards) == 1
    assert {"ACCOR", "AIRBUS"} <= {item["name"] for item in cards[0]["items"]}
