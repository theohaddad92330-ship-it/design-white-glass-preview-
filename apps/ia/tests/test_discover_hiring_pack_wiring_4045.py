"""#4045 / #3901 / #3866 — le PACK du vendeur doit arriver jusqu'aux sources de
recrutement PAR CANDIDAT (`it_job_signals` / `it_job_signals_apec`), pas
seulement jusqu'à la moisson par territoire (`list_hiring_companies*`, déjà
câblée). Avant ce lot, ``_candidate_signals`` les appelait avec ``pack``
absent : une ESN industrie ou cyber recevait le tri IT fixe sur les cartes
Découvrir, quel que soit son profil déclaré."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.routers import discover as discover_router


def _row() -> dict:
    return {
        "name": "USINE SA",
        "siren": "400000001",
        "nafCode": "30.30Z",
        "sector": "Construction aéronautique et spatiale",
        "city": "TOULOUSE",
        "department": "31",
        "headcountRange": "250 à 499 salariés",
        "headcountTranche": "32",
        "legalCategory": "5710",
    }


@pytest.fixture
def one_candidate(monkeypatch):
    async def gouv(filters, limit, degraded=None):
        return [_row()]

    async def angle(*_a: Any, **_kw: Any):
        return {"angles": []}, None

    monkeypatch.setattr(discover_router, "_fallback_search", gouv)
    monkeypatch.setattr(discover_router, "call_claude", AsyncMock(return_value=({"angles": []}, None)))
    for name in ("public_tenders", "legal_signals", "press_signals"):
        monkeypatch.setattr(discover_router, name, AsyncMock(return_value=[]))
    monkeypatch.setattr(discover_router, "load_press_feeds", AsyncMock(return_value={}))


def _call(client: TestClient, profile_data: dict | None = None) -> dict:
    body: dict = {"filters": {"department": "31"}, "limit": 1}
    if profile_data is not None:
        body["profile_data"] = profile_data
    resp = client.post("/discover/registry", json=body)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_industrial_pack_reaches_both_job_sources(client: TestClient, one_candidate, monkeypatch) -> None:
    ft = AsyncMock(return_value=[])
    monkeypatch.setattr(discover_router, "it_job_signals", ft)

    _call(client, profile_data={"offerDomain": "industrial_engineering"})

    assert ft.call_args.kwargs.get("pack") == "industrial_engineering"


def test_without_profile_pack_stays_esn_it(client: TestClient, one_candidate, monkeypatch) -> None:
    """Sans profil (ou sans ``offerDomain``) : le pack reste ``esn_it`` —
    comportement d'avant à l'octet près, jamais ``None`` propagé en silence."""
    ft = AsyncMock(return_value=[])
    monkeypatch.setattr(discover_router, "it_job_signals", ft)

    _call(client)

    assert ft.call_args.kwargs.get("pack") == "esn_it"
