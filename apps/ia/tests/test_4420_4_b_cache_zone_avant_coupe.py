"""#4420.4 b (Louis 23/10/2026, B5 / S22) — le filtre de ZONE précède la coupe à 200 lignes du cache.

Avant : « Java · Hauts-de-France » gardait, des 200 offres les plus récentes de FRANCE, celles de la zone.
Maintenant : la zone se lit pendant le balayage (une seule requête), la coupe porte sur les lignes de la zone."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

from app.services import discover_skill_offers as skill
from app.services import source_cache


class _Cursor:
    def __init__(self, rows):
        self._rows = rows

    async def fetchall(self):
        return self._rows


class _Conn:
    def __init__(self, rows):
        self.rows = rows
        self.asked: list[tuple] = []

    async def execute(self, sql, params):
        self.asked.append(params)
        return _Cursor(self.rows[: params[-1]])


def _row(n: int, dept: str):
    return (f"siren:{n:09d}|merged", {"rows": [{"company": f"E{n}", "department": dept, "title": "Java"}]})


def test_la_zone_est_lue_avant_la_coupe() -> None:
    # 300 lignes récentes hors zone (75), puis 3 dans la zone (59) : la coupe à 200 les perdait.
    rows = [_row(i, "75") for i in range(300)] + [_row(300 + i, "59") for i in range(3)]
    conn = _Conn(rows)
    store = source_cache._PgStore("postgres://x")
    store._ensure_conn_locked = AsyncMock(return_value=conn)  # type: ignore[method-assign]

    kept = asyncio.run(
        store.search_jobs("java", 86_400, 200, keep=lambda payload: payload["rows"][0]["department"] == "59")
    )

    assert [key for key, _ in kept] == [f"siren:{300 + i:09d}|merged" for i in range(3)]
    assert len(conn.asked) == 1  # aucune requête de plus


def test_sans_zone_la_coupe_reste_celle_d_avant() -> None:
    conn = _Conn([_row(i, "75") for i in range(300)])
    store = source_cache._PgStore("postgres://x")
    store._ensure_conn_locked = AsyncMock(return_value=conn)  # type: ignore[method-assign]

    assert len(asyncio.run(store.search_jobs("java", 86_400, 200))) == 200


def test_les_offres_du_cache_passent_la_zone_au_balayage(monkeypatch) -> None:
    seen: dict = {}

    async def fake(term, *, max_age_s, limit, keep=None):
        seen["keep"] = keep
        return []

    monkeypatch.setattr(skill.source_cache, "search_job_offers", fake)
    asyncio.run(skill.cached_offers("java", zone=frozenset({"59", "62"})))
    keep = seen["keep"]
    assert keep({"rows": [{"department": "59"}]}) is True
    assert keep({"rows": [{"department": "75"}]}) is False
    assert keep({"rows": []}) is False

    asyncio.run(skill.cached_offers("java", zone=frozenset()))
    assert seen["keep"] is None
