"""#4617 / #4518 — le coupe-circuit du registre public.

909 refus 429 en production : chaque employeur d'une recherche par compétence (jusqu'à 150) rappelait le
registre qui venait de refuser le précédent. Après ``FAILURE_THRESHOLD`` refus CONSÉCUTIFS (429, 5xx, réseau),
le circuit OUVRE : l'appel suivant n'atteint plus le réseau, il dit « trop de requêtes » (le cache de 30 jours
prend le relais), et au bout du refroidissement UN essai décide de refermer.

Ce qui n'ouvre PAS le circuit : un 4xx (notre requête est fautive, le registre répond), une réponse 200.
Aucun ``sleep`` réel.
"""

from __future__ import annotations

import asyncio

import httpx
import pytest

from app.services import provider_cache, rate_limiter, tool_circuit_breaker
from app.services.company_filters import CompanyDiscoveryFilters, DegradeReason
from app.services.data_sources import recherche_entreprises as re_src
from app.services.data_sources.signal_errors import SignalSourceUnavailable

_ROW = {
    "siren": "123456789",
    "nom_complet": "ACME SAS",
    "activite_principale": "62.01Z",
    "siege": {"code_postal": "31000", "libelle_commune": "TOULOUSE", "etat_administratif": "A", "departement": "31"},
}


def _resp(status: int, *, rows: list | None = None) -> httpx.Response:
    request = httpx.Request("GET", "https://registre.example/search")
    if rows is not None:
        return httpx.Response(status, json={"results": rows}, request=request)
    return httpx.Response(status, text="", request=request)


class _Client:
    def __init__(self, *responses: httpx.Response):
        self._responses = list(responses)
        self.calls = 0

    async def get(self, _url, params=None):
        self.calls += 1
        return self._responses[min(self.calls - 1, len(self._responses) - 1)]


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    rate_limiter._reset_cache_for_tests()
    re_src.REGISTRY_BREAKER.reset()

    async def _fake_sleep(seconds: float, *a, **k):
        return None

    monkeypatch.setattr(asyncio, "sleep", _fake_sleep)
    monkeypatch.setattr(re_src.random, "uniform", lambda lo, hi: lo)
    store: dict[tuple[str, str], object] = {}

    async def _set(namespace, key, value, ttl=None):
        store[(namespace, key)] = value

    async def _peek(namespace, key):
        return store.get((namespace, key))

    async def _get(namespace, key):
        return None  # le cache de ``search_companies`` ne répond jamais : chaque appel est vivant

    monkeypatch.setattr(provider_cache, "set_json", _set)
    monkeypatch.setattr(provider_cache, "peek_json", _peek)
    monkeypatch.setattr(provider_cache, "get_json", _get)
    yield store
    re_src.REGISTRY_BREAKER.reset()
    rate_limiter._reset_cache_for_tests()


async def _refuse(times: int, status: int = 429) -> None:
    for i in range(times):
        with pytest.raises(SignalSourceUnavailable):
            await re_src.search_companies(f"BOITE {status} {i}", client=_Client(_resp(status)), strict=True)


@pytest.mark.asyncio
async def test_consecutive_refusals_open_the_circuit_and_the_next_call_never_reaches_the_network():
    await _refuse(re_src.REGISTRY_FAILURE_THRESHOLD)
    client = _Client(_resp(200, rows=[_ROW]))
    with pytest.raises(SignalSourceUnavailable):
        await re_src.search_companies("SOPRA", client=client, strict=True)
    assert client.calls == 0


@pytest.mark.asyncio
async def test_says_no_below_the_threshold():
    await _refuse(re_src.REGISTRY_FAILURE_THRESHOLD - 1)
    client = _Client(_resp(200, rows=[_ROW]))
    out = await re_src.search_companies("SOPRA", client=client, strict=True)
    assert [r["siren"] for r in out] == ["123456789"]
    assert client.calls == 1


@pytest.mark.asyncio
async def test_a_success_resets_the_count():
    await _refuse(re_src.REGISTRY_FAILURE_THRESHOLD - 1)
    await re_src.search_companies("SOPRA", client=_Client(_resp(200, rows=[_ROW])), strict=True)
    await _refuse(re_src.REGISTRY_FAILURE_THRESHOLD - 1)
    client = _Client(_resp(200, rows=[_ROW]))
    await re_src.search_companies("CAPGEMINI", client=client, strict=True)
    assert client.calls == 1


@pytest.mark.asyncio
async def test_our_own_bad_request_never_opens_the_circuit():
    for i in range(re_src.REGISTRY_FAILURE_THRESHOLD + 2):
        with pytest.raises(SignalSourceUnavailable):
            await re_src.search_companies(f"MAUVAISE {i}", client=_Client(_resp(400)), strict=True)
    client = _Client(_resp(200, rows=[_ROW]))
    await re_src.search_companies("SOPRA", client=client, strict=True)
    assert client.calls == 1


@pytest.mark.asyncio
async def test_server_errors_open_it_too():
    await _refuse(re_src.REGISTRY_FAILURE_THRESHOLD, status=503)
    client = _Client(_resp(200, rows=[_ROW]))
    with pytest.raises(SignalSourceUnavailable):
        await re_src.search_companies("SOPRA", client=client, strict=True)
    assert client.calls == 0


@pytest.mark.asyncio
async def test_list_with_an_open_circuit_says_rate_limited_and_serves_the_cached_list(_env):
    filters = CompanyDiscoveryFilters(department="31")
    first = await re_src.list_companies(filters, 25, client=_Client(_resp(200, rows=[_ROW])))
    assert [r["siren"] for r in first] == ["123456789"]
    await _refuse(re_src.REGISTRY_FAILURE_THRESHOLD)
    client = _Client(_resp(200, rows=[]))
    degraded: list[dict[str, str]] = []
    out = await re_src.list_companies(filters, 25, degraded=degraded, client=client)
    assert client.calls == 0
    assert [r["siren"] for r in out] == ["123456789"]  # le cache de 30 jours, jamais une ligne inventée
    assert [e["reason"] for e in degraded] == [DegradeReason.RATE_LIMITED]


@pytest.mark.asyncio
async def test_after_the_cooldown_one_trial_closes_it(monkeypatch):
    clock = [1000.0]
    monkeypatch.setattr(tool_circuit_breaker, "_now", lambda: clock[0])
    await _refuse(re_src.REGISTRY_FAILURE_THRESHOLD)
    clock[0] += re_src.REGISTRY_COOLDOWN_S + 1
    client = _Client(_resp(200, rows=[_ROW]))
    await re_src.search_companies("SOPRA", client=client, strict=True)
    assert client.calls == 1
    again = _Client(_resp(200, rows=[_ROW]))
    await re_src.search_companies("CAPGEMINI", client=again, strict=True)
    assert again.calls == 1


@pytest.mark.asyncio
async def test_a_trial_cut_by_our_own_limiter_does_not_jam_the_circuit(monkeypatch):
    clock = [1000.0]
    monkeypatch.setattr(tool_circuit_breaker, "_now", lambda: clock[0])
    await _refuse(re_src.REGISTRY_FAILURE_THRESHOLD)
    clock[0] += re_src.REGISTRY_COOLDOWN_S + 1

    class _Limited:
        calls = 0

        async def get(self, _url, params=None):
            self.calls += 1
            raise rate_limiter.RateLimitTimeout("budget")

    with pytest.raises(SignalSourceUnavailable):
        await re_src.search_companies("SOPRA", client=_Limited(), strict=True)
    client = _Client(_resp(200, rows=[_ROW]))
    await re_src.search_companies("CAPGEMINI", client=client, strict=True)
    assert client.calls == 1  # l'essai sans verdict a rendu sa place : le suivant passe


# ── #4617 — la recherche par compétence DIT que le registre a refusé ─────────────────────────────


def test_employers_left_unidentified_by_a_refusing_registry_are_said_on_screen():
    from app.routers import discover

    degraded: list[dict] = []
    discover._say_registry_refused({"resolutionFailures": {"unavailable": 12}}, degraded)
    assert degraded == [{"source": re_src.SOURCE_NAME, "reason": DegradeReason.RATE_LIMITED}]


def test_says_nothing_when_every_employer_was_read():
    from app.routers import discover

    degraded: list[dict] = []
    discover._say_registry_refused({"resolutionFailures": {"unavailable": 0, "homonym": 3}}, degraded)
    assert degraded == []


def test_never_says_it_twice():
    from app.routers import discover

    degraded = [{"source": re_src.SOURCE_NAME, "reason": DegradeReason.NETWORK_ERROR}]
    discover._say_registry_refused({"resolutionFailures": {"unavailable": 4}}, degraded)
    assert len(degraded) == 1


# ── #4617 — un employeur dont le SIREN est connu : un refus du registre n'est pas « registre muet » ─────


@pytest.mark.asyncio
async def test_a_known_siren_refused_by_the_registry_is_unavailable_not_silent():
    from app.services import discover_skill_offers

    await _refuse(re_src.REGISTRY_FAILURE_THRESHOLD)  # circuit ouvert : le registre ne répond plus
    out = await discover_skill_offers.resolve_employer("ACME SAS", "123456789")
    assert out.identity is None
    assert out.failure == "unavailable"


@pytest.mark.asyncio
async def test_a_known_siren_the_registry_does_not_know_stays_silent():
    from app.services import discover_skill_offers
    from app.services.data_sources import registry_lookup

    async def _nothing(siren, **_):
        return None

    original = registry_lookup.identity_by_siren
    registry_lookup.identity_by_siren = _nothing
    try:
        out = await discover_skill_offers.resolve_employer("ACME SAS", "123456789")
    finally:
        registry_lookup.identity_by_siren = original
    assert out.failure == "registry_silent"
