"""#4675 (L3) — le rayon d'une ville part à la source ; les départements couverts sont lus ; France Travail pagine.

Les sources sont simulées : aucun appel réseau."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.services import discover_skill_offers as skill
from app.services.department_reach import circle_departments

LILLE = (50.6365, 3.0635)
ARRAS = {"latitude": 50.2910, "longitude": 2.7775}  # ~ 45 km
PARIS = {"latitude": 48.8566, "longitude": 2.3522}  # ~ 205 km
TODAY = datetime.now(UTC).date().isoformat()
_ = timedelta


def _offer(employer: str, **extra: Any) -> dict[str, Any]:
    return {
        "employer": employer,
        "title": "Développeur Java",
        "description": "java",
        "date": TODAY,
        "url": f"https://o/{employer}",
        "source": "france_travail",
        "termChecked": True,
        **extra,
    }


# ── 2 — les départements couverts par le rayon ──────────────────────────────────────────────────


def test_lille_100_km_reads_the_62_and_not_only_the_59() -> None:
    assert circle_departments(["59"], LILLE, 100) == ["59", "62", "80"]


def test_a_small_circle_adds_nothing_and_no_circle_changes_nothing() -> None:
    assert circle_departments(["59"], LILLE, 30) == ["59"]  # Arras (préfecture) est à ~45 km : non prouvé
    assert circle_departments(["59"], None, None) == ["59"]
    assert circle_departments([], LILLE, 100) == []  # lecture nationale : rien à élargir


@pytest.mark.asyncio
async def test_find_skill_accounts_reads_the_departments_the_circle_covers(monkeypatch) -> None:
    seen: dict[str, Any] = {}

    async def harvest(skills, zone, profile, *, deadline, **kw):  # noqa: ANN001, ANN003
        seen.update(zone=list(zone), kw=kw)
        return skill.SkillHarvest(calls=dict.fromkeys(skill._SOURCES, 0))

    monkeypatch.setattr(skill, "harvest_skill_offers", harvest)
    await skill.find_skill_accounts(
        ["java"], ["59"], {}, deadline=None, city="Lille", centre=LILLE, radius_km=100, commune_code="59350"
    )
    assert seen["zone"] == ["59", "62", "80"]
    assert seen["kw"] == {"commune_code": "59350", "radius_km": 100}
    seen.clear()
    await skill.find_skill_accounts(["java"], ["59"], {}, deadline=None, city="Lille")  # « Lille seule »
    assert seen["zone"] == ["59"]
    assert seen["kw"] == {}


# ── 3 / 4 — hors cercle ≠ hors zone ; sans position ─────────────────────────────────────────────


def test_offer_of_the_62_at_45_km_is_kept_and_at_205_km_is_outside_the_circle() -> None:
    offers = [
        _offer("A", department="62", city="Arras", **ARRAS),
        _offer("B", department="62", city="Bapaume", **PARIS),
        _offer("C", department="62"),  # ni position ni ville publiées : lieu inconnu, département dans la zone
        _offer("E", department="59", city="Maubeuge"),  # ville connue et autre, sans position : jamais « Lille »
        _offer("D"),  # ni position, ni ville, ni département
    ]
    split = skill.split_by_reach(offers, "Lille", centre=LILLE, radius_km=100, zone=frozenset({"59", "62"}))
    assert [o["employer"] for o in split.kept] == ["A", "C"]
    assert split.outside_circle == 1  # B : position publiée, hors cercle
    assert split.unpositioned == 1  # C : gardée, le motif compté à part
    assert split.outside == 3  # B, E et D


# ── 1 / 6 — le rayon part à la source ; la clé de cache le porte ───────────────────────────────


@pytest.fixture
def ft_calls(monkeypatch):
    calls: list[dict[str, Any]] = []

    async def ft(term, department, profile, *, page=0, **kw):  # noqa: ANN001, ANN003
        calls.append({"department": department, "page": page, **kw})
        return []

    monkeypatch.setattr(skill, "france_travail_offers", ft)
    monkeypatch.setattr(skill, "adzuna_offers", AsyncMock(return_value=None))
    monkeypatch.setattr(skill, "cached_offers", AsyncMock(return_value=[]))
    monkeypatch.setattr(skill, "_harvest_cache_get", AsyncMock(return_value=None))
    monkeypatch.setattr(skill, "_harvest_cache_put", AsyncMock(return_value=None))
    return calls


@pytest.mark.asyncio
async def test_commune_and_distance_leave_for_the_source_with_a_radius(ft_calls) -> None:
    await skill.harvest_skill_offers(["java"], ["59", "62", "80"], {}, deadline=None, commune_code="59350", radius_km=100)
    assert ft_calls and all(c.get("commune") == "59350" and c.get("distance") == 100 for c in ft_calls)


@pytest.mark.asyncio
async def test_no_commune_no_distance_without_a_radius(ft_calls) -> None:
    """« Lille seule », un département, une région, un code postal : aucun rayon, la lecture reste départementale."""
    await skill.harvest_skill_offers(["java"], ["59"], {}, deadline=None)
    assert {c["department"] for c in ft_calls} == {"59"}  # plusieurs écritures de « java », un seul département
    assert all("commune" not in c and "distance" not in c for c in ft_calls)


@pytest.mark.asyncio
async def test_the_territory_cache_key_carries_the_commune_and_the_radius(monkeypatch) -> None:
    keys: list[str] = []

    async def get_json(namespace: str, key: str) -> None:
        keys.append(key)

    monkeypatch.setattr(skill.provider_cache, "get_json", get_json)
    monkeypatch.setattr(skill.provider_cache, "set_json", AsyncMock())
    monkeypatch.setattr(skill, "_france_travail_read", AsyncMock(return_value=[]))
    await skill.france_travail_offers("java", "59", {})
    await skill.france_travail_offers("java", "59", {}, commune="59350", distance=100)
    await skill.france_travail_offers("java", "59", {}, commune="59350", distance=50)
    await skill.france_travail_offers("java", "59", {}, commune="59178", distance=100)
    assert len(set(keys)) == 4


# ── 5 — la pagination départementale ────────────────────────────────────────────────────────────


def _pager(monkeypatch, sizes: list[int]) -> list[int]:
    pages: list[int] = []

    async def ft(term, department, profile, *, page=0, **kw):  # noqa: ANN001, ANN003
        pages.append(page)
        n = sizes[page] if page < len(sizes) else 0
        return [_offer(f"E{page}-{i}") for i in range(n)]

    monkeypatch.setattr(skill, "france_travail_offers", ft)
    return pages


@pytest.mark.asyncio
async def test_a_full_page_reads_the_next_and_a_short_page_stops(monkeypatch) -> None:
    pages = _pager(monkeypatch, [150, 120, 10, 150])
    harvest = skill.SkillHarvest(calls=dict.fromkeys(skill._SOURCES, 0))
    rows = await skill._department_france_travail("java", "59", {}, harvest, deadline=None)
    assert pages == [0, 1, 2]  # la page 2 est incomplète : arrêt
    assert len(rows) == 280
    assert harvest.calls["france_travail"] == 2  # la page 0 est comptée en amont, comme avant
    assert harvest.cut == 0


@pytest.mark.asyncio
async def test_the_page_ceiling_is_named_and_the_cut_is_said(monkeypatch) -> None:
    pages = _pager(monkeypatch, [150] * 10)
    harvest = skill.SkillHarvest(calls=dict.fromkeys(skill._SOURCES, 0))
    await skill._department_france_travail("java", "59", {}, harvest, deadline=None)
    assert pages == list(range(skill.SKILL_FT_DEPARTMENT_PAGES))
    assert harvest.by_source["france_travail"]["causes"] == {"pageCeiling": 1}


@pytest.mark.asyncio
async def test_no_time_left_stops_the_pagination_and_says_so(monkeypatch) -> None:
    pages = _pager(monkeypatch, [150, 150])
    harvest = skill.SkillHarvest(calls=dict.fromkeys(skill._SOURCES, 0))
    await skill._department_france_travail("java", "59", {}, harvest, deadline=0.0)  # échéance dépassée
    assert pages == [0]
    assert harvest.cut == 1
