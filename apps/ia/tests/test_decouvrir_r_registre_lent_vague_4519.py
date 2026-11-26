"""Lot R point 2 (#4519) — « Data & IA + Île-de-France » : 0 compte + « Résultat non vérifiable » en 20-24 s.

Cause tranchée (voir la PR) : le coupe-circuit à 5 échecs, PAS le délai de 8 s seul. La résolution lance 8 appels
à la fois ; un registre lent les fait échouer ENSEMBLE, et cette seule vague ouvre le circuit pour les ~140
employeurs restants. Une vague de délais réseau ne compte maintenant qu'un échec ; les refus répétés, eux, ouvrent."""

from __future__ import annotations

import asyncio

import httpx
import pytest

from app.services import rate_limiter
from app.services.data_sources import recherche_entreprises as re_src
from app.services.data_sources.signal_errors import SignalSourceUnavailable

_ROW = {
    "siren": "123456789",
    "nom_complet": "ACME SAS",
    "activite_principale": "62.01Z",
    "siege": {"code_postal": "31000", "libelle_commune": "TOULOUSE", "etat_administratif": "A", "departement": "31"},
}


class _SlowClient:
    """Le registre à 9 s : chaque appel finit en délai dépassé."""

    def __init__(self) -> None:
        self.calls = 0

    async def get(self, _url, params=None):
        self.calls += 1
        raise httpx.ReadTimeout("lent")


class _OkClient:
    def __init__(self) -> None:
        self.calls = 0

    async def get(self, _url, params=None):
        self.calls += 1
        request = httpx.Request("GET", "https://registre.example/search")
        return httpx.Response(200, json={"results": [_ROW]}, request=request)


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    rate_limiter._reset_cache_for_tests()
    re_src.REGISTRY_BREAKER.reset()
    monkeypatch.setattr(re_src, "_last_network_failure_at", None)

    async def _fake_sleep(seconds: float, *a, **k):
        return None

    monkeypatch.setattr(asyncio, "sleep", _fake_sleep)
    yield
    re_src.REGISTRY_BREAKER.reset()
    rate_limiter._reset_cache_for_tests()


async def _one(name: str) -> None:
    with pytest.raises(SignalSourceUnavailable):
        await re_src.search_companies(name, client=_SlowClient(), strict=True)


@pytest.mark.asyncio
async def test_une_vague_de_delais_ne_ferme_pas_le_registre_aux_employeurs_restants() -> None:
    # Huit résolutions en parallèle, toutes en délai dépassé : au moins CINQ échecs bruts.
    await asyncio.gather(*(_one(f"EMPLOYEUR {i}") for i in range(8)))
    ok = _OkClient()
    out = await re_src.search_companies("EMPLOYEUR SUIVANT", client=ok, strict=True)
    assert ok.calls == 1  # le circuit est resté fermé : l'employeur suivant est RÉSOLU, pas refusé sans appel
    assert [r["siren"] for r in out] == ["123456789"]


@pytest.mark.asyncio
async def test_sait_dire_non_des_refus_repetes_dans_le_temps_ouvrent_toujours_le_circuit(monkeypatch) -> None:
    clock = [1000.0]
    monkeypatch.setattr(re_src.time, "monotonic", lambda: clock[0])
    for i in range(re_src.REGISTRY_FAILURE_THRESHOLD):
        clock[0] += 10.0  # des vagues séparées : le registre est vraiment en panne
        await _one(f"EMPLOYEUR {i}")
    ok = _OkClient()
    with pytest.raises(SignalSourceUnavailable):
        await re_src.search_companies("EMPLOYEUR SUIVANT", client=ok, strict=True)
    assert ok.calls == 0
