"""#3399 / #3245 (lot F3399, recettes prod 11/10 18h et 21h) — « Quel compte attaquer en premier ? » a échoué deux
fois APRÈS le correctif RBI : 1 ligne (Doctolib), puis « Aucun compte classé à travailler maintenant »
(18 à vérifier, 56 à surveiller), Accor et Airbus absents, 0 « Pari long déclaré. ».

CAUSE : `known_shape_gate._with_priorities_card_completed` ne remplace la carte du modèle que si ses comptes sont
TOUS dans la carte de l'outil (`named < real`). Or cette carte est PLAFONNÉE à 20 lignes (`_RANKING_MAX`) sur un
portefeuille de 74 : un compte que le modèle choisit au-delà du plafond (Doctolib) sort de `real`, la carte
du modèle n'est plus un sous-ensemble, et la porte la GARDE telle quelle — Accor et Airbus (paris longs déclarés)
n'y sont jamais. Le test rejoue le tour entier avec le portefeuille de la prod (0 maintenant, 18 à vérifier, 56 à
surveiller)."""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from app.services import chat_orchestrator
from app.services.chat_requested_mode import set_turn_thread

from tests.test_3399_carte_forcee_complete_rbi import TOOL, _install, _row

QUESTION = "Quel compte attaquer en premier ?"


def _bridge() -> dict:
    """74 comptes comme la prod : 0 maintenant, 18 à vérifier, 56 à surveiller ; Doctolib au 40e rang du
    portefeuille (hors du plafond de 20 lignes), Accor et Airbus déclarés « Pari long » loin derrière."""
    verify = [_row(i, f"VERIFIER {i}") for i in range(1, 19)]
    watch = [_row(100 + i, f"SURVEILLER {i}") for i in range(1, 55)]
    watch.insert(21, _row(200, "DOCTOLIB"))
    watch += [_row(300, "ACCOR", betHorizon="long"), _row(301, "AIRBUS", betHorizon="long")]
    return {"now": [], "toVerify": verify, "toWatch": watch, "notNow": []}


def _blocks(reply: str) -> list[dict]:
    return [json.loads(part.split("```")[0]) for part in reply.split("```bellum-block")[1:]]


def _card(*names: str) -> str:
    card = {
        "type": "account_ranking",
        "title": "Compte à attaquer en premier",
        "axes": ["Priorité"],
        "items": [{"name": n, "level": "to_watch", "why": [f"Raison {n}."]} for n in names],
    }
    return "```bellum-block\n" + json.dumps(card, ensure_ascii=False) + "\n```"


async def _run_turn(monkeypatch, model_text: str) -> tuple[str, list[dict]]:
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
    return reply, [b for b in _blocks(reply) if b.get("type") == "account_ranking"]


@pytest.mark.asyncio
async def test_a_model_pick_beyond_the_cap_does_not_keep_its_one_row_card(monkeypatch):
    # 18h : le modèle écrit UNE ligne, Doctolib — un compte réel de l'outil mais au-delà des 20 lignes.
    _reply, cards = await _run_turn(monkeypatch, "Doctolib.\n\n" + _card("DOCTOLIB"))

    assert len(cards) == 1
    items = {item["name"]: item for item in cards[0]["items"]}
    assert {"ACCOR", "AIRBUS"} <= set(items)
    assert "Pari long déclaré." in items["ACCOR"]["why"]
    assert "Pari long déclaré." in items["AIRBUS"]["why"]
    assert "DOCTOLIB" in items  # le choix du modèle reste visible, jamais écarté en silence
    assert len(items) >= 3


@pytest.mark.asyncio
async def test_no_account_now_still_ranks_the_best_to_verify_with_their_reason(monkeypatch):
    # 21h : 0 « maintenant ». La réponse « aucun compte à travailler » ne laisse JAMAIS la liste vide : les
    # meilleurs « à vérifier », classés, avec leur raison, et les paris longs déclarés nommés.
    text = "Aucun compte n'est classé à travailler maintenant (18 à vérifier, 56 à surveiller)."
    reply, cards = await _run_turn(monkeypatch, text + "\n\n" + _card("VERIFIER 3", "DOCTOLIB"))

    assert len(cards) == 1
    items = cards[0]["items"]
    names = [item["name"] for item in items]
    assert {"ACCOR", "AIRBUS", "DOCTOLIB", "VERIFIER 3"} <= set(names)
    first = items[0]
    assert first["level"] == "to_qualify" and first["why"][0]  # les « à vérifier » d'abord, avec leur raison


@pytest.mark.asyncio
async def test_prose_only_answer_gets_the_tool_card(monkeypatch):
    _reply, cards = await _run_turn(monkeypatch, "Aucun compte n'est classé à travailler maintenant.")

    assert len(cards) == 1
    assert {"ACCOR", "AIRBUS"} <= {item["name"] for item in cards[0]["items"]}
