"""#4490.2 — « Arrêter » côté web : quand le client se déconnecte, /discover/registry et /discover/signals
s'arrêtent entre leurs étapes payantes. Aucun appel payant ne part après l'arrêt."""

from __future__ import annotations

import asyncio

import pytest
from fastapi import HTTPException

from app.routers import discover, discover_signals
from app.routers.discover import DiscoverFilters, DiscoverRegistryRequest, DiscoverRegistryResponse
from app.routers.discover_signals import DiscoverSignalsRequest, DiscoverSignalsResponse


class _Request:
    """Un client qui se déconnecte après ``after`` interrogations."""

    def __init__(self, after: int) -> None:
        self._after = after
        self.polls = 0

    async def is_disconnected(self) -> bool:
        self.polls += 1
        return self.polls > self._after


def _slow_steps(paid: list[int]):
    async def work(*_args, **_kwargs):
        for step in range(50):  # 50 « étapes payantes » de 100 ms (la déconnexion est vue au bout d.1 s)
            paid.append(step)
            await asyncio.sleep(0.1)
        return None

    return work


async def test_registry_stops_paid_steps_when_client_disconnects(monkeypatch) -> None:
    paid: list[int] = []
    work = _slow_steps(paid)

    async def once(_req):
        await work()
        return DiscoverRegistryResponse(candidates=[])

    monkeypatch.setattr(discover, "_discover_registry_once", once)
    req = DiscoverRegistryRequest(filters=DiscoverFilters(sector="industry"), profile_data={"offer": "stop"})
    with pytest.raises(HTTPException) as caught:
        await discover.discover_registry(req, _Request(after=1))
    assert caught.value.status_code == 499
    stopped_at = len(paid)
    await asyncio.sleep(0.5)
    assert len(paid) == stopped_at, "une étape payante est partie APRÈS la déconnexion"
    assert stopped_at < 50


async def test_signals_stops_paid_steps_when_client_disconnects(monkeypatch) -> None:
    paid: list[int] = []
    work = _slow_steps(paid)

    async def once(_req):
        await work()
        return DiscoverSignalsResponse(candidates=[])

    monkeypatch.setattr(discover_signals, "_discover_signals_once", once)
    req = DiscoverSignalsRequest(sinceDays=90, limit=25, profile_data={"offer": "stop"})
    with pytest.raises(HTTPException) as caught:
        await discover_signals.discover_signals(req, _Request(after=1))
    assert caught.value.status_code == 499
    stopped_at = len(paid)
    await asyncio.sleep(0.5)
    assert len(paid) == stopped_at
    assert stopped_at < 50


async def test_a_connected_client_still_gets_its_answer(monkeypatch) -> None:
    async def once(_req):
        await asyncio.sleep(0.05)
        return DiscoverRegistryResponse(candidates=[{"name": "ACME", "siren": "123456789"}])

    monkeypatch.setattr(discover, "_discover_registry_once", once)
    req = DiscoverRegistryRequest(filters=DiscoverFilters(sector="health"), profile_data={"offer": "ok"})
    resp = await discover.discover_registry(req, _Request(after=10_000))
    assert len(resp.candidates) == 1
