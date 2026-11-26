"""GA-301 — CORRECTIF B : aucun verrou anti-ruée sur clé froide.

``source_cache.py`` (``get``), ``provider_cache.py`` (``cached_json``) et
``scrape_cache.py`` (``get_markdown``/``set_markdown``) étaient tous en simple
*lire → appeler → écrire*, sans verrou : N requêtes concurrentes sur la même
clé FROIDE partaient TOUTES chez le fournisseur — et certaines de ces clés sont
payantes (Pappers, Firecrawl).

Le correctif : ``source_cache.single_flight(namespace, key, fetch)``, une
déduplication en mémoire par boucle d'événements (le premier demandeur crée sa
propre ``asyncio.Task`` pour ``fetch()`` ; tout autre demandeur CONCURRENT sur
la même clé attend cette même Task au lieu d'en lancer une seconde). Câblé
dans ``provider_cache.cached_json`` et exposé pour ``scrape_cache`` via un
nouveau combinateur ``cached_markdown`` (miroir de ``cached_json`` — la lecture
du marché est un URL, pas un JSON provider, mais le même risque de ruée
s'applique).

Cette garde prouve les TROIS choses qu'exige CLAUDE.md de toute garde
d'architecture :

1. **Elle LIT** un corpus réel et non vide : les DEUX combinateurs
   (``provider_cache.cached_json`` et ``scrape_cache.cached_markdown``) sont
   exercés, pas un seul cas isolé.
2. **Elle SAIT DIRE NON** : ``test_GA_301_without_the_lock_the_naive_pattern_fans_out``
   rejoue le PATRON D'AVANT (lire → appeler → écrire sans verrou) et prouve
   qu'il fanoutait bien vers N appels — la preuve que le test de la propriété
   « N → 1 » détecte réellement l'absence du correctif, pas un artefact du
   mock.
3. **Elle n'attrape pas ce qu'elle ne vise pas** : un appel SEUL (pas de
   concurrence) sur une clé froide continue de déclencher exactement UN appel
   — le verrou ne doit jamais ajouter un tour de fetch superflu à un appel
   isolé, ni empêcher deux clés DIFFÉRENTES de fetcher chacune la leur.

Et le risque explicitement nommé par le lot : « un verrou qui ne se relâche
pas sur exception transforme une lenteur en blocage » — prouvé par
``test_GA_301_lock_releases_on_fetch_exception`` (une erreur ne bloque pas les
appels suivants) et ``test_GA_301_lock_releases_on_cancellation`` (annuler UN
demandeur ne casse ni les autres, ni les appels futurs).
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import pytest

from app.services import provider_cache, scrape_cache, source_cache

# ── Preuve n°1 : LIT un corpus réel (les deux combinateurs) ──────────────────


@pytest.fixture(autouse=True)
def _no_redis(monkeypatch: pytest.MonkeyPatch):
    """Force le tier Redis hors-ligne (best-effort no-op) et neutralise
    l'écriture Postgres — ces tests portent sur le comptage des appels au
    FOURNISSEUR, pas sur la persistance des tiers."""
    monkeypatch.setattr(provider_cache, "_redis", AsyncMock(return_value=None))
    monkeypatch.setattr(scrape_cache, "_redis", AsyncMock(return_value=None))
    monkeypatch.setattr(source_cache, "put", AsyncMock(return_value=None))
    monkeypatch.setattr(source_cache, "get", AsyncMock(return_value=None))


async def _slow_fetch(calls: list[int], *, value: str = "v", delay: float = 0.02) -> str:
    calls.append(1)
    await asyncio.sleep(delay)
    return value


# ── provider_cache.cached_json ────────────────────────────────────────────


async def test_GA_301_provider_cache_concurrent_cold_key_collapses_to_one_call() -> None:
    calls: list[int] = []

    async def fetch():
        return await _slow_fetch(calls)

    results = await asyncio.gather(*[provider_cache.cached_json("ns", "cold-key", fetch) for _ in range(20)])

    assert len(calls) == 1, f"GA-301 : {len(calls)} appels fournisseur pour 20 demandes concurrentes — attendu 1"
    assert all(r == "v" for r in results)


async def test_GA_301_provider_cache_different_keys_each_fetch_independently() -> None:
    """Ne pas attraper ce qu'elle ne vise pas : deux clés DIFFÉRENTES ne se
    partagent jamais un verrou."""
    calls: list[int] = []

    async def fetch(tag: str):
        return await _slow_fetch(calls, value=tag)

    a, b = await asyncio.gather(
        provider_cache.cached_json("ns", "key-a", lambda: fetch("a")),
        provider_cache.cached_json("ns", "key-b", lambda: fetch("b")),
    )
    assert len(calls) == 2
    assert (a, b) == ("a", "b")


async def test_GA_301_provider_cache_a_solo_call_is_not_penalised() -> None:
    """Ne pas attraper ce qu'elle ne vise pas : un appel SEUL (pas de
    concurrence) ne doit jamais déclencher plus d'un fetch."""
    calls: list[int] = []

    async def fetch():
        return await _slow_fetch(calls, delay=0.0)

    result = await provider_cache.cached_json("ns", "solo-key", fetch)
    assert result == "v"
    assert len(calls) == 1


# ── scrape_cache.cached_markdown (le miroir pour l'URL) ──────────────────────


async def test_GA_301_scrape_cache_concurrent_cold_url_collapses_to_one_call() -> None:
    calls: list[int] = []

    async def fetch():
        return await _slow_fetch(calls, value="# markdown")

    results = await asyncio.gather(*[scrape_cache.cached_markdown("https://x.fr/cold", fetch) for _ in range(20)])
    assert len(calls) == 1, f"GA-301 : {len(calls)} scrapes réels pour 20 demandes concurrentes — attendu 1"
    assert all(r == "# markdown" for r in results)


# ── Preuve n°2 : SAIT DIRE NON — le patron d'avant fanoutait vraiment ────────


async def test_GA_301_without_the_lock_the_naive_pattern_fans_out() -> None:
    """Rejoue le PATRON D'AVANT (lire → appeler → écrire, sans verrou) pour
    prouver que le test « N concurrentes → 1 appel » détecte réellement
    l'absence du correctif : sans ``single_flight``, 20 demandes concurrentes
    sur une clé froide produisent bien 20 appels."""
    calls: list[int] = []

    async def naive_get_or_fetch(fetch):
        # get() renvoie None (froid) → appelle direct, sans dédup — le code
        # d'avant CORRECTIF B, tel que décrit dans les modules visés.
        hit = await source_cache.get("ns", "cold-key")
        if hit is not None:
            return hit
        return await fetch()

    async def fetch():
        return await _slow_fetch(calls)

    await asyncio.gather(*[naive_get_or_fetch(fetch) for _ in range(20)])
    assert len(calls) == 20, "le patron naïf devrait fan-out vers un appel par demande concurrente"


# ── Preuve n°3 : le verrou se RELÂCHE sur exception et sur annulation ────────


async def test_GA_301_lock_releases_on_fetch_exception() -> None:
    """Une erreur du fetch ne doit jamais bloquer les appels suivants sur la
    même clé — sinon un fournisseur qui répond 500 une fois gèlerait la clé
    pour toujours."""
    attempts: list[int] = []

    async def flaky_fetch():
        attempts.append(1)
        if len(attempts) == 1:
            raise RuntimeError("fournisseur en panne")
        return "ok"

    with pytest.raises(RuntimeError):
        await provider_cache.cached_json("ns", "flaky-key", flaky_fetch)

    # La clé n'est pas restée verrouillée : le prochain appel refetch et réussit.
    result = await provider_cache.cached_json("ns", "flaky-key", flaky_fetch)
    assert result == "ok"
    assert len(attempts) == 2


async def test_GA_301_lock_releases_when_all_waiters_hit_the_exception() -> None:
    """Plusieurs demandeurs CONCURRENTS sur une clé dont le fetch échoue
    reçoivent tous l'exception (pas un blocage silencieux), et la clé reste
    disponible pour un appel ultérieur."""
    attempts: list[int] = []

    async def flaky_fetch():
        attempts.append(1)
        await asyncio.sleep(0.01)
        if len(attempts) == 1:
            raise RuntimeError("fournisseur en panne")
        return "ok"

    results = await asyncio.gather(
        *[provider_cache.cached_json("ns", "flaky-concurrent", flaky_fetch) for _ in range(5)],
        return_exceptions=True,
    )
    assert all(isinstance(r, RuntimeError) for r in results), results
    assert len(attempts) == 1  # un seul fetch réel pour les 5 demandeurs concurrents

    result = await provider_cache.cached_json("ns", "flaky-concurrent", flaky_fetch)
    assert result == "ok"


async def test_GA_301_lock_releases_on_cancellation() -> None:
    """Annuler UN demandeur ne doit ni casser les autres demandeurs
    concurrents, ni empêcher un appel FUTUR sur la même clé de refetcher
    normalement — la garantie « une lenteur reste une lenteur, jamais un
    blocage »."""
    calls: list[int] = []
    started = asyncio.Event()

    async def fetch():
        calls.append(1)
        started.set()
        await asyncio.sleep(0.05)
        return "v"

    cancel_me = asyncio.create_task(provider_cache.cached_json("ns", "cancel-key", fetch))
    keep_me = asyncio.create_task(provider_cache.cached_json("ns", "cancel-key", fetch))

    await started.wait()
    cancel_me.cancel()
    with pytest.raises(asyncio.CancelledError):
        await cancel_me

    # Le second demandeur (pas annulé) obtient bien le résultat du fetch
    # partagé — l'annulation de l'un n'a pas cassé l'autre.
    assert await keep_me == "v"
    assert len(calls) == 1  # un seul fetch réel malgré l'annulation d'un waiter

    # Un appel ULTÉRIEUR sur la même clé refetche normalement (pas de verrou
    # fantôme laissé par l'annulation).
    result = await provider_cache.cached_json("ns", "cancel-key", fetch)
    assert result == "v"
    assert len(calls) == 2
