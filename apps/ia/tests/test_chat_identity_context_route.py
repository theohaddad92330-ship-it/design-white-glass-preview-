"""#2259.4 / #2259.6 / #2259.11 / #2259.13 — le bloc identité atteint le PROMPT SYSTÈME réel.

Même défaut que celui documenté dans `test_chat_scope_object.py` : un champ
déclaré sur `ChatRequest` et jamais rendu dans le prompt (« pydantic avale le
champ »). Ce fichier tient la traversée entière : corps HTTP → pydantic →
routeur → prompt système — et le témoin qui sait dire NON (rien de connu ⇒
aucun bloc, prompt byte-identique).
"""

from __future__ import annotations

import json


def _terminal_event(text: str) -> dict:
    events = [
        json.loads(block.strip()[len("data:") :].strip())
        for block in text.strip().split("\n\n")
        if block.strip().startswith("data:")
    ]
    return events[-1]


def test_identity_fields_reach_the_real_system_prompt(client, monkeypatch):
    captured: dict = {}

    async def _call(system, user, **kwargs):
        captured["system"] = system
        return ("réponse", [])

    monkeypatch.setattr("app.services.chat_orchestrator.run_chat_with_tools", _call)
    res = client.post(
        "/chat/message",
        json={
            "message": "Peux-tu résumer l'échange avec Théo ?",
            "user_id": "user-1",
            "last_name": "Bénard",
            "workspace_role": "sales_ops",
            "is_account_owner": True,
            "mentioned_colleague": "Théo",
        },
    )
    assert res.status_code == 200
    assert _terminal_event(res.text)["data"]["reply"] == "réponse"
    system = captured["system"]
    assert "IDENTITÉ ET ENTOURAGE CONNUS" in system
    assert "Bénard" in system
    assert "sales ops" in system
    assert "propriétaire" in system.lower()
    assert "Théo" in system


def test_without_any_identity_field_the_router_prompt_carries_no_block(client, monkeypatch):
    """Le témoin : la garde qui sait dire NON — rien de connu, aucun bloc."""
    captured: dict = {}

    async def _call(system, user, **kwargs):
        captured["system"] = system
        return ("réponse", [])

    monkeypatch.setattr("app.services.chat_orchestrator.run_chat_with_tools", _call)
    res = client.post("/chat/message", json={"message": "Bonjour", "user_id": "user-1"})
    assert res.status_code == 200
    assert "IDENTITÉ ET ENTOURAGE CONNUS" not in captured["system"]


# #2259.30 / #2259.32 / #2259.33 / #2259.34 / #2259.35 — la BU atteint aussi
# le prompt système RÉEL, jusqu'au bout de la même traversée.


def test_business_unit_context_reaches_the_real_system_prompt(client, monkeypatch):
    captured: dict = {}

    async def _call(system, user, **kwargs):
        captured["system"] = system
        return ("réponse", [])

    monkeypatch.setattr("app.services.chat_orchestrator.run_chat_with_tools", _call)
    res = client.post(
        "/chat/message",
        json={
            "message": "Quels comptes prioriser ?",
            "user_id": "user-1",
            "business_units": [
                {
                    "name": "Agence Lyon",
                    "territory": "Auvergne-Rhône-Alpes",
                    "specialties": ["Java", "Cloud"],
                    "capacity": None,
                    "quarter_objective": None,
                    "account_count": 12,
                    "consultant_count": None,
                    "reference_count": None,
                }
            ],
        },
    )
    assert res.status_code == 200
    assert _terminal_event(res.text)["data"]["reply"] == "réponse"
    system = captured["system"]
    assert "IDENTITÉ ET ENTOURAGE CONNUS" in system
    assert "Agence Lyon" in system
    assert "Auvergne-Rhône-Alpes" in system
    assert "prioriser" in system.lower()


def test_without_business_units_the_router_prompt_carries_no_bu_line(client, monkeypatch):
    """Propriétaire sans BU (`perimetersOf` rend `[]`) : rien n'est dit."""
    captured: dict = {}

    async def _call(system, user, **kwargs):
        captured["system"] = system
        return ("réponse", [])

    monkeypatch.setattr("app.services.chat_orchestrator.run_chat_with_tools", _call)
    res = client.post("/chat/message", json={"message": "Bonjour", "user_id": "user-1"})
    assert res.status_code == 200
    assert "périmètre de travail (BU)" not in captured["system"]
