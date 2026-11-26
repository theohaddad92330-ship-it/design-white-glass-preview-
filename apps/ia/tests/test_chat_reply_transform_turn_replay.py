"""#3768 (BEL-LAU-1014) — le TOUR rejoué : clic « Voir seulement les priorités » sous une
réponse de Laura → `POST /chat/message` avec `reply_transform` → modèle simulé → réponse.

Ce que le modèle reçoit, et que ce test prouve : la réponse source, sa forme, les comptes
cités et la RÉSERVE déjà posée — pas une requête aveugle. Un tour sans geste garde le prompt
sans ce bloc.

Question exacte à poser en recette : dans /chat, après une réponse qui liste des comptes et
dit « La cartographie est partielle… », cliquer « Voir seulement les priorités » — la réponse
garde les premiers comptes ET redit la réserve de cartographie partielle.
"""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from tests.test_chat_dsi_contacts_turn_replay import (
    USER,
    _FakeClient,
    _FakeMessageStream,
    _parse_sse,
    _patch_env,
    _resp,
    _text,
)

__all__ = ["_patch_env"]

ACCOUNT_A = "0b6f3d5e-1c1a-4a53-9a40-2f1f0e0c1a11"
SOURCE = (
    f"1. [Alpha](/accounts/{ACCOUNT_A}) — contrat en fin de cycle\n"
    "2. [Beta](/accounts/7d8c5b1e-92aa-4c3f-8f0e-5a6a3b9c2d22) — nouveau DSI\n"
    "La cartographie est partielle : seuls les comptes déjà analysés sont couverts."
)
RESERVE = "La cartographie est partielle : seuls les comptes déjà analysés sont couverts."


class _RecordingMessages:
    def __init__(self, responses, sent: list[dict]):
        self._responses = list(responses)
        self._sent = sent

    def stream(self, **kwargs):
        self._sent.append({"system": json.dumps(kwargs.get("system"), ensure_ascii=False, default=str)})
        return _FakeMessageStream(self._responses.pop(0))


def _replay(monkeypatch, client: TestClient, extra: dict) -> tuple[dict, list[dict]]:
    sent: list[dict] = []
    fake = _FakeClient([])
    fake.messages = _RecordingMessages(
        [_resp("end_turn", [_text(f"1. [Alpha](/accounts/{ACCOUNT_A}) — priorité\n{RESERVE}")])], sent
    )
    from app.services import chat_orchestrator

    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)
    res = client.post("/chat/message", json={"message": "Voir seulement les priorités", "user_id": USER, **extra})
    assert res.status_code == 200
    return _parse_sse(res.text)[-1], sent


def test_the_transform_turn_hands_the_model_the_source_the_accounts_and_the_reserve(monkeypatch, client: TestClient):
    done, sent = _replay(
        monkeypatch,
        client,
        {
            "reply_transform": {
                "id": "priorities_only",
                "source_text": SOURCE,
                "layout": "list",
                "account_ids": [ACCOUNT_A],
                "reserves": [RESERVE],
            }
        },
    )
    assert done["type"] == "done" and done["success"] is True, done
    system = sent[0]["system"]
    assert "TRANSFORMATION D'UNE RÉPONSE EXISTANTE" in system
    assert "VOIR SEULEMENT LES PRIORITÉS" in system
    assert RESERVE in system and ACCOUNT_A in system
    assert RESERVE in json.dumps(done, ensure_ascii=False)


def test_an_ordinary_turn_carries_no_transform_block(monkeypatch, client: TestClient):
    done, sent = _replay(monkeypatch, client, {})
    assert done["success"] is True, done
    assert "TRANSFORMATION D'UNE RÉPONSE EXISTANTE" not in sent[0]["system"]
