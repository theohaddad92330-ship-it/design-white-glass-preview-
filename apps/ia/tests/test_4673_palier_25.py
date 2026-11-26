"""#4673 L1 — « assez de comptes » = 25 (Louis, 28/10/2026 : « dans les 20 30 comptes, aujourd'hui j'en ai 4 / 8 »).

Un barreau commencé se TERMINE (on ne jette pas ce qu'il a trouvé) ; le barreau suivant ne s'ouvre pas quand la
cible est atteinte (temps et crédits). Le plafond automatique reste la région (c144) : département puis région, jamais la France.
"""

from __future__ import annotations

import time
from types import SimpleNamespace
from typing import Any

import pytest


from app.routers import discover
from app.routers.discover import DiscoverFilters
from app.services import criteria_referential as ref
from app.services import zone_tiers

_COMMUNE = {"code": "59350", "name": "Lille", "department": "59", "region": "32", "latitude": 50.6, "longitude": 3.06}


def _row(index: int) -> dict[str, Any]:
    return {"siren": str(400000000 + index), "name": f"SOC {index}", "headcountRange": None}


def test_le_seuil_est_25_et_un_seul_endroit_le_porte() -> None:
    assert ref.CRITERIA_WIDEN_MIN_RESULTS == 25
    assert zone_tiers.ZONE_WIDEN_MIN_RESULTS is not None
    assert zone_tiers.ZONE_WIDEN_MIN_RESULTS == ref.CRITERIA_WIDEN_MIN_RESULTS
    assert zone_tiers.needs_zone_widening(24)
    assert not zone_tiers.needs_zone_widening(25)


def test_le_defaut_du_registre_atteint_la_cible() -> None:
    assert discover.DEFAULT_REGISTRY_LIMIT >= ref.CRITERIA_WIDEN_MIN_RESULTS


async def _run(monkeypatch: pytest.MonkeyPatch, by_tier: dict[str, int], exact: int) -> tuple[list[dict], list[str]]:
    calls: list[str] = []

    async def fake_find(skills, zone, profile, deadline, city):  # noqa: ANN001
        tier = "department" if len(zone) == 1 else "region"
        calls.append(tier)
        return SimpleNamespace(accounts=[_row(1000 * (len(calls)) + i) for i in range(by_tier.get(tier, 0))])

    monkeypatch.setattr(discover, "find_skill_accounts", fake_find)
    monkeypatch.setattr(discover, "_skill_rows", lambda accounts: list(accounts))
    monkeypatch.setattr("app.services.geo_labels.region_departments", lambda region: ["59", "62"])
    zone_out: dict[str, Any] = {}
    rows = await discover._widen_skill_by_zone(
        ["java"],
        [_row(i) for i in range(exact)],
        DiscoverFilters(city="Lille"),
        SimpleNamespace(commune=_COMMUNE),
        "Lille",
        [],
        {},
        time.monotonic() + 60,
        zone_out,
    )
    return rows, calls


@pytest.mark.asyncio
async def test_un_barreau_commence_se_termine_14_trouves_2_exacts_font_16(monkeypatch) -> None:
    rows, calls = await _run(monkeypatch, {"department": 14}, exact=2)
    assert len(rows) == 16  # pas 10 : rien n'est jeté
    assert calls[0] == "department"


@pytest.mark.asyncio
async def test_un_barreau_qui_depasse_la_cible_est_garde_en_entier(monkeypatch) -> None:
    rows, calls = await _run(monkeypatch, {"department": 40}, exact=2)
    assert len(rows) == 42
    assert calls == ["department"]


@pytest.mark.asyncio
async def test_la_cible_atteinte_n_ouvre_pas_le_barreau_suivant(monkeypatch) -> None:
    rows, calls = await _run(monkeypatch, {"department": 23, "region": 50}, exact=2)
    assert len(rows) == 25
    assert calls == ["department"]  # la région n'est pas lue


@pytest.mark.asyncio
async def test_sous_la_cible_le_barreau_suivant_s_ouvre(monkeypatch) -> None:
    rows, calls = await _run(monkeypatch, {"department": 20, "region": 3}, exact=2)
    assert calls == ["department", "region"]
    assert len(rows) == 25


@pytest.mark.asyncio
async def test_deja_assez_d_exacts_rien_ne_s_elargit(monkeypatch) -> None:
    rows, calls = await _run(monkeypatch, {"region": 9}, exact=25)
    assert len(rows) == 25
    assert calls == []
