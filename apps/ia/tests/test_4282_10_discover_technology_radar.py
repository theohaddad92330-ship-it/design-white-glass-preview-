"""#4282.10 — Découvrir lit LA MÊME sortie que Laura : `POST /discover/technology-radar`."""

from __future__ import annotations

from unittest.mock import AsyncMock

from app.routers import discover

RADAR = {
    "technology": {"kind": "closed", "code": "SAP", "label": "SAP"},
    "generatedAt": "2026-10-19T00:00:00+00:00",
    "accounts": [],
    "historicalNeeds": [],
    "prescribers": [],
    "footprints": [],
    "notEvaluated": [],
}


def test_le_radar_de_decouvrir_est_la_sortie_commune(client, monkeypatch):
    spy = AsyncMock(return_value=RADAR)
    monkeypatch.setattr(discover, "technology_radar", spy)
    res = client.post("/discover/technology-radar", json={"technology": "SAP"})
    assert res.status_code == 200
    assert res.json() == RADAR
    spy.assert_awaited_once_with("SAP")


def test_NON_une_technologie_vide_est_refusee_sans_collecte(client, monkeypatch):
    spy = AsyncMock(return_value=None)
    monkeypatch.setattr(discover, "technology_radar", spy)
    res = client.post("/discover/technology-radar", json={"technology": "   "})
    assert res.status_code == 400
    assert client.post("/discover/technology-radar", json={"technology": "x" * 200}).status_code == 422
