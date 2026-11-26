"""#4617.6 — fin des 503 sur ``POST /ia/discover/registry``.

Étape en cause (lue dans le code, étape par étape) : la mémoire de marché (``_with_market_memory``) résout jusqu'à
30 noms au registre, 5 à la fois, APRÈS la collecte et HORS de tout budget — ni ``wait_deadline``, ni ``wait_for``.
Un registre lent y ajoutait ses délais à ceux de la collecte jusqu'au couperet de l'API (60 s) : 503. Le correctif
borne l'étape, rend les noms déjà résolus et NOMME ce qui manque (``degraded``), jamais un 503.
"""

from __future__ import annotations

import asyncio
import time
from unittest.mock import patch

from app.routers import discover as d
from app.services.company_filters import DegradeReason
from app.services.discover_skill_offers import EmployerResolution


def _names(n: int) -> list[d.MarketMemoryName]:
    return [d.MarketMemoryName(name=f"Societe {i}", label="Java", date="2026-08") for i in range(n)]


async def _slow_for_some(name: str, siren=None, *, department=None):
    index = int(name.rsplit(" ", 1)[1])
    if index >= 5:  # les cinq premiers répondent ; les suivants dépassent tout budget
        await asyncio.sleep(30)
    return EmployerResolution({"siren": f"{100000000 + index}", "name": name.upper(), "city": "LYON"})


def test_une_etape_lente_rend_un_partiel_nomme_jamais_un_blocage() -> None:
    req = d.DiscoverRegistryRequest(marketMemoryNames=_names(12))
    degraded: list[dict] = []
    started = time.monotonic()
    with patch.object(d, "resolve_employer", _slow_for_some):
        asyncio.run(d._with_market_memory(req, degraded, deadline=time.monotonic() + 0.3))
    assert time.monotonic() - started < 2  # l'étape rend la main à son budget, elle n'attend pas 30 s
    assert [c.siren for c in req.commonBaseCandidates] == [f"{100000000 + i}" for i in range(5)]  # le partiel est gardé
    assert degraded == [{"source": "market-memory", "reason": DegradeReason.TIME_BUDGET}]  # et NOMMÉ
    assert req.marketMemoryNames == []


def test_une_etape_rapide_ne_degrade_rien() -> None:
    async def fast(name: str, siren=None, *, department=None):
        return EmployerResolution({"siren": "123456789", "name": "ACME", "city": "LYON"})

    req = d.DiscoverRegistryRequest(marketMemoryNames=_names(1))
    degraded: list[dict] = []
    with patch.object(d, "resolve_employer", fast):
        asyncio.run(d._with_market_memory(req, degraded, deadline=time.monotonic() + 5))
    assert [c.siren for c in req.commonBaseCandidates] == ["123456789"] and degraded == []
