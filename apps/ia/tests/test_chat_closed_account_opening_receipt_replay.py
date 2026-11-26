"""#3285 (recette prod 02/10, reçu « ouverture de compte fermé » non rejoué faute de compte dormant) —
le TOUR entier rejoué : « Par où j'ouvre ce compte ? » sur un compte dont l'API pose
``account_data["relationship_state"] = "dormant"`` → modèle simulé → réponse → le reçu de transparence du
tour (dernier événement SSE) nomme « ouverture de compte fermé » ; sur un compte non dormant, aucun reçu.

Question exacte à poser en recette : dans /chat, sur un compte en relation dormante (démo : « SNCF dormant »
n'existe pas — voir le semis `dormantAccount`), « Par où j'ouvre ce compte ? » — le panneau « Sources »
de la réponse liste « ouverture de compte fermé ».
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.services import bellum_api
from tests.test_chat_buying_committee_turn_replay import _RecordingMessages
from tests.test_chat_dsi_contacts_turn_replay import (
    ACCOUNT,
    USER,
    _FakeClient,
    _parse_sse,
    _patch_env,
    _resp,
    _text,
)

__all__ = ["_patch_env"]


def _turn(monkeypatch, client: TestClient, account_data: dict) -> dict:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: False)
    fake = _FakeClient([])
    fake.messages = _RecordingMessages([_resp("end_turn", [_text("Je commencerais par un ancien interlocuteur.")])], [])
    from app.services import chat_orchestrator

    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)
    res = client.post(
        "/chat/message",
        json={
            "message": "Par où j'ouvre ce compte ?",
            "user_id": USER,
            "account_id": ACCOUNT,
            "account_data": account_data,
        },
    )
    assert res.status_code == 200
    done = _parse_sse(res.text)[-1]
    assert done["type"] == "done" and done["success"] is True, done
    return done


def _method_labels(done: dict) -> list[str]:
    context = (done.get("data") or {}).get("context") or {}
    return [s["label"] for s in context.get("sources", []) if s.get("kind") == "method_rule"]


def test_a_dormant_account_turn_carries_the_closed_account_opening_receipt(monkeypatch, client: TestClient) -> None:
    done = _turn(monkeypatch, client, {"company_name": "Acme", "relationship_state": "dormant"})
    assert "ouverture de compte fermé" in _method_labels(done)


def test_a_non_dormant_account_turn_carries_no_such_receipt(monkeypatch, client: TestClient) -> None:
    done = _turn(monkeypatch, client, {"company_name": "Acme", "relationship_state": "client_actif"})
    assert "ouverture de compte fermé" not in _method_labels(done)
