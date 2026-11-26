"""#4429.2/.4, #4433.3/.4 — « Mutzig » + 250-999 ne rend plus LA POSTE « 10 000 salariés et plus » sans nom.

Le rappel silencieux de `list_companies` (toutes les tranches ≥ « 11 », fusionnées sans étiquette) gonflait le
compte exact : ni palier de zone, ni bandeau. Désormais : les exacts SEULS comptent, le palier de zone part
sous 10, et une taille hors tranche n'arrive que par un palier étiqueté (`widenedBy`), de tranche adjacente.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.services.company_filters import tranche_codes_between

_MUTZIG = {
    "code": "67300",
    "name": "Mutzig",
    "postalCodes": ["67190"],
    "department": "67",
    "departmentName": "Bas-Rhin",
    "region": "44",
    "latitude": 48.5380,
    "longitude": 7.4570,
}
# INSEE : 31 = 200-249, 32 = 250-499, 41 = 500-999, 42 = 1 000-1 999, 51 = 2 000-4 999, 52 = 5 000-9 999, 53 = 10 000+
_EXACT_ASKED = set(tranche_codes_between("32", "41"))


def _row(index: int, tranche: str, label: str, city: str = "MUTZIG", **over: Any) -> dict:
    return {
        "name": f"SOCIETE {index:03d} SAS",
        "siren": f"{400000000 + index}",
        "nafCode": "62.02A",
        "sector": "Conseil en systèmes et logiciels informatiques",
        "city": city,
        "department": "67",
        "headcountRange": label,
        "headcountTranche": tranche,
        "legalCategory": "5710",
        **over,
    }


class _Gouv:
    """Le registre doublé : filtre ses lignes sur les tranches DEMANDÉES, comme le vrai."""

    def __init__(self, by_zone: dict[str, list[dict]]) -> None:
        self.by_zone = by_zone
        self.calls: list[Any] = []

    async def __call__(self, filters, limit, degraded=None, *, page: int = 1):
        self.calls.append(filters)
        zone = f"radius_{int(filters.radius_km)}" if filters.radius_km else ("city" if filters.commune_code else "other")
        asked = set(filters.headcount_tranches or tranche_codes_between(filters.headcount_tranche_min, filters.headcount_tranche_max))
        rows = self.by_zone.get(zone, [])
        return [dict(r) for r in rows if not asked or r["headcountTranche"] in asked][:limit]


@pytest.fixture
def gouv(monkeypatch):
    source = _Gouv({})

    async def _no_pappers(filters, limit, degraded=None):
        return []

    async def _no_signals(*args: Any, **kwargs: Any) -> list[dict]:
        return []

    monkeypatch.setattr("app.routers.discover._registry_search", _no_pappers)
    monkeypatch.setattr("app.routers.discover._fallback_search", source)
    monkeypatch.setattr("app.routers.discover._fallback_search_page", source)
    monkeypatch.setattr("app.routers.discover.call_claude", AsyncMock(return_value=({"angles": []}, None)))
    monkeypatch.setattr("app.routers.discover.search_communes", AsyncMock(return_value=[_MUTZIG]))
    for name in ("public_tenders", "it_job_signals", "legal_signals", "funding_signals", "_press_for",
                 "_ats_for_card", "_peek_shared_jobs", "_adzuna_for_card", "_page_volumes"):  # fmt: skip
        monkeypatch.setattr(f"app.routers.discover.{name}", _no_signals)
    return source


def test_commune_petite_et_250_999_compte_les_exacts_seuls_et_declenche_le_palier_de_zone(
    client: TestClient, gouv: _Gouv
) -> None:
    exact = [_row(i, "32", "250 à 499 salariés") for i in range(2)]
    la_poste = _row(99, "53", "10 000 salariés et plus")
    # 28 + 2 exacts = la cible (30) : le palier de zone suffit, l'élargissement de taille (qui interroge d'autres tranches
    # par son propre rail) ne part pas — ce test ne garde que la collecte de ZONE.
    around = [_row(10 + i, "41", "500 à 999 salariés", city="MOLSHEIM") for i in range(28)]
    gouv.by_zone = {"city": exact + [la_poste], "radius_50": exact + around}

    response = client.post(
        "/discover/registry", json={"filters": {"city": "Mutzig", "headcountMin": 250, "headcountMax": 999}, "limit": 30}
    )

    assert response.status_code == 200, response.text
    body = response.json()
    # Les exacts comptent seuls : le palier de zone part (il ne partait pas, La Poste gonflait le compte).
    assert body["zoneWidening"]["exactCount"] == 2
    assert body["zoneWidening"]["tier"] == "radius_50"  # 50 km suffit avant le département
    # Aucune tranche hors de la demande n'a été interrogée par la collecte de zone, et La Poste n'apparaît pas.
    zone_calls = [f for f in gouv.calls if f.headcount_tranches is None]
    for f in zone_calls:
        assert set(tranche_codes_between(f.headcount_tranche_min, f.headcount_tranche_max)) <= _EXACT_ASKED
    assert "400000099" not in {c["siren"] for c in body["candidates"]}
    # Une tranche NON adjacente (« 10 000 et plus », « 5 000 à 9 999 ») n'est jamais demandée.
    sent = {code for f in gouv.calls for code in (f.headcount_tranches or [])}
    assert not sent & {"52", "53"}
