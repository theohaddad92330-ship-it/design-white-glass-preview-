"""`POST /discover/registry` — le chemin SIMPLE (sans secteurs croisés) retente
aussi une fois sur un 429 (#2521, suite).

Mesuré en production le 17/09/2026 (recette 13, ~13:30) : une recherche simple
(un secteur + Toulouse) → 10,1 s, `degraded` = [{recherche-entreprises,
rate_limited}, {recherche-entreprises, no_match}, {pappers,
unsupported_filters}]. Le mécanisme de nouvelle tentative sur 429
(`list_companies`, sous `wait_deadline`) est déjà entièrement testé en
isolation (`tests/test_registry_public_rate.py`) — ce qui n'était PAS vérifié,
c'est qu'il est bien BRANCHÉ sur le chemin réellement emprunté par une
recherche simple : `_collect_registry` (pas `_collect_crossed`, réservé aux
secteurs multiples), appelé DIRECTEMENT depuis `_collect_for_request`, sans son
propre `wait_deadline` — il compte sur celui posé plus haut, dans
`discover_registry()`. Le motif qui revient dans ce dépôt : du code juste,
testé seul, que personne n'a vérifié appelé au bon endroit.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.routers import discover as discover_router
from app.services import rate_limiter
from app.services.data_sources import recherche_entreprises as re_src


class _Resp:
    def __init__(self, status: int, headers: dict | None = None, rows: list | None = None) -> None:
        self.status_code = status
        self.headers = headers or {}
        self.is_success = 200 <= status < 300
        self._rows = rows or []

    def json(self) -> dict:
        return {"results": self._rows}


class _Client:
    def __init__(self, *responses: _Resp) -> None:
        self._responses = list(responses)
        self.calls = 0

    async def get(self, _url, params=None):
        self.calls += 1
        return self._responses[min(self.calls, len(self._responses)) - 1]

    async def aclose(self) -> None:
        return None


_ROW = {"siren": "552100554", "nom_complet": "SOCIETE TEST", "siege": {"code_postal": "31000"}}


@pytest.fixture(autouse=True)
def _fresh_throttles(monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    rate_limiter._reset_cache_for_tests()
    yield
    rate_limiter._reset_cache_for_tests()


@pytest.fixture
def simple_path(monkeypatch):
    """Pappers ne rend rien (recherche-entreprises est la seule source), un
    seul secteur — aucun croisement, `_collect_registry` est donc le chemin
    réellement emprunté."""
    fake = _Client(_Resp(429, {"retry-after": "0.05"}), _Resp(200, rows=[_ROW]))

    async def gouv(filters, limit, degraded=None):
        return await re_src.list_companies(filters, limit, degraded=degraded, client=fake)

    monkeypatch.setattr(discover_router, "_registry_search", AsyncMock(return_value=[]))
    monkeypatch.setattr(discover_router, "_fallback_search", gouv)
    return fake


def _post(client: TestClient) -> Any:
    return client.post("/discover/registry", json={"filters": {"sector": "62.02A", "city": "Toulouse"}, "limit": 20})


def test_a_single_sector_search_retries_once_on_a_429_and_returns_the_row(
    client: TestClient, simple_path, monkeypatch
):
    monkeypatch.setattr(discover_router, "call_claude", AsyncMock(return_value=({"angles": []}, None)))

    body = _post(client).json()

    assert simple_path.calls == 2, "une seule nouvelle tentative devait suivre le 429"
    sirens = {c["siren"] for c in body["candidates"]}
    assert "552100554" in sirens
    assert "rate_limited" not in {e.get("reason") for e in body["degraded"] if e.get("source") == "recherche-entreprises"}


def test_witness_without_the_retry_the_first_429_would_be_reported(client: TestClient, monkeypatch):
    """Témoin : un 429 PERSISTANT (jamais de 200) reste dit, jamais masqué —
    la nouvelle tentative ne cache pas une vraie panne."""
    fake = _Client(_Resp(429, {"retry-after": "0.05"}))

    async def gouv(filters, limit, degraded=None):
        return await re_src.list_companies(filters, limit, degraded=degraded, client=fake)

    monkeypatch.setattr(discover_router, "_registry_search", AsyncMock(return_value=[]))
    monkeypatch.setattr(discover_router, "_fallback_search", gouv)
    monkeypatch.setattr(discover_router, "call_claude", AsyncMock(return_value=({"angles": []}, None)))

    body = _post(client).json()

    assert fake.calls == 2  # la seule nouvelle tentative a eu lieu, puis dégradation
    assert "rate_limited" in {e.get("reason") for e in body["degraded"] if e.get("source") == "recherche-entreprises"}
