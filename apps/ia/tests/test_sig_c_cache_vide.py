"""SIG-C (11/10) — cache du vide, générique dans ``provider_cache``.

Un compte à 0 offre était re-interrogé à CHAQUE analyse (``cached_json`` ne
stockait que le « truthy ») : crédits TheirStack/Mantiks re-payés, quota à vie
Jooble brûlé. Un résultat VIDE se cache désormais (sentinelle distincte de « pas
en cache ») quand la source l'active ; une ERREUR ne se cache JAMAIS.
"""

from __future__ import annotations

from app.services import source_cache

_AGGREGATORS = ("jobs:adzuna", "jobs:jooble", "jobs:theirstack", "jobs:mantiks", "jobs:fantastic_jobs")


def test_chaque_agregateur_a_sa_propre_ligne_l2():
    """Prérequis : les cinq agrégateurs partageaient (source, catégorie) dans
    ``source_cache`` — même clé de compte ⇒ MÊME ligne Postgres : le vide de
    l'un aurait masqué les offres de l'autre. La source reste l'agrégat
    ``job_aggregators`` (métriques), la catégorie nomme le fournisseur."""
    pairs = {source_cache.split_namespace(ns) for ns in _AGGREGATORS}
    assert len(pairs) == len(_AGGREGATORS)
    assert {source for source, _ in pairs} == {"job_aggregators"}


# ── C1 — le vide se cache, l'erreur jamais ──────────────────────────────────

import json  # noqa: E402
from unittest.mock import AsyncMock, patch  # noqa: E402

import httpx  # noqa: E402
import pytest  # noqa: E402

from app.services import provider_cache, source_health  # noqa: E402
from app.services.data_sources import apec, ats_boards, france_travail  # noqa: E402
from app.services.data_sources import job_aggregators as agg  # noqa: E402

_DAY = 24 * 3600


class FakeRedis:
    def __init__(self) -> None:
        self.store: dict[str, str] = {}
        self.ttls: dict[str, int | None] = {}

    async def get(self, key: str):
        return self.store.get(key)

    async def set(self, key: str, value: str, ex: int | None = None):
        self.store[key] = value
        self.ttls[key] = ex


def _counting(value, *, degrade: str | None = None, cid: str = "run-sigc"):
    calls = {"n": 0}

    async def fetch():
        calls["n"] += 1
        if degrade:
            source_health.record_degradation(cid, source="theirstack", reason=degrade)
        return value

    return fetch, calls


async def test_vide_cache_quand_la_source_l_active() -> None:
    fake = FakeRedis()
    fetch, calls = _counting([])
    with patch.object(provider_cache, "_redis", AsyncMock(return_value=fake)):
        first = await provider_cache.cached_json("ns", "k", fetch, ttl=3 * _DAY, empty_ttl=_DAY)
        second = await provider_cache.cached_json("ns", "k", fetch, ttl=3 * _DAY, empty_ttl=_DAY)
    assert first == [] and second == []
    assert calls["n"] == 1  # le 2ᵉ appel est servi par le cache : aucun appel fournisseur


async def test_le_vide_est_une_sentinelle_distincte_de_pas_en_cache() -> None:
    fake = FakeRedis()
    fetch, _ = _counting([])
    with patch.object(provider_cache, "_redis", AsyncMock(return_value=fake)):
        assert await provider_cache.get_json("ns", "k") is None  # pas en cache
        await provider_cache.cached_json("ns", "k", fetch, empty_ttl=_DAY)
        assert await provider_cache.get_json("ns", "k") == []  # en cache, vide
    (raw,) = fake.store.values()
    assert json.loads(raw) != []  # stocké comme SENTINELLE, jamais un `[]` nu


async def test_le_vide_prend_son_propre_ttl() -> None:
    fake = FakeRedis()
    fetch, _ = _counting([])
    with patch.object(provider_cache, "_redis", AsyncMock(return_value=fake)):
        await provider_cache.cached_json("ns", "k", fetch, ttl=3 * _DAY, empty_ttl=7 * _DAY)
    (ex,) = fake.ttls.values()
    assert 0.89 * 7 * _DAY <= ex <= 1.11 * 7 * _DAY  # jitter ±10 % autour de 7 j


async def test_sans_option_le_vide_reste_non_cache() -> None:
    fake = FakeRedis()
    fetch, calls = _counting([])
    with patch.object(provider_cache, "_redis", AsyncMock(return_value=fake)):
        await provider_cache.cached_json("ns", "k", fetch)
        await provider_cache.cached_json("ns", "k", fetch)
    assert calls["n"] == 2 and fake.store == {}


@pytest.mark.parametrize("cid", ["run-sigc", ""])
async def test_une_erreur_n_est_jamais_cachee(cid: str) -> None:
    """La source a rendu `[]` APRÈS s'être déclarée dégradée (401/403/429/5xx/
    timeout) : elle n'a pas dit « rien », elle n'a rien dit. Vrai aussi sans
    identifiant de run (chemins synchrones)."""
    fake = FakeRedis()
    fetch, calls = _counting([], degrade="HTTP 503", cid=cid)
    with patch.object(provider_cache, "_redis", AsyncMock(return_value=fake)):
        await provider_cache.cached_json("ns", "k", fetch, empty_ttl=_DAY)
        await provider_cache.cached_json("ns", "k", fetch, empty_ttl=_DAY)
    assert calls["n"] == 2 and fake.store == {}


async def test_l_erreur_d_une_source_ne_contamine_pas_sa_voisine() -> None:
    """Deux sources en parallèle (asyncio.gather) : la panne de l'une ne doit
    pas empêcher de cacher le vide LÉGITIME de l'autre."""
    import asyncio

    fake = FakeRedis()
    broken, _ = _counting([], degrade="HTTP 500")
    empty, _ = _counting([])
    with patch.object(provider_cache, "_redis", AsyncMock(return_value=fake)):
        await asyncio.gather(
            provider_cache.cached_json("ns", "broken", broken, empty_ttl=_DAY),
            provider_cache.cached_json("ns", "empty", empty, empty_ttl=_DAY),
        )
    assert len(fake.store) == 1


async def test_redis_absent_comportement_actuel() -> None:
    fetch, calls = _counting([])
    put = AsyncMock()
    with (
        patch.object(provider_cache, "_redis", AsyncMock(return_value=None)),
        patch.object(provider_cache.source_cache, "put", put),
    ):
        await provider_cache.cached_json("ns", "k", fetch, empty_ttl=_DAY)
        await provider_cache.cached_json("ns", "k", fetch, empty_ttl=_DAY)
    assert calls["n"] == 2
    put.assert_not_called()


# ── C1 — chaque source l'active en une ligne, au bon TTL ─────────────────────


@pytest.mark.parametrize(
    ("fn", "expected"),
    [
        (agg._theirstack_search, _DAY),  # SIG-A : le cache vit sur la recherche paginée
        # GROUPE-FRANCE : le cache vit par ENTITÉ ; VC.2 (18/10) — un vide payé se garde une semaine.
        (agg._mantiks_entity_jobs, 7 * _DAY),
        (agg.fantastic_jobs, _DAY),
        (agg.adzuna_jobs, _DAY),
        (france_travail.it_job_signals, _DAY),
        (apec.it_job_signals_apec, _DAY),
        (ats_boards.it_job_signals_ats, _DAY),
        # 500 requêtes À VIE par clé (doc Jooble) : le vide se garde une semaine.
        (agg.jooble_jobs, 7 * _DAY),
    ],
)
def test_ttl_du_vide_par_source(fn, expected: int) -> None:
    assert provider_cache.empty_ttl_of(fn) == expected


async def test_theirstack_vide_n_est_plus_reinterroge(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("THEIRSTACK_API_KEY", "test-key")
    client = AsyncMock(spec=httpx.AsyncClient)
    client.post = AsyncMock(
        return_value=httpx.Response(200, json={"data": []}, request=httpx.Request("POST", "https://x"))
    )
    with patch.object(provider_cache, "_redis", AsyncMock(return_value=FakeRedis())):
        assert await agg.theirstack_jobs("Sigc Vide SA", client=client) == []
        calls = client.post.await_count
        assert await agg.theirstack_jobs("Sigc Vide SA", client=client) == []
    assert client.post.await_count == calls  # aucun appel de plus


async def test_theirstack_en_erreur_est_reinterroge(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("THEIRSTACK_API_KEY", "test-key")
    client = AsyncMock(spec=httpx.AsyncClient)
    client.post = AsyncMock(return_value=httpx.Response(401, json={}, request=httpx.Request("POST", "https://x")))
    with patch.object(provider_cache, "_redis", AsyncMock(return_value=FakeRedis())):
        await agg.theirstack_jobs("Sigc Erreur SA", client=client)
        calls = client.post.await_count
        await agg.theirstack_jobs("Sigc Erreur SA", client=client)
    assert client.post.await_count == 2 * calls
