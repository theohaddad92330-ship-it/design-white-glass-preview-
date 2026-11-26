"""#4284.13 (#3901.14) — `/discover/signals` : deux recherches identiques et simultanées font UN travail.

Le single-flight de #3901.14 ne couvrait que `/discover/registry`. Or `signals` dépense le même bucket
registre (jusqu'à 40 résolutions + la moisson) : deux onglets / un double clic se disputaient les jetons et
chacun finissait en « délai atteint ». Ce n'est pas un cache : rien n'est gardé une fois la recherche finie.
"""

from __future__ import annotations

import asyncio

import pytest

from app.routers import discover_signals as mod
from app.routers.discover_signals import DiscoverSignalsRequest, DiscoverSignalsResponse


def _request(department: str = "69", profile: str = "esn-a") -> DiscoverSignalsRequest:
    return DiscoverSignalsRequest(department=department, profile_data={"offer": profile})


@pytest.fixture
def counted(monkeypatch):
    runs: list[str] = []

    async def once(req: DiscoverSignalsRequest) -> DiscoverSignalsResponse:
        runs.append(req.department or "")
        await asyncio.sleep(0.05)
        return DiscoverSignalsResponse(candidates=[])

    monkeypatch.setattr(mod, "_discover_signals_once", once)
    return runs


async def test_identical_concurrent_signal_searches_run_once(counted) -> None:
    await asyncio.gather(mod.discover_signals(_request()), mod.discover_signals(_request()))
    assert counted == ["69"]


async def test_different_signal_searches_never_wait_for_each_other(counted) -> None:
    await asyncio.gather(
        mod.discover_signals(_request("69")),
        mod.discover_signals(_request("75")),
        mod.discover_signals(_request("69", profile="esn-b")),
    )
    assert sorted(counted) == ["69", "69", "75"]


async def test_nothing_is_kept_after_the_signal_search_ends(counted) -> None:
    await mod.discover_signals(_request())
    await mod.discover_signals(_request())
    assert counted == ["69", "69"]
