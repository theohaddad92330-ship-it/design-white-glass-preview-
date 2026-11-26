"""#3270 — LA ROUTE PARTENAIRE RANG 2, REJOUÉE TOUR PAR TOUR (« règle de marge manquante »).

Décision de Louis (30/09/2026) : un comportement de Laura ne se ferme que sur un
tour REJOUÉ (entrée → outil → ce que le modèle reçoit). Le modèle est le seul
élément simulé ; tout ce qui le précède est le vrai code :

- la vraie route ``POST /chat/message`` : le ``system`` réel porte la règle
  GOUVERNANCE RANG 2 et l'exemple « Je ne recommande pas d'envoyer un profil… » ;
- l'outil ``search_partners`` est PRÉSENTÉ au modèle (sans lui, la règle
  demanderait de lire un statut qu'il ne peut pas atteindre) ;
- le vrai ``execute_chat_tool`` : ``governanceStatus`` et ``governanceReadiness``
  (ce qui est cadré, ce qui manque, le risque, la prochaine validation)
  traversent le tampon de sortie SANS être coupés ni arrondis — ils sont ce que
  Laura doit LIRE, jamais deviner.

QUESTION EXACTE À POSER EN RECETTE (/chat, un compte avec une ESN rang 2 sans
marge plancher ni non-contournement enregistrés) : « Je peux envoyer un profil à
<ESN> sur <compte> ? » — Laura dit que l'accès existe mais que la marge et le
non-contournement ne sont pas cadrés, et ne recommande PAS d'envoyer un profil.
"""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.services import bellum_api
from app.services.chat_tools import execute_chat_tool, tools_for


def _replay_system(client: TestClient, message: str) -> tuple[str, dict]:
    captured: dict[str, Any] = {}

    async def _fake_model(system: str, *_a: object, **kwargs: object) -> tuple[str, list]:
        captured["system"] = system
        captured["kwargs"] = kwargs
        return "Réponse de Laura.", []

    with patch("app.services.chat_orchestrator.run_chat_with_tools", new_callable=AsyncMock, side_effect=_fake_model):
        res = client.post("/chat/message", json={"message": message, "user_id": "u1"})
    assert res.status_code == 200
    assert "system" in captured, "le modèle n'a jamais été appelé — le tour s'est arrêté avant"
    return captured["system"], captured["kwargs"]


def test_the_partner_route_turn_carries_the_governance_rule_and_the_tool_to_read_it(client: TestClient) -> None:
    system, kwargs = _replay_system(client, "Je peux envoyer un profil à Astek sur ce compte ?")
    assert "GOUVERNANCE RANG 2" in system
    assert "Je ne recommande pas d'envoyer un profil avant d'avoir cadré ces deux points." in system
    assert "ne suppose JAMAIS un référencement qui n'est pas prouvé" in system
    assert "search_partners" in {str(t["name"]) for t in tools_for(kwargs.get("connected_families"))}


@pytest.mark.asyncio
async def test_missing_margin_and_non_circumvention_reach_the_model_unaltered(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    readiness = {
        "framed": ["entry_door", "accounts_accessible"],
        "missing": ["margin_floor", "non_circumvention"],
        "risk": "blocking",
        "accountsConcerned": ["Vertex Systèmes"],
        "profilesConcerned": [],
        "nextValidation": "margin_floor",
    }

    async def _partner_pipeline(*_a: object, **_k: object) -> dict:
        return {
            "partners": [
                {
                    "id": "p-1",
                    "name": "Astek",
                    "governanceStatus": "rules_missing",
                    "governanceReadiness": readiness,
                }
            ]
        }

    monkeypatch.setattr(bellum_api, "partner_pipeline", _partner_pipeline)
    result = await execute_chat_tool("search_partners", {}, user_id="u1", profile_data=None)

    partner = result["partners"][0]
    assert partner["governanceStatus"] == "rules_missing"
    assert partner["governanceReadiness"]["missing"] == ["margin_floor", "non_circumvention"]
    assert partner["governanceReadiness"]["risk"] == "blocking"
    assert partner["governanceReadiness"]["nextValidation"] == "margin_floor"
    # Le modèle reçoit un JSON : rien de ce qu'il doit lire n'a été perdu à la sérialisation.
    assert json.loads(json.dumps(result))["partners"][0]["governanceReadiness"] == readiness
