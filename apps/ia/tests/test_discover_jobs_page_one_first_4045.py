"""#4045 (14/10, recette prod) — la collecte des offres sert D'ABORD les cartes de
la page affichée, dans l'ordre du classement, au débit réel du registre.

Constat : 36 entreprises en parallèle se disputaient 1 req/s ; chaque appel
portait un plafond d'attente de 6 s, donc seuls ~6 créneaux étaient servis et
tous les autres échouaient (« rate limit slot … not available »), au hasard du
rang. Maintenant : une file FIFO bornée devant le registre, l'attente du
créneau ne mange plus le plafond de l'appel.

Temps MIS À L'ÉCHELLE (÷20) : 1 req/s → un créneau toutes les 50 ms, plafond
d'appel 6 s → 0,3 s, budget Découvrir 20 s → 1,0 s."""

from __future__ import annotations

import asyncio
import time
from unittest.mock import AsyncMock

import pytest

from app.routers import discover as discover_router
from app.services import rate_limiter
from app.services.distributed_rate_limiter import RateLimitTimeout

pytestmark = pytest.mark.usefixtures("no_gc_pause")

SLOT = 0.05


class _SimulatedRegistry:
    """Un limiteur 1 req/s (mis à l'échelle) qui honore ``wait_deadline``."""

    def __init__(self) -> None:
        self.next_free = 0.0
        self.interrogated: list[str] = []
        self.refused: list[str] = []

    async def __call__(self, name: str, **_kw: object) -> list[dict]:
        now = time.monotonic()
        slot = max(now, self.next_free)
        deadline = rate_limiter._WAIT_DEADLINE.get()
        if deadline is not None and slot > deadline:
            self.refused.append(name)
            raise RateLimitTimeout("france_travail", deadline - now)
        self.next_free = slot + SLOT
        await asyncio.sleep(slot - now)
        self.interrogated.append(name)
        return []


@pytest.mark.asyncio
async def test_page_one_is_interrogated_first_at_the_registry_rate(monkeypatch: pytest.MonkeyPatch) -> None:
    registry = _SimulatedRegistry()
    monkeypatch.setattr(discover_router, "it_job_signals", registry)
    monkeypatch.setattr(discover_router, "SIGNALS_SOURCE_BUDGET_S", 0.3)
    monkeypatch.setattr(discover_router, "DISCOVER_TIME_BUDGET_S", 1.0)
    for fn in ("public_tenders", "legal_signals", "press_signals", "funding_signals"):
        monkeypatch.setattr(discover_router, fn, AsyncMock(return_value=[]))
    monkeypatch.setattr(discover_router, "load_press_feeds", AsyncMock(return_value={}))

    candidates = [{"name": f"CO{i:02d}", "siren": f"{400000000 + i}"} for i in range(36)]
    tasks = discover_router._start_signal_tasks(candidates, profile_data={})
    await asyncio.sleep(1.0)  # le budget Découvrir (mis à l'échelle)

    first_page = {f"CO{i:02d}" for i in range(24)}
    served = [n for n in registry.interrogated if n in first_page]
    assert len(served) >= 10, f"{len(served)} entreprises de la page 1 interrogées, refusées: {registry.refused}"
    assert registry.refused == []  # personne n'est jeté faute de créneau
    # Dans l'ordre du classement (aux quelques rangs près que la gigue d'ordonnancement permet).
    assert sorted(registry.interrogated[:10]) == [f"CO{i:02d}" for i in range(10)]
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)


def _quiet_other_sources(monkeypatch: pytest.MonkeyPatch) -> None:
    for fn in ("public_tenders", "legal_signals", "press_signals", "funding_signals"):
        monkeypatch.setattr(discover_router, fn, AsyncMock(return_value=[]))
    monkeypatch.setattr(discover_router, "load_press_feeds", AsyncMock(return_value={}))


@pytest.mark.asyncio
async def test_a_card_whose_jobs_source_failed_is_not_reported_as_measured_empty(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """La source d'offres a échoué (429 avalé, noté dans source_health) : la carte ne
    dit PAS « aucun signal mesuré » (``signalsSearched`` faux) et la page le DIT."""
    from app.services import source_health

    async def failing(name: str, **_kw: object) -> list[dict]:
        source_health.note_fetch_error("429")
        return []

    monkeypatch.setattr(discover_router, "it_job_signals", failing)
    _quiet_other_sources(monkeypatch)
    candidate = {"name": "ACME", "siren": "400000001"}
    tasks = discover_router._start_signal_tasks([candidate], profile_data={})
    degraded: list[dict] = []
    await discover_router._finish_signal_tasks(
        tasks, degraded, time.monotonic() + 10, profile_data={}, filters={}
    )
    assert candidate["signals"] == []
    assert candidate["signalsSearched"] is False
    assert any(e["source"] == "france_travail" for e in degraded)


@pytest.mark.asyncio
async def test_a_confirmed_empty_stays_a_measured_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(discover_router, "it_job_signals", AsyncMock(return_value=[]))
    _quiet_other_sources(monkeypatch)
    candidate = {"name": "ACME", "siren": "400000002"}
    tasks = discover_router._start_signal_tasks([candidate], profile_data={})
    degraded: list[dict] = []
    await discover_router._finish_signal_tasks(
        tasks, degraded, time.monotonic() + 10, profile_data={}, filters={}
    )
    assert candidate["signalsSearched"] is True
    assert degraded == []
