"""#3901.14 — deux recherches /discover IDENTIQUES et simultanées du même espace ne font qu'UN travail.

Le seau par fournisseur est partagé par tout le processus : deux pages identiques ouvertes en même temps
(double clic, deux onglets) se disputaient les mêmes jetons et chacune finissait avec moins de cartes
complètes. La seconde attend la première et reçoit sa copie. Une recherche DIFFÉRENTE (autres filtres, autre
profil) ne s'attend jamais, et rien n'est gardé une fois la recherche finie (pas un cache).
"""

from __future__ import annotations

import asyncio

import pytest

from app.routers import discover
from app.routers.discover import DiscoverFilters, DiscoverRegistryRequest, DiscoverRegistryResponse


def _request(sector: str = "industry", profile: str = "esn-a") -> DiscoverRegistryRequest:
    return DiscoverRegistryRequest(filters=DiscoverFilters(sector=sector), profile_data={"offer": profile})


@pytest.fixture
def counted(monkeypatch):
    runs: list[str] = []

    async def once(req: DiscoverRegistryRequest) -> DiscoverRegistryResponse:
        runs.append(req.filters.sector or "")
        await asyncio.sleep(0.05)
        return DiscoverRegistryResponse(candidates=[{"name": "ACME", "siren": "123456789"}])

    monkeypatch.setattr(discover, "_discover_registry_once", once)
    return runs


async def test_identical_concurrent_searches_run_once(counted) -> None:
    first, second = await asyncio.gather(
        discover.discover_registry(_request()), discover.discover_registry(_request())
    )
    assert counted == ["industry"]
    assert first.candidates == second.candidates


async def test_followers_get_their_own_copy(counted) -> None:
    first, second = await asyncio.gather(
        discover.discover_registry(_request()), discover.discover_registry(_request())
    )
    first.candidates.append({"name": "MUTATED"})
    assert len(second.candidates) == 1


async def test_different_searches_never_wait_for_each_other(counted) -> None:
    await asyncio.gather(
        discover.discover_registry(_request("industry")),
        discover.discover_registry(_request("health")),
        discover.discover_registry(_request("industry", profile="esn-b")),
    )
    assert sorted(counted) == ["health", "industry", "industry"]


async def test_nothing_is_kept_after_the_search_ends(counted) -> None:
    await discover.discover_registry(_request())
    await discover.discover_registry(_request())
    assert counted == ["industry", "industry"]


async def test_a_failure_reaches_every_waiter_and_is_not_kept(monkeypatch) -> None:
    attempts = 0

    async def boom(req: DiscoverRegistryRequest) -> DiscoverRegistryResponse:
        nonlocal attempts
        attempts += 1
        await asyncio.sleep(0.01)
        raise RuntimeError("source down")

    monkeypatch.setattr(discover, "_discover_registry_once", boom)
    results = await asyncio.gather(
        discover.discover_registry(_request()), discover.discover_registry(_request()), return_exceptions=True
    )
    assert attempts == 1
    assert all(isinstance(r, RuntimeError) for r in results)
    with pytest.raises(RuntimeError):
        await discover.discover_registry(_request())
    assert attempts == 2


async def test_a_cancelled_waiter_does_not_kill_the_search_of_the_other(counted) -> None:
    leader = asyncio.ensure_future(discover.discover_registry(_request()))
    await asyncio.sleep(0)
    follower = asyncio.ensure_future(discover.discover_registry(_request()))
    await asyncio.sleep(0.01)
    leader.cancel()
    result = await follower
    assert result.candidates and counted == ["industry"]
