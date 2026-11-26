"""Mesure — lot DECOUVRIR-COLLECTE (#4067, 13/10) : latence avant/après, appels évités.

Lancer (hors pytest, réseau coupé — les sources sont simulées) :

    cd apps/ia && python tests/perf/mesure_decouvrir_collecte_13_10.py

Ce qui est SIMULÉ, et d'où viennent les chiffres : chaque source dort la latence
MESURÉE en direct le 13/10 depuis le conteneur de travail (réseau réel, 5
entreprises) — AO 0,55-1,23 s (médiane ~0,7 s), annonces légales 0,20-1,12 s
(~0,45 s), flux presse 1,9 s une fois puis 0,07 s par entreprise ; offres cadres
(répond 403 depuis ce conteneur) et France Travail (sans identifiants ici) : 0,4 s
et 2 × 0,6 s, ordre de grandeur des autres registres. Chaque sommeil passe par le
VRAI limiteur du registre (`rate_limiter.throttle`) : sa concurrence s'applique.

« Avant » rejoue la configuration d'avant le lot (5 premières lignes, budget 3 s,
sans offres cadres ni actualités) ; « après » la configuration livrée.
Deux régimes : modèle (l'angle) INSTANTANÉ — les signaux entièrement sur le
chemin critique, le pire cas pour le temps de réponse — et modèle à 4 s, l'ordre
de grandeur d'un appel d'angle réel, pendant lequel les signaux tournent.
"""

from __future__ import annotations

import asyncio
import statistics
import sys
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.routers import discover as d  # noqa: E402
from app.services import provider_cache, source_cache  # noqa: E402
from app.services.rate_limiter import throttle  # noqa: E402

CALLS: dict[str, int] = {}


def _source(provider: str, latency: float, rows: list[dict], *, requests: int = 1):
    async def fetch(*_a: Any, **_kw: Any) -> list[dict]:
        CALLS[provider] = CALLS.get(provider, 0) + 1

        async def one() -> None:
            async with throttle(provider):
                await asyncio.sleep(latency)

        await asyncio.gather(*(one() for _ in range(requests)))
        return rows

    return fetch


def _rows() -> list[dict]:
    return [
        {
            "name": f"SOCIETE {i:03d} SAS",
            "siren": f"{300000000 + i}",
            "nafCode": "62.01Z",
            "sector": "Programmation informatique",
            "city": "PARIS",
            "department": "75",
            "headcountRange": "250 à 499 salariés",
            "headcountTranche": "32",
            "legalCategory": "5710",
        }
        for i in range(24)
    ]


def _install(monkey: dict, *, before: bool, angle_s: float = 0.0) -> None:
    rows = _rows()

    async def angle(*_a: Any, **_kw: Any):
        await asyncio.sleep(angle_s)
        return {"angles": []}, None

    async def gouv(filters, limit, degraded=None):
        return rows

    offer = [{"title": "Développeur Java", "date": "2026-10-10", "contractType": "CDI", "url": "https://x/1"}]
    news = [{"type": "projet", "title": "Migration", "url": "https://m/a", "published_at": "2026-10-07T08:00:00+00:00"}]
    patches = {
        "_fallback_search": gouv,
        "call_claude": angle,
        "public_tenders": _source("boamp", 0.7, []),
        "legal_signals": _source("bodacc", 0.45, [{"date": "2026-09-30", "type": "Modification"}]),
        "it_job_signals": _source("france_travail", 0.6, offer, requests=2),
        "it_job_signals_apec": AsyncMock(return_value=[]) if before else _source("apec", 0.4, []),
        "press_signals": AsyncMock(return_value=[]) if before else _source("press_rss", 0.07, news),
        "load_press_feeds": AsyncMock(return_value={}),
    }
    if not before:

        async def feeds() -> dict:
            await asyncio.sleep(1.9)
            return {}

        patches["load_press_feeds"] = feeds
    for name, value in patches.items():
        monkey[name] = getattr(d, name)
        setattr(d, name, value)
    if before:
        for name, value in (("SIGNALS_CANDIDATE_LIMIT", 5), ("SIGNALS_TIME_BUDGET_S", 3.0)):
            monkey[name] = getattr(d, name)
            setattr(d, name, value)


def _restore(monkey: dict) -> None:
    for name, value in monkey.items():
        setattr(d, name, value)
    monkey.clear()


def _run(client: TestClient) -> tuple[float, dict]:
    started = time.monotonic()
    resp = client.post("/discover/registry", json={"filters": {"department": "75"}, "limit": 24})
    elapsed = time.monotonic() - started
    assert resp.status_code == 200, resp.text
    return elapsed, resp.json()


def _summary(label: str, times: list[float], body: dict) -> None:
    cands = body["candidates"]
    searched = sum(1 for c in cands if c.get("signalsSearched"))
    with_signal = sum(1 for c in cands if c.get("signals"))
    print(
        f"{label:<34} médiane {statistics.median(times):5.2f} s  max {max(times):5.2f} s  "
        f"cherchées {searched:>2}/{len(cands)}  avec ≥1 signal {with_signal:>2}/{len(cands)}"
    )


def main() -> None:
    client = TestClient(app)
    provider_cache._redis = AsyncMock(return_value=None)  # type: ignore[method-assign]
    monkey: dict = {}

    for angle_s in (0.0, 4.0):
        for label, before in (("AVANT (5 lignes, 3 s)", True), ("APRÈS (toute la page)", False)):
            times: list[float] = []
            body: dict = {}
            for _ in range(3):
                _install(monkey, before=before, angle_s=angle_s)
                elapsed, body = _run(client)
                times.append(elapsed)
                _restore(monkey)
            _summary(f"{label}, modèle {angle_s:.0f} s", times, body)

    # Cache partagé : la même recherche, deux espaces, un magasin Postgres simulé.
    rows: dict = {}

    class MemoryStore:
        async def get(self, source: str, category: str, key: str):
            row = rows.get((source, category, key))
            return row if row and row[1] > datetime.now(UTC) else None

        async def put(self, source: str, category: str, key: str, payload: Any, ttl_s: int) -> None:
            rows[(source, category, key)] = (payload, datetime.now(UTC) + timedelta(seconds=ttl_s))

    async def _store() -> MemoryStore:
        return MemoryStore()

    source_cache._store = _store  # type: ignore[assignment]
    for space in ("espace A (froid)", "espace B (même recherche)"):
        CALLS.clear()
        _install(monkey, before=False, angle_s=4.0)
        elapsed, body = _run(client)
        _restore(monkey)
        total = sum(CALLS.values())
        print(f"{space:<34} {elapsed:5.2f} s  appels sources : {total:>3}  {dict(sorted(CALLS.items()))}")


if __name__ == "__main__":
    main()
