"""#4617 / #4518.2 / #4518.3 — le registre public refuse (429) : on réessaie sous sa limite,
on sert le cache de 30 jours, on DIT l'incomplétude, et on journalise le corps du refus.

Aucun ``sleep`` réel : l'attente du limiteur est capturée.
"""

from __future__ import annotations

import asyncio
import logging
import time

import httpx
import pytest

from app.services import provider_cache, rate_limiter
from app.services.company_filters import CompanyDiscoveryFilters, DegradeReason
from app.services.data_sources import recherche_entreprises as re_src
from app.services.data_sources.signal_errors import SignalSourceUnavailable

_SECRET_URL = "https://registre.example/search?api_key=SECRET-KEY-123&q=sopra"
_ROW = {
    "siren": "123456789",
    "nom_complet": "ACME SAS",
    "activite_principale": "62.01Z",
    "siege": {"code_postal": "31000", "libelle_commune": "TOULOUSE", "etat_administratif": "A", "departement": "31"},
}


def _resp(status: int, *, headers: dict | None = None, text: str | None = None, rows: list | None = None):
    request = httpx.Request("GET", _SECRET_URL)
    if rows is not None:
        return httpx.Response(status, json={"results": rows}, headers=headers, request=request)
    return httpx.Response(status, text=text or "", headers=headers, request=request)


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
    slept: list[float] = []

    async def _fake_sleep(seconds: float, *a, **k):
        slept.append(seconds)

    monkeypatch.setattr(asyncio, "sleep", _fake_sleep)
    monkeypatch.setattr(re_src.random, "uniform", lambda lo, hi: hi)  # jitter au maximum : borne vérifiable
    store: dict[tuple[str, str], object] = {}

    async def _set(namespace, key, value, ttl=None):
        store[(namespace, key)] = (value, ttl)

    async def _peek(namespace, key):
        hit = store.get((namespace, key))
        return hit[0] if hit else None

    monkeypatch.setattr(provider_cache, "set_json", _set)
    monkeypatch.setattr(provider_cache, "peek_json", _peek)
    yield {"slept": slept, "store": store}
    rate_limiter._reset_cache_for_tests()


@pytest.mark.asyncio
async def test_a_429_is_retried_once_outside_a_budget_too(_env):
    client = _Client(_resp(429, headers={"retry-after": "1"}), _resp(200, rows=[_ROW]))
    out = await re_src.search_companies("SOPRA", client=client)
    assert client.calls == 2
    assert [r["siren"] for r in out] == ["123456789"]
    # l'attente a été FAITE (capturée), bornée : 1 s de Retry-After + jitter ≤ 25 %
    assert any(1.0 <= s <= 1.3 for s in _env["slept"]), _env["slept"]


@pytest.mark.asyncio
async def test_a_persistent_429_is_retried_once_not_in_a_tight_loop(_env):
    client = _Client(_resp(429, headers={"retry-after": "1"}))
    out = await re_src.search_companies("SOPRA", client=client)
    assert out == []
    assert client.calls == 2  # une seule nouvelle tentative, jamais une boucle


@pytest.mark.asyncio
async def test_back_off_adds_bounded_jitter():
    re_src._back_off_from(_resp(429, headers={"retry-after": "4"}))
    left = rate_limiter.get_throttle("recherche_entreprises")._cooldown_until - time.monotonic()
    assert 4.0 < left <= 4.0 * 1.25 + 0.05


@pytest.mark.asyncio
async def test_a_long_retry_after_is_not_waited_out_in_a_retry(_env):
    # Retry-After 120 : le registre demande plus que ce qu'on attend en ligne — pas de réessai, c'est DIT.
    client = _Client(_resp(429, headers={"retry-after": "120"}), _resp(200, rows=[_ROW]))
    with pytest.raises(SignalSourceUnavailable):
        await re_src.search_companies("SOPRA", client=client, strict=True)
    assert client.calls == 1
    assert not any(s > 60 for s in _env["slept"])


@pytest.mark.asyncio
async def test_refusal_body_is_logged_truncated_but_never_the_url_or_the_exception_text(caplog, _env):
    body = '{"erreur":"parametre tranche_effectif_salarie invalide"}' + "x" * 2000
    client = _Client(_resp(400, text=body))
    caplog.set_level(logging.WARNING)
    with pytest.raises(SignalSourceUnavailable) as raised:
        await re_src.search_companies("SOPRA", client=client, strict=True)
    logged = "\n".join(r.getMessage() for r in caplog.records)
    assert "tranche_effectif_salarie invalide" in logged  # le fournisseur nomme le champ fautif : on le lit
    assert len(logged) < 1500  # tronqué
    assert "SECRET-KEY-123" not in logged and "registre.example" not in logged
    assert "SECRET-KEY-123" not in str(raised.value) and "registre.example" not in str(raised.value)


@pytest.mark.asyncio
async def test_list_companies_serves_the_30_day_cache_when_the_registry_refuses_and_says_so(_env):
    filters = CompanyDiscoveryFilters(q="acme")
    ok_sink: list = []
    rows = await re_src.list_companies(filters, 5, degraded=ok_sink, client=_Client(_resp(200, rows=[_ROW])))
    assert [r["siren"] for r in rows] == ["123456789"] and ok_sink == []
    (_value, ttl), = _env["store"].values()
    assert ttl == provider_cache.TTL_FIRMO  # 30 jours

    sink: list = []
    served = await re_src.list_companies(
        filters, 5, degraded=sink, client=_Client(_resp(429, headers={"retry-after": "1"}))
    )
    assert [r["siren"] for r in served] == ["123456789"]  # le cache, pas un vide
    # l'incomplétude est NOMMÉE : le refus reste au registre des dégradations
    assert {"source": re_src.SOURCE_NAME, "reason": DegradeReason.RATE_LIMITED} in sink


@pytest.mark.asyncio
async def test_list_companies_without_cache_stays_empty_and_says_so(_env):
    sink: list = []
    rows = await re_src.list_companies(
        CompanyDiscoveryFilters(q="acme"), 5, degraded=sink, client=_Client(_resp(429, headers={"retry-after": "1"}))
    )
    assert rows == []
    assert any(e["reason"] == DegradeReason.RATE_LIMITED for e in sink)


@pytest.mark.asyncio
async def test_an_empty_answer_is_never_cached(_env):
    rows = await re_src.list_companies(CompanyDiscoveryFilters(q="acme"), 5, client=_Client(_resp(200, rows=[])))
    assert rows == [] and _env["store"] == {}
