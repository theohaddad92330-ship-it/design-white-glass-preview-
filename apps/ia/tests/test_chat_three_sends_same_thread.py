"""#3506 (recette prod 02/10, Y13) — « Une réponse "erreur côté assistant" au 2e envoi » dans
le même fil. Le 2e envoi est le premier à porter un ÉTAT DE FIL antérieur
(`thread.previous` non vide : blocs interrompu / changement de sujet / correction / état)
et un historique : ce chemin n'existait pas au 1er tour.

Le test enchaîne TROIS envois sur le vrai routeur : chaque requête rend à l'IA
le `thread_state` et l'historique que le tour précédent a produits, comme le fait
le navigateur. Aucun des trois ne doit finir en échec.

Question exacte à poser en recette : /chat?conversationId=<fil avec réponse>, envoyer
trois messages d'affilée (le 2e et le 3e doivent répondre, jamais « erreur côté assistant »).
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from tests.test_chat_dsi_contacts_turn_replay import (
    USER,
    _FakeClient,
    _FakeMessageStream,
    _parse_sse,
    _patch_env,
    _resp,
    _text,
    _tool_use,
)

__all__ = ["_patch_env"]

_RICH_STATE = json.loads((Path(__file__).parent / "fixtures" / "thread_state_wire.json").read_text(encoding="utf-8"))


class _Messages:
    def __init__(self, responses):
        self._responses = list(responses)

    def stream(self, **_kwargs):
        return _FakeMessageStream(self._responses.pop(0))


def _install(monkeypatch, responses) -> None:
    from app.services import chat_orchestrator

    fake = _FakeClient([])
    fake.messages = _Messages(responses)
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)


def _send(client: TestClient, message: str, history: list[dict], thread_state: dict | None, **extra) -> dict:
    body: dict = {"message": message, "user_id": USER, "history": history, **extra}
    if thread_state:
        body["thread_state"] = thread_state
    res = client.post("/chat/message", json=body)
    assert res.status_code == 200
    return _parse_sse(res.text)[-1]


def test_three_sends_in_the_same_thread_all_answer(monkeypatch, client: TestClient) -> None:
    _install(
        monkeypatch,
        [
            _resp("end_turn", [_text("Première réponse.")]),
            _resp("end_turn", [_text("Deuxième réponse.")]),
            _resp("end_turn", [_text("Troisième réponse.")]),
        ],
    )
    history: list[dict] = []
    state: dict | None = None
    for index, message in enumerate(("Bonjour", "Qui est le DSI de Société Générale ?", "Et son adjoint ?")):
        done = _send(client, message, history, state)
        assert done["type"] == "done" and done["success"] is True, (index, done)
        reply = done["data"]["reply"]
        assert "erreur est survenue" not in reply, (index, reply)
        history = [*history, {"role": "user", "content": message}, {"role": "assistant", "content": reply}]
        state = done["data"].get("thread_state") or state


def test_a_second_send_carrying_a_rich_prior_thread_state_answers(monkeypatch, client: TestClient) -> None:
    _install(monkeypatch, [_resp("end_turn", [_text("Réponse.")])])
    done = _send(
        client,
        "Et à Lyon ?",
        [{"role": "user", "content": "Trouve des ETI"}, {"role": "assistant", "content": "Voici."}],
        _RICH_STATE,
    )
    assert done["success"] is True, done


def test_a_second_send_with_every_memory_field_the_api_adds_answers(monkeypatch, client: TestClient) -> None:
    """Tout ce que l'API ajoute À PARTIR du 2e envoi : résumé roulant, mémoire épinglée
    (nature + origine, dont une note de Laura confirmée), état du fil, historique avec une
    carte rendue."""
    _install(monkeypatch, [_resp("end_turn", [_text("Réponse.")])])
    card = '```bellum-block\n{"type":"missing_data","title":"t","failed":["x"],"missing":[]}\n```'
    done = _send(
        client,
        "Et son adjoint ?",
        [{"role": "user", "content": "Qui est le DSI ?"}, {"role": "assistant", "content": card}],
        _RICH_STATE,
        conversation_summary="Fil précédent : la personne cherche le DSI de Société Générale.",
        pinned_facts=["Cible les banques"],
        pinned_memory=[
            {"fact": "Cible les banques", "kind": "fact", "origin": "manual"},
            {"fact": "Préfère le tutoiement", "kind": "preference", "origin": "copilot", "confirmed": True},
        ],
        user_preferences={"tone": "direct"},
    )
    assert done["success"] is True, done
