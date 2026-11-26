"""LOT (15/10) DATA-C — les agrégats d'un TERRITOIRE se gardent 24 h, communs.

L'écran Territoire, l'outil territoire de Laura et la veille territoriale
nocturne (``territory-watch``) passent tous par ``territory_overview`` : la
même question (département, commune, rayon, fenêtre) re-moissonnait quatre
sources publiques à chaque fois. Un agrégat de territoire est un fait PUBLIC,
sans rien d'un espace : il se garde 24 h, commun à tous.

Ce que ces tests tiennent (chacun sait dire NON) :
* la même question ne rappelle aucune source ; une autre maille rappelle les
  sources qui la lisent, et SEULEMENT elles (BOAMP/DECP publient au département) ;
* une source en panne n'est jamais gardée (on retente à l'appel suivant) ;
* la durée posée est celle de ``TTL_TERRITORY`` (24 h).
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.services import provider_cache
from app.services import territory_overview as svc
from app.services.data_sources.signal_errors import SignalSourceUnavailable


class FakeRedis:
    def __init__(self) -> None:
        self.store: dict[str, str] = {}
        self.ttls: dict[str, int | None] = {}

    async def get(self, key: str):
        return self.store.get(key)

    async def set(self, key: str, value: str, ex: int | None = None):
        self.store[key] = value
        self.ttls[key] = ex


@pytest.fixture
def cache():
    fake = FakeRedis()
    with patch.object(provider_cache, "_redis", AsyncMock(return_value=fake)):
        yield fake


@pytest.fixture
def calls(monkeypatch):
    counted: dict[str, int] = {"hiring": 0, "tenders": 0, "awards": 0, "count": 0}
    failing: set[str] = set()

    def counter(name: str, value):
        async def _fn(*_a, **_kw):
            counted[name] += 1
            if name in failing:
                raise SignalSourceUnavailable("Source", "injoignable")
            return value

        return _fn

    offer = {"name": "Sopra Steria", "department": "31", "signal": {"type": "hiring", "label": "Dev Java"}}
    tender = {"name": "Toulouse Métropole", "department": "31", "signal": {"type": "tender", "label": "TMA"}}
    monkeypatch.setattr(svc, "list_hiring_companies", counter("hiring", [offer]))
    monkeypatch.setattr(svc, "list_tender_buyers", counter("tenders", [tender]))
    monkeypatch.setattr(svc, "list_award_buyers", counter("awards", [tender]))
    monkeypatch.setattr(svc, "count_companies", counter("count", 965))
    counted["_failing"] = failing  # type: ignore[assignment]
    return counted


@pytest.mark.asyncio
async def test_the_same_question_calls_no_source_twice(cache, calls) -> None:
    first = await svc.territory_overview("31", since_days=90)
    second = await svc.territory_overview("31", since_days=90)
    assert first == second
    assert {k: v for k, v in calls.items() if not k.startswith("_")} == {
        "hiring": 1,
        "tenders": 1,
        "awards": 1,
        "count": 1,
    }


@pytest.mark.asyncio
async def test_a_finer_mesh_recalls_only_the_sources_that_read_it(cache, calls) -> None:
    await svc.territory_overview("31", since_days=90)
    commune = svc.TerritoryScope(department="31", commune_code="31555", commune_name="Toulouse")
    await svc.territory_overview("31", since_days=90, scope=commune)
    assert calls["hiring"] == 2 and calls["count"] == 2
    assert calls["tenders"] == 1 and calls["awards"] == 1, "BOAMP/DECP répondent au département"

    around = svc.TerritoryScope(
        department="31", commune_code="31555", commune_name="Toulouse", latitude=43.6, longitude=1.44, radius_km=10
    )
    await svc.territory_overview("31", since_days=90, scope=around)
    assert calls["hiring"] == 3 and calls["count"] == 3


@pytest.mark.asyncio
async def test_another_window_is_another_question(cache, calls) -> None:
    await svc.territory_overview("31", since_days=90)
    await svc.territory_overview("31", since_days=30)
    assert calls["hiring"] == 2 and calls["tenders"] == 2
    assert calls["count"] == 1, "le compte d'établissements ne dépend pas de la fenêtre"


@pytest.mark.asyncio
async def test_a_failed_source_is_never_kept(cache, calls) -> None:
    calls["_failing"].add("hiring")  # type: ignore[union-attr]
    first = await svc.territory_overview("31", since_days=90)
    assert first["market"]["state"] == "unavailable"
    calls["_failing"].clear()  # type: ignore[union-attr]
    second = await svc.territory_overview("31", since_days=90)
    assert calls["hiring"] == 2
    assert second["market"]["state"] != "unavailable"


@pytest.mark.asyncio
async def test_entries_live_twenty_four_hours(cache, calls) -> None:
    await svc.territory_overview("31", since_days=90)
    territory = {k: v for k, v in cache.ttls.items() if ":territory:" in k}
    assert len(territory) == 4
    assert provider_cache.TTL_TERRITORY == 24 * 3600
    # `set_json` étale l'expiration (± 10 %) pour éviter qu'un lot expire d'un coup.
    assert all(0.85 * 24 * 3600 <= ttl <= 1.15 * 24 * 3600 for ttl in territory.values())
