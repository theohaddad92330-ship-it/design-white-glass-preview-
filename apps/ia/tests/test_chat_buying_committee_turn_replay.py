"""#2791 (recette prod 30/09, « comité d'achat Roche » non rejoué) — le TOUR entier
rejoué : « Qui est au comité d'achat de <compte pharma> ? » → modèle simulé →
VRAI outil `get_account_contacts` → pont simulé (secteur « Industrie pharmaceutique »,
un seul contact connu) → le résultat d'outil que le modèle reçoit nomme les sièges
sectoriels sans contact.

Question exacte à poser en recette : dans /chat, sur le compte Roche (secteur pharma),
« Qui est au comité d'achat de Roche ? » — Laura doit nommer Affaires réglementaires,
Assurance qualité (QA) et Pharmacovigilance à côté des contacts déjà connus.
"""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.services import bellum_api
from tests.test_chat_dsi_contacts_turn_replay import (
    ACCOUNT,
    USER,
    _FakeClient,
    _FakeMessageStream,
    _parse_sse,
    _patch_env,
    _resp,
    _text,
    _tool_use,
)

__all__ = ["_patch_env"]  # fixture autouse du tour (clé, throttle) rejouée telle quelle


def test_the_committee_turn_hands_the_model_the_named_pharma_seats(monkeypatch, client: TestClient) -> None:
    async def _account_contacts(*_a, **_k):
        return {
            "contacts": [{"contact_id": "c-1", "full_name": "Claire Dubois", "title": "DSI"}],
            "total": 1,
            "truncated": False,
            "account_sector": "Industrie pharmaceutique",
        }

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "account_contacts", _account_contacts)
    sent: list[dict] = []
    fake = _FakeClient([])
    fake.messages = _RecordingMessages(
        [
            _resp("tool_use", [_tool_use("get_account_contacts", {"account_id": ACCOUNT}, "t1")]),
            _resp("end_turn", [_text("Claire Dubois (DSI) ; sièges à rechercher : Affaires réglementaires.")]),
        ],
        sent,
    )
    from app.services import chat_orchestrator

    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)

    res = client.post(
        "/chat/message",
        json={"message": "Qui est au comité d'achat de Roche ?", "user_id": USER, "account_id": ACCOUNT},
    )

    assert res.status_code == 200
    done = _parse_sse(res.text)[-1]
    assert done["type"] == "done" and done["success"] is True, done
    # Le 2ᵉ appel au modèle porte le résultat de l'outil : les sièges sectoriels y sont NOMMÉS.
    tool_result = json.dumps(sent[1]["messages"], ensure_ascii=False, default=str)
    for seat in ("Affaires réglementaires", "Assurance qualité (QA)", "Pharmacovigilance"):
        assert seat in tool_result


class _RecordingMessages:
    def __init__(self, responses, sent: list[dict]):
        self._responses = list(responses)
        self._sent = sent
        self._stream_cls = _FakeMessageStream

    def stream(self, **kwargs):
        self._sent.append({"messages": json.loads(json.dumps(kwargs.get("messages"), default=str))})
        return self._stream_cls(self._responses.pop(0))
