"""#4115 — la grille est APPELÉE par les deux chemins de Découvrir, pas
seulement testée en isolation : recherche registre (`_finish_signal_tasks`) et
mode Signaux (`_build_candidates`)."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.routers import discover as discover_router
from app.routers import discover_signals as mod
from app.services.discover_signal_grid import MAX_CONTEXT, MAX_STRONG

# #3901.p — Découvrir ne retient une offre que si elle recoupe un métier de l'ESN (déclaré ou déduit).
SCOPE_PROFILE = {"placedRoles": ["développeur", "ingénieur", "architecte", "data", "devops", "offre"]}



def _row(index: int) -> dict:
    return {
        "name": f"SOCIETE {index:03d} SAS",
        "siren": f"{100000000 + index}",
        "nafCode": "62.01Z",
        "sector": "Programmation informatique",
        "city": "TOULOUSE",
        "department": "31",
        "headcountRange": "50 à 99 salariés",
        "headcountTranche": "21",
        "legalCategory": "5710",
    }


@pytest.fixture
def one_candidate(monkeypatch):
    async def gouv(filters, limit, degraded=None):
        return [_row(0)]

    async def pappers_unreached(filters, limit, degraded=None):
        raise AssertionError("Pappers ne passe pas devant le chemin gouv.fr")

    monkeypatch.setattr(discover_router, "_registry_search", pappers_unreached)
    monkeypatch.setattr(discover_router, "_fallback_search", gouv)
    monkeypatch.setattr(discover_router, "call_claude", AsyncMock(return_value=({"angles": []}, None)))
    monkeypatch.setattr(discover_router, "legal_signals", AsyncMock(return_value=[]))
    monkeypatch.setattr(discover_router, "funding_signals", AsyncMock(return_value=[]))


def test_registry_path_drops_internships_and_tags_tiers(client: TestClient, one_candidate, monkeypatch):
    monkeypatch.setattr(discover_router, "public_tenders", AsyncMock(return_value=[]))
    monkeypatch.setattr(
        discover_router,
        "it_job_signals",
        AsyncMock(
            return_value=[
                {"title": "Stage développeur", "location": "Toulouse", "date": "2026-10-05", "contractType": "CDI"},
                {"title": "Ingénieur data", "location": "Toulouse", "date": "2026-10-04", "contractType": "CDI"},
            ]
        ),
    )
    resp = client.post("/discover/registry", json={"profile_data": SCOPE_PROFILE, "filters": {}, "limit": 30})
    signals = resp.json()["candidates"][0]["signals"]
    assert [s["label"] for s in signals] == ["Ingénieur data"]
    assert signals[0]["tier"] == "strong"


def test_registry_path_caps_five_strong_and_ten_context(client: TestClient, one_candidate, monkeypatch):
    monkeypatch.setattr(discover_router, "public_tenders", AsyncMock(return_value=[]))
    jobs = [
        {"title": f"Offre {i}", "location": "Toulouse", "date": f"2026-09-{i + 1:02d}", "contractType": "CDI"}
        for i in range(20)
    ]
    monkeypatch.setattr(discover_router, "it_job_signals", AsyncMock(return_value=jobs))
    resp = client.post("/discover/registry", json={"profile_data": SCOPE_PROFILE, "filters": {}, "limit": 30})
    signals = resp.json()["candidates"][0]["signals"]
    assert len(signals) == MAX_STRONG + MAX_CONTEXT
    assert sum(1 for s in signals if s["tier"] == "strong") == MAX_STRONG
    assert signals[0]["label"] == "Offre 19"  # le plus frais d'abord


def _hiring(name: str, label: str, date: str) -> dict:
    return {
        "name": name,
        "siren": None,
        "department": "69",
        "city": None,
        "signal": {"type": "hiring", "label": label, "date": date, "url": None, "detail": None},
    }


def _tender(name: str, label: str, date: str) -> dict:
    return {
        "name": name,
        "siren": None,
        "department": "69",
        "city": None,
        "signal": {"type": "tender", "label": label, "date": date, "url": None, "detail": None},
    }


def _group(name: str, hiring: list[tuple[str, str]], tender: list[tuple[str, str]] = ()) -> Any:
    group = mod._Group(name)
    for label, date in hiring:
        group.absorb(_hiring(name, label, date), "hiring", "2026-10-13T00:00:00Z")
    for label, date in tender:
        group.absorb(_tender(name, label, date), "tender", "2026-10-13T00:00:00Z")
    return group


def test_signals_path_drops_account_whose_only_signal_is_an_internship() -> None:
    resolved = [
        (_group("ALPHA", [("Stage data", "2026-10-10")]), "111111111", None),
        (_group("BETA", [("Ingénieur data", "2026-10-09")]), "222222222", None),
    ]
    built = mod._build_candidates(resolved, filters={}, profile=SCOPE_PROFILE, degraded=[])
    assert [c.name for c in built] == ["BETA"]
    assert [s.tier for s in built[0].signals] == ["strong"]


def test_signals_path_ranks_two_independent_sources_before_one_fresher_signal() -> None:
    fresh_single = _group("SOLO", [("Ingénieur data", "2026-10-12")])
    corroborated = _group("DUO", [("Ingénieur cloud", "2026-09-20")], [("AO infogérance", "2026-09-21")])
    built = mod._build_candidates(
        [(fresh_single, "111111111", None), (corroborated, "222222222", None)], filters={}, profile=SCOPE_PROFILE, degraded=[]
    )
    assert [c.name for c in built] == ["DUO", "SOLO"]


def test_signals_path_has_no_probability_field() -> None:
    built = mod._build_candidates(
        [(_group("ALPHA", [("Ingénieur data", "2026-10-10")]), "111111111", None)], filters={}, profile=SCOPE_PROFILE, degraded=[]
    )
    dumped = built[0].signals[0].model_dump()
    assert not any(k for k in dumped if any(f in k.lower() for f in ("prob", "chance", "percent", "likelihood")))
