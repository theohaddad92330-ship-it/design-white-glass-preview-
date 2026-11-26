"""`POST /missions/extract` (#2560) — la porte HTTP de la lecture automatique.

Ces tests couvrent le TRANSPORT (base64, 502 sur panne du modèle) ; les règles
métier (seuil de confiance, plafond, citation) sont couvertes par
`test_mission_extraction.py`, un cran plus bas.
"""

from __future__ import annotations

import base64
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

DOCUMENT_TEXT = "Fiche de mission — Acme Corp\nTJM : 550 euros\nVolume : 120 jours\n"


def _payload() -> dict:
    return {
        "account_name": {"value": "Acme Corp", "confidence": 0.9, "source_excerpt": "Fiche de mission — Acme Corp"},
        "role_title": {"value": None, "confidence": 0.0, "source_excerpt": ""},
        "started_on": {"value": None, "confidence": 0.0, "source_excerpt": ""},
        "ends_on": {"value": None, "confidence": 0.0, "source_excerpt": ""},
        "daily_rate": {"value": 550, "confidence": 0.88, "source_excerpt": "TJM : 550 euros"},
        "days": {"value": 120, "confidence": 0.85, "source_excerpt": "Volume : 120 jours"},
    }


def _usage():
    from app.services.claude_service import TokenUsage

    return TokenUsage(input_tokens=500, output_tokens=100, model="claude-haiku-4-5", cost_usd=0.001, cost_known=True)


def test_extract_from_text_returns_a_proposal() -> None:
    with patch(
        "app.services.mission_extraction.call_claude",
        new_callable=AsyncMock,
        return_value=(_payload(), _usage()),
    ):
        response = client.post("/missions/extract", json={"text": DOCUMENT_TEXT})
    assert response.status_code == 200
    body = response.json()["data"]
    assert body["status"] == "ok"
    assert body["fields"]["accountName"]["value"] == "Acme Corp"
    assert body["fields"]["days"]["value"] == 120
    # Un rôle non lu reste `null`, jamais inventé.
    assert body["fields"]["roleTitle"]["value"] is None


def test_extract_from_file_decodes_base64() -> None:
    encoded = base64.b64encode(DOCUMENT_TEXT.encode("utf-8")).decode()
    with patch(
        "app.services.mission_extraction.call_claude",
        new_callable=AsyncMock,
        return_value=(_payload(), _usage()),
    ):
        response = client.post("/missions/extract", json={"file_base64": encoded, "file_name": "mission.txt"})
    assert response.status_code == 200
    assert response.json()["data"]["status"] == "ok"


def test_rejects_invalid_base64() -> None:
    response = client.post("/missions/extract", json={"file_base64": "!! pas du base64"})
    assert response.status_code == 400


def test_rejects_a_request_with_neither_text_nor_file() -> None:
    response = client.post("/missions/extract", json={})
    assert response.status_code == 422


def test_a_model_failure_surfaces_as_502_not_a_silent_empty_proposal() -> None:
    with patch(
        "app.services.mission_extraction.call_claude",
        new_callable=AsyncMock,
        side_effect=RuntimeError("Anthropic indisponible"),
    ):
        response = client.post("/missions/extract", json={"text": DOCUMENT_TEXT})
    assert response.status_code == 502
