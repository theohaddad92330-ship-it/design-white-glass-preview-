"""LUD.2 — Découvrir mode signaux sur une RÉGION (ou la ville de Lyon), pas seulement un département."""

from __future__ import annotations

from app.routers import discover_signals as mod
from app.routers.discover_signals import signal_zone_departments
from tests.test_discover_signals_router import _resolution, _row, registry, resolver, sources  # noqa: F401

AURA = ["01", "03", "07", "15", "26", "38", "42", "43", "63", "69", "73", "74"]


def test_zone_resolution() -> None:
    assert sorted(signal_zone_departments(None, "84", None)) == AURA
    assert len(signal_zone_departments(None, "27", None)) == 8  # BFC
    assert "13" in signal_zone_departments(None, "93", None)  # PACA
    assert signal_zone_departments(None, None, "Lyon") == ["69"]
    assert signal_zone_departments("69", None, None) == ["69"]
    assert signal_zone_departments(None, None, None) == []
    assert signal_zone_departments(None, "ZZ", None) == []  # un code inconnu ne devine rien


def test_region_queries_each_department_and_keeps_nothing_outside(client, monkeypatch, sources, resolver) -> None:  # noqa: F811
    seen: list[str | None] = []

    async def _tender(department, *_a, **_k):
        seen.append(department)
        rows = [_row(f"MAIRIE {department}", "tender", 3, siren=f"2{int(department[:2]) if department[:2].isdigit() else 0:02d}000000", department=department)]
        if department == "69":
            rows.append(_row("PARISIENNE SA", "tender", 2, siren="552100554", department="75"))  # hors zone
        return rows

    monkeypatch.setattr(mod, "list_tender_buyers", _tender)
    res = client.post(
        "/discover/signals",
        json={"region": "84", "sinceDays": 90, "limit": 50, "sources": ["tender"], "profile_data": {"placedRoles": ["technicien"]}},
    )
    assert res.status_code == 200, res.text
    assert sorted(seen) == AURA
    names = [c["name"] for c in res.json()["candidates"]]
    assert "PARISIENNE SA" not in names


def test_single_department_path_is_unchanged(client, monkeypatch, sources) -> None:  # noqa: F811
    seen: list[str | None] = []

    async def _tender(department, *_a, **_k):
        seen.append(department)
        return []

    monkeypatch.setattr(mod, "list_tender_buyers", _tender)
    res = client.post("/discover/signals", json={"department": "69", "sinceDays": 90, "sources": ["tender"]})
    assert res.status_code == 200, res.text
    assert seen == ["69"]


def test_city_lyon_covers_69(client, monkeypatch, sources) -> None:  # noqa: F811
    seen: list[str | None] = []

    async def _tender(department, *_a, **_k):
        seen.append(department)
        return []

    monkeypatch.setattr(mod, "list_tender_buyers", _tender)
    client.post("/discover/signals", json={"city": "Lyon", "sinceDays": 90, "sources": ["tender"]})
    assert seen == ["69"]
