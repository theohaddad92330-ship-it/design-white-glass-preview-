"""`POST /expenses/extract` (#1827.2) — la porte HTTP de la lecture automatique.

Ces tests couvrent le TRANSPORT (base64, 502 sur panne du modèle) ; les règles
métier (seuil de confiance, plafond, statuts) sont couvertes par
`test_expense_extraction.py`, un cran plus bas.
"""

from __future__ import annotations

import base64
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

RECEIPT_TEXT = "TAXI PARISIEN\nCourse du 04/03/2026\nTotal : 24,50 EUR\n"


def _payload() -> dict:
    return {
        "is_receipt": True,
        "amount_cents": {"value": 2450, "confidence": 0.9, "source_excerpt": "Total : 24,50 EUR"},
        "spent_on": {"value": "2026-03-04", "confidence": 0.85, "source_excerpt": "Course du 04/03/2026"},
        "category": {"value": "taxi", "confidence": 0.9, "source_excerpt": "TAXI PARISIEN"},
        "vat_rate_bps": {"value": None, "confidence": 0.0, "source_excerpt": ""},
    }


def _usage():
    from app.services.claude_service import TokenUsage

    return TokenUsage(input_tokens=700, output_tokens=120, model="claude-haiku-4-5", cost_usd=0.0014, cost_known=True)


def test_extract_returns_a_proposal_for_a_readable_document() -> None:
    payload = base64.b64encode(RECEIPT_TEXT.encode("utf-8")).decode()
    with patch(
        "app.services.expense_extraction.call_claude",
        new_callable=AsyncMock,
        return_value=(_payload(), _usage()),
    ):
        response = client.post("/expenses/extract", json={"file_b64": payload, "filename": "taxi.txt"})
    assert response.status_code == 200
    body = response.json()["data"]
    assert body["status"] == "ok"
    assert body["fields"]["amountCents"]["value"] == 2450
    assert body["fields"]["category"]["value"] == "taxi"
    # Un taux non lu reste `null`, jamais 0 — la doctrine du dépôt.
    assert body["fields"]["vatRateBps"]["value"] is None
    assert body["costUsd"] == 0.0014


def test_rejects_invalid_base64() -> None:
    response = client.post("/expenses/extract", json={"file_b64": "!! pas du base64", "filename": "x.txt"})
    assert response.status_code == 400


def test_not_configured_makes_zero_network_calls(monkeypatch) -> None:
    monkeypatch.delenv("OCR_API_KEY", raising=False)
    scan = base64.b64encode(b"\xff\xd8\xff\xe0" + b"\xff" * 200).decode()
    with (
        patch("app.services.expense_extraction.ocr.extract_text", new_callable=AsyncMock) as mocked_ocr,
        patch("app.services.expense_extraction.call_claude", new_callable=AsyncMock) as mocked_claude,
    ):
        response = client.post("/expenses/extract", json={"file_b64": scan, "filename": "scan.jpg"})
    mocked_ocr.assert_not_called()
    mocked_claude.assert_not_called()
    assert response.status_code == 200
    body = response.json()["data"]
    assert body["status"] == "not_configured"
    assert body["costUsd"] is None


def test_a_model_failure_surfaces_as_502_not_a_silent_empty_proposal() -> None:
    with patch(
        "app.services.expense_extraction.call_claude",
        new_callable=AsyncMock,
        side_effect=RuntimeError("Anthropic indisponible"),
    ):
        payload = base64.b64encode(RECEIPT_TEXT.encode("utf-8")).decode()
        response = client.post("/expenses/extract", json={"file_b64": payload, "filename": "taxi.txt"})
    assert response.status_code == 502


def test_not_a_receipt_is_named_not_guessed() -> None:
    payload = _payload()
    payload["is_receipt"] = False
    with patch(
        "app.services.expense_extraction.call_claude", new_callable=AsyncMock, return_value=(payload, _usage())
    ):
        body_b64 = base64.b64encode(RECEIPT_TEXT.encode("utf-8")).decode()
        response = client.post("/expenses/extract", json={"file_b64": body_b64, "filename": "autre.txt"})
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "not_a_receipt"
    assert data["fields"]["amountCents"]["value"] is None


def test_router_is_mounted_on_the_app() -> None:
    """Une route neuve non montée dans `main.py` est un 404 permanent — le
    défaut n°1 du dépôt (« du code juste que personne n'appelle »)."""
    # FastAPI >= 0.143 n'aplatit plus `app.routes` (routeurs inclus = `_IncludedRouter`).
    try:
        from fastapi.routing import iter_route_contexts
    except ImportError:  # fastapi plus ancien : `app.routes` est déjà plat
        iter_route_contexts = list

    assert any(getattr(ctx, "path", "") == "/expenses/extract" for ctx in iter_route_contexts(app.routes))
