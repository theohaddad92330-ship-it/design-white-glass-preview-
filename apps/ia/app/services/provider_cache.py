"""Global company-scoped provider cache.

Public firmographic data — Pappers, INSEE, BODACC, marchés publics, tech-detect,
company news — is the SAME for every user and changes slowly, yet every analysis
re-fetches it live: re-spending paid credits (Pappers) and re-paying latency even
when a teammate just analysed the same company. This caches those fetches
GLOBALLY, keyed by the company identity (SIREN / normalised name / URL) with NO
user in the key, so the scrape/firmo happens ONCE and is reused everywhere. The
per-user interpretation (strategy/plan/score/messages) stays uncached here.

Two tiers (C5), both best-effort — any error NEVER breaks a fetch, we fall
through to a live call:

- L1 Redis (reuses the distributed rate-limiter's pooled client) — fast, but
  shared with BullMQ and eviction-prone;
- L2 Postgres (``source_cache`` table, see ``app/services/source_cache.py``) —
  durable across workers/deploys. Writes go through to BOTH tiers; an L2 hit
  backfills L1 with the REMAINING ttl so Redis can never outlive the Postgres
  expiry.

``source_cache`` also carries the run controls: the ``SOURCE_CACHE_DISABLED``
break-glass turns both tiers off, a fresh re-run of the same account (< 1 h)
skips reads but keeps write-through, and every hit/miss is counted into the
run's ``_api_metrics``. Values are JSON-serialisable (the exact provider payload).
"""

from __future__ import annotations

import asyncio
import functools
import hashlib
import json
import logging
import os
import re
import time
import uuid
from collections.abc import Awaitable, Callable
from typing import Any

from app.services import source_cache, source_health
from app.services.distributed_rate_limiter import RedisUnavailable, get_client, redis_url

logger = logging.getLogger(__name__)

# Volatility-tiered TTLs (seconds) — every cached namespace expires on a tier
# matched to how fast its data actually changes, so Bellum NEVER serves dead data
# (Louis: "jamais de données mortes cachées"). A shorter tier = fresher but more
# refetches; a longer tier = fewer calls but staler. All env-overridable for tuning.
# Rationale per tier: agent_docs/source-cache.md (C5).
_DAY = 24 * 3600
TTL_FIRMO = int(os.getenv("CACHE_TTL_FIRMO_S", str(30 * _DAY)))  # registre/firmo (Pappers, INSEE, recherche): 30 j
TTL_SIGNALS = int(os.getenv("CACHE_TTL_SIGNALS_S", str(30 * _DAY)))  # legal/marchés (BODACC, DECP, BOAMP): 30 j (#3989, Louis 15/10)
TTL_TECH = int(os.getenv("CACHE_TTL_TECH_S", str(30 * _DAY)))  # tech stack / GitHub org: 30 j (15/10)
# #4067 DECOUVRIR-COLLECTE (Louis 13/10) — « offres ~7 j, actualités ~14 j, registre
# ~30 j » : ces TTL SONT la fraîcheur des faits publics partagés (`public_facts.py`),
# réglée ici et nulle part ailleurs. Avant : offres 3 j, actualités 24 h.
# 15/10 (Louis) — crédits TheirStack épuisés en 5 jours : TOUT fournisseur payé
# (offres, recherche web, presse, tech, contact acheté) se garde 30 j ; seul le VIDE reste court.
# CACHE-API (Louis 15/10) — « un même appel n'est JAMAIS payé deux fois en 30 jours ».
# UNE constante par réglage (GA-26) : la presse Brave (appel payant) ET la fraîcheur du fait
# public « actualités » partagent TTL_NEWS — les deux valent 30 j depuis le 15/10.
TTL_NEWS = int(os.getenv("CACHE_TTL_NEWS_S", str(30 * _DAY)))  # presse/news (Brave News inclus): 30 j (15/10)
TTL_JOBS = int(os.getenv("CACHE_TTL_JOBS_S", str(30 * _DAY)))  # offres d'emploi, TOUTES sources: 30 j (15/10)
TTL_SEARCH = int(os.getenv("CACHE_TTL_SEARCH_S", str(30 * _DAY)))  # recherche web payante (Brave/Serper/Tavily): 30 j (15/10)
# LOT (15/10) DATA-A point 2 — la veille quotidienne : Brave News ``freshness=pd``, HORS du cache 30 j
# (la presse 30 j reste TTL_NEWS, une seule constante — GA-26).
TTL_BRAVE_NEWS_FRESH = int(os.getenv("CACHE_TTL_BRAVE_NEWS_FRESH_S", str(1 * _DAY)))  # nouveautés du jour: 1 j
# Contact acheté (Apollo/SalesQL, Redis SEUL — jamais Postgres, cf. apollo.py lot 16) : 30 j.
TTL_CONTACT = int(os.getenv("CACHE_TTL_CONTACT_S", str(30 * _DAY)))
# Registry search BY NAME (Pappers /v2/recherche): 24 h. Deliberately NOT
# TTL_FIRMO. `get_company(siren)` is keyed by an identity that already exists and
# whose registry facts move over months — 30 j is right there. A name SEARCH is a
# query over an index that GROWS every day: cache it 30 j and a company registered
# last week stays invisible for a month, in the very autocomplete that is the
# onboarding entry point ("je ne trouve pas ma boîte"). 24 h is the longest window
# over which "ce nom → ce SIREN" is safe to freeze: a SIREN never changes within a
# day, and a new registration surfaces the next day at worst.
TTL_REGISTRY_SEARCH = int(os.getenv("CACHE_TTL_REGISTRY_SEARCH_S", str(1 * _DAY)))
# CACHE-LLM (Louis 15/10) — la RÉPONSE d'un appel LLM NEUTRE (classe A, liste
# blanche de `llm_response_cache`) : 30 j. Sa clé porte l'empreinte du prompt et
# l'entrée normalisée — un prompt modifié change la clé, rien ne se sert périmé
# par le prompt ; seule l'entrée vieillit, au rythme du registre.
TTL_LLM = int(os.getenv("CACHE_TTL_LLM_S", str(30 * _DAY)))
#: LOT (15/10) DATA-C — un AGRÉGAT de territoire (offres, AO, marchés, compte
#: d'ESN) pour une question (département, commune, rayon, fenêtre). 24 h : les
#: sources publient au jour ; l'écran, Laura et la veille nocturne le partagent.
# #4674 — l'identité d'un employeur (nom normalisé → SIREN) : une entreprise n'a qu'un SIREN, le relire à chaque
# recherche par compétence était le plus petit tuyau de Découvrir (2 req/s). Un seul réglage, un seul endroit.
TTL_EMPLOYER_IDENTITY = int(os.getenv("CACHE_TTL_EMPLOYER_IDENTITY_S", str(90 * _DAY)))  # nom → identité registre: 90 j
TTL_TERRITORY = int(os.getenv("CACHE_TTL_TERRITORY_S", str(1 * _DAY)))
#: #4386 — le résultat d'une recherche de PERSONNE par nom (cascade base de contacts →
#: registre → web), par requête normalisée : 24 h. Court : un poste change, un profil
#: se publie ; jamais écrit quand une source est tombée pendant la recherche.
TTL_PERSON_NAME_SEARCH = int(os.getenv("CACHE_TTL_PERSON_NAME_SEARCH_S", str(1 * _DAY)))

# SIG-C (11/10) — durée de vie d'un résultat VIDE (une source l'active avec
# `empty_ttl=`). Plus court que le résultat plein : « rien aujourd'hui » se périme
# plus vite qu'une offre publiée. Jooble : 500 requêtes À VIE par clé (doc) — son
# vide se garde une semaine.
TTL_EMPTY_JOBS = 1 * _DAY
TTL_EMPTY_JOOBLE = 7 * _DAY
# VC.2 (18/10) — Mantiks facture 1 crédit par entité ACHETÉE, même quand elle n'a aucune offre :
# un vide gardé 1 jour était racheté chaque jour par la veille. Gardé 7 jours (Louis 18/10).
TTL_EMPTY_MANTIKS = 7 * _DAY
# LOT (15/10) DATA-A point 8 — « pas d'organisation GitHub pour cette société » est une réponse (60 req/h anonymes) : gardé 7 j.
TTL_EMPTY_TECH = 7 * _DAY

# #4722 (TS-A) — le VERROU single-flight entre processus d'un appel payé au résultat : durée de vie du verrou
# (un appelant tombé ne gèle pas la clé : il expire seul) et pas de relecture d'un attendeur. Un réglage, un endroit.
LOCK_TTL_S = float(os.getenv("PROVIDER_LOCK_TTL_S", "90"))
LOCK_POLL_S = 0.1

_DEFAULT_TTL = TTL_FIRMO  # namespaces that don't pass an explicit tier
_PREFIX = "provider:"
# SIG-C — la SENTINELLE d'un vide caché : distincte de « pas en cache » (None) et
# d'une valeur réelle. `get_json` la déballe en la valeur vide d'origine.
_EMPTY_MARK = "__provider_cache_empty__"


#: CACHE-SOURCES (15/10) — mesure : UNE ligne INFO par requête d'une source d'offres, pour
#: vérifier en production que les crédits ne repartent pas (hit = servi du cache, aucun appel ;
#: live_call_paid_source / live_call = appel émis ; pour une source facturée à l'offre
#: ce n'est PAS « crédit consommé » : le coût réel est dans les métriques du run, jamais ici). Jamais la clé, le SIREN, le nom ni une valeur.
_JOBS_NAMESPACES = ("jobs:", "facts:jobs")
_PAID_PER_OFFER = frozenset({"jobs:theirstack", "jobs:fantastic_jobs", "jobs:mantiks"})


def _log_source_outcome(namespace: str, outcome: str) -> None:
    if not namespace.startswith(_JOBS_NAMESPACES):
        return
    if outcome == "call":
        outcome = "live_call_paid_source" if namespace in _PAID_PER_OFFER else "live_call"
    source = namespace.split(":", 1)[1].replace(":", "_")
    logger.info("jobs_source_cache source=%s outcome=%s", source, outcome)


def linkedin_identity(url: str) -> str:
    """Le profil, pas l'écriture de l'URL : schéma, ``www.``/sous-domaine pays, slash final et
    paramètres de suivi ne font pas une autre personne (donc pas un second crédit)."""
    text = url.strip().lower()
    text = re.sub(r"^[a-z]+://", "", text)
    text = re.sub(r"[?#].*$", "", text).rstrip("/")
    match = re.match(r"^(?:[a-z0-9-]+\.)?linkedin\.com/(.*)$", text)
    return f"linkedin.com/{match.group(1)}" if match else text


def caching_disabled() -> bool:
    """Le coupe-circuit global (``SOURCE_CACHE_DISABLED``) — pour les caches Redis-seuls qui ne
    doivent pas importer ``source_cache`` (RGPD, garde GA-323 : ``apollo.py``)."""
    return source_cache.cache_disabled()


def log_call(family: str, *, hit: bool) -> None:
    """CACHE-API — UNE ligne INFO par appel : ``<famille> cache=hit|miss payé=oui|non``.

    ``family`` est le NAMESPACE (jamais la clé : une clé peut porter un nom ou un domaine,
    et un e-mail ou un téléphone n'a rien à faire dans un journal)."""
    logger.info("%s cache=%s payé=%s", family, "hit" if hit else "miss", "non" if hit else "oui")


def _wrap_empty(value: Any) -> dict[str, Any]:
    return {_EMPTY_MARK: True, "value": value}


def _unwrap(payload: Any) -> Any:
    if isinstance(payload, dict) and payload.get(_EMPTY_MARK) is True:
        return payload.get("value")
    return payload


async def _redis():
    """Pooled redis client, or None when caching is unavailable (best-effort)."""
    url = redis_url()
    if not url:
        return None
    try:
        return await get_client(url)
    except (RedisUnavailable, Exception) as exc:  # noqa: BLE001 — cache is best-effort
        logger.debug("Provider cache: Redis unavailable (%s) — caching off", exc)
        return None


def _key(namespace: str, key: str) -> str:
    return f"{_PREFIX}{namespace}:{hashlib.sha256(key.encode('utf-8')).hexdigest()}"


def _lock_key(namespace: str, key: str) -> str:
    return f"{_PREFIX}lock:{namespace}:{hashlib.sha256(key.encode('utf-8')).hexdigest()}"


async def _try_lock(r: Any, lock: str, token: str) -> bool | None:
    """``True`` : verrou pris ; ``False`` : tenu par un autre ; ``None`` : Redis ne sait pas (on n'attend pas)."""
    try:
        return bool(await r.set(lock, token, nx=True, px=max(int(LOCK_TTL_S * 1000), 1)))
    except Exception as exc:  # noqa: BLE001 — le verrou est un confort, jamais un point de panne
        logger.debug("Provider lock unavailable (%s) — no lock", exc)
        return None


async def _unlock(r: Any, lock: str, token: str) -> None:
    """Libère SEULEMENT le verrou qu'on a pris : expiré et repris par un autre, il n'est pas à nous."""
    try:
        if await r.get(lock) == token:
            await r.delete(lock)
    except Exception as exc:  # noqa: BLE001 — au pire le verrou expire seul
        logger.debug("Provider unlock failed: %s", exc)


async def single_flight_shared(
    namespace: str, key: str, produce: Callable[[], Awaitable[Any]]
) -> tuple[Any, bool]:
    """#4722 — UN seul ``produce()`` payant par clé, entre PROCESSUS (Redis ``SET NX PX``).

    Rend ``(valeur, produit)``. Le gagnant du verrou appelle ``produce()`` — qui écrit le cache lui-même,
    AVANT que le verrou tombe. Un attendeur relit le cache dès que le verrou tombe et rend ce que le gagnant
    a rangé (``produit`` faux). Rien rangé (gagnant tombé ou levé) ⇒ l'attendeur retente le verrou. Le verrou
    expire (``PROVIDER_LOCK_TTL_S``) et un appel qui lève le libère : aucune clé gelée. Sans Redis ou Redis en
    panne : ``produce()`` seul, comme avant."""
    r = await _redis()
    if r is None:
        return await produce(), True
    lock, token = _lock_key(namespace, key), uuid.uuid4().hex
    deadline = time.monotonic() + LOCK_TTL_S
    while True:
        taken = await _try_lock(r, lock, token)
        if taken is None:
            return await produce(), True
        if taken:
            try:
                return await produce(), True
            finally:
                await _unlock(r, lock, token)
        while time.monotonic() < deadline and await r.get(lock) is not None:
            await asyncio.sleep(LOCK_POLL_S)
        hit = await peek_json(namespace, key)
        if hit is not None:
            _log_source_outcome(namespace, "coalesced")
            return hit, False
        if time.monotonic() >= deadline:  # le détenteur ne rend rien : on ne gèle pas la clé
            return await produce(), True


async def get_json(namespace: str, key: str) -> Any | None:
    """Cached value for (namespace, key), or None on miss / no cache / bad JSON.

    Lookup order: L1 Redis → L2 Postgres (durable). Counts one hit or one miss
    into the run's source-cache stats (a miss = a real network call follows).
    Break-glass / fresh-re-run bypass short-circuit to None (live fetch)."""
    if not key:
        return None
    if source_cache.cache_disabled():
        log_call(namespace, hit=False)
        return None
    if source_cache.reads_bypassed_for(namespace):
        source_cache.record_miss(namespace)  # deliberate live call (fresh re-run)
        log_call(namespace, hit=False)
        return None
    r = await _redis()
    if r is not None:
        try:
            raw = await r.get(_key(namespace, key))
            if raw:
                source_cache.record_hit(namespace)
                _log_source_outcome(namespace, "hit")
                log_call(namespace, hit=True)
                return _unwrap(json.loads(raw))
        except Exception as exc:  # noqa: BLE001 — best-effort
            logger.debug("Provider cache get failed for %s/%s: %s", namespace, key, exc)
    entry = await source_cache.get(namespace, key)
    if entry is not None:
        payload, remaining_s = entry
        source_cache.record_hit(namespace)
        _log_source_outcome(namespace, "hit")
        log_call(namespace, hit=True)
        if r is not None:
            # Backfill L1 with the REMAINING ttl so Redis never outlives the
            # Postgres expiry (a fresh full TTL would extend staleness).
            try:
                await r.set(
                    _key(namespace, key),
                    json.dumps(payload, ensure_ascii=False, default=str),
                    ex=max(remaining_s, 1),
                )
            except Exception as exc:  # noqa: BLE001 — backfill is a nicety
                logger.debug("Provider cache L1 backfill failed for %s/%s: %s", namespace, key, exc)
        return _unwrap(payload)
    source_cache.record_miss(namespace)
    log_call(namespace, hit=False)
    return None


async def cache_available() -> bool:
    """Un cache (Redis ou Postgres) est-il branché ? Un seul contrôle pour qui s'apprête à
    faire plusieurs lectures : sans cache, chacune ne ferait que relire l'environnement."""
    return (await _redis()) is not None or (await source_cache._store()) is not None


async def peek_json(namespace: str, key: str) -> Any | None:
    """Comme :func:`get_json` mais SANS compter ni hit ni miss (et sans rétro-remplir
    L1) : une lecture de curiosité — « l'analyse a-t-elle déjà rangé ça ? » — n'est pas
    un appel réseau évité ni à venir, elle ne doit pas fausser les statistiques du run."""
    if not key or source_cache.cache_disabled() or source_cache.reads_bypassed_for(namespace):
        return None
    r = await _redis()
    if r is not None:
        try:
            raw = await r.get(_key(namespace, key))
            if raw:
                return _unwrap(json.loads(raw))
        except Exception as exc:  # noqa: BLE001 — best-effort
            logger.debug("Provider cache peek failed for %s/%s: %s", namespace, key, exc)
    entry = await source_cache.get(namespace, key)
    return _unwrap(entry[0]) if entry is not None else None


async def get_json_stale(namespace: str, key: str, max_age_s: int) -> Any | None:
    """#4045.4 — la valeur PÉRIMÉE la plus récente, dans une fenêtre de REPLI
    plus large que la fraîcheur normale (``max_age_s``), ou ``None``.

    Postgres (L2) SEUL : Redis (L1) EXPIRE ses clés lui-même — une clé périmée
    n'y existe déjà plus, il n'y a donc rien à lire de périmé à ce niveau. Ne
    compte ni hit ni miss dans les statistiques du run : ce n'est pas le cache
    normal, c'est le dernier recours d'une source tombée."""
    if not key:
        return None
    entry = await source_cache.get_stale(namespace, key, max_age_s)
    if entry is None:
        return None
    payload, _fetched_at = entry
    return _unwrap(payload)


async def set_json(namespace: str, key: str, value: Any, ttl: int | None = None) -> None:
    """Write-through a JSON-serialisable value to BOTH tiers (best-effort,
    TTL-bounded). Only call on a successful, non-empty fetch — never cache
    errors / empty results (SIG-C : un vide passe par la sentinelle de
    ``cached_json(empty_ttl=…)``, jamais par un appel direct).

    The TTL actually written is JITTERED (±10 %, ``source_cache.jittered_ttl``)
    around the nominal ``ttl`` — anti-thundering-herd (C6, correctif A): N
    entries written in the same window must NOT all expire together. The
    nominal ``TTL_*`` constants stay the ones documented/compared against
    ``agent_docs/source-cache.md``; only the value actually sent to Redis'
    ``ex=`` and Postgres' ``expires_at`` is bruited.
    """
    if not key or value is None:
        return
    if source_cache.cache_disabled():
        return
    ttl_s = source_cache.jittered_ttl(ttl or _DEFAULT_TTL)
    r = await _redis()
    if r is not None:
        try:
            await r.set(_key(namespace, key), json.dumps(value, ensure_ascii=False, default=str), ex=ttl_s)
        except Exception as exc:  # noqa: BLE001 — best-effort
            logger.debug("Provider cache set failed for %s/%s: %s", namespace, key, exc)
    await source_cache.put(namespace, key, value, ttl_s)


async def cached_json(
    namespace: str,
    key: str,
    fetch: Callable[[], Awaitable[Any]],
    ttl: int | None = None,
    empty_ttl: int | None = None,
) -> Any:
    """Get-or-fetch: return the cached value, else call ``fetch()`` (async), cache a
    TRUTHY result and return it. ``fetch`` re-raises (callers keep their own error
    handling); an empty/falsy result is returned but NOT cached. With no key or no
    Redis this degrades to a plain ``fetch()``.

    SIG-C (11/10) — ``empty_ttl`` : la source déclare qu'un résultat VIDE est une
    réponse (« rien chez nous ») et le cache sous une sentinelle pendant
    ``empty_ttl`` secondes. Jamais quand le fetch s'est déclaré en ERREUR
    (``record_degradation`` / ``note_fetch_error`` pendant le fetch) : une source
    en panne n'a pas dit « rien ». Jamais sans Redis : le comportement actuel.

    A cache MISS goes through ``source_cache.single_flight`` (C6, correctif
    B) — anti-stampede: N concurrent callers on the same cold key collapse
    into ONE real ``fetch()``, and only the caller that actually triggered it
    writes the result through (avoids N redundant cache writes on top of the
    N avoided provider calls).
    """
    if key:
        hit = await get_json(namespace, key)
        if hit is not None:
            return hit
        async def produce() -> Any:
            with source_health.watch_fetch_errors() as errors:
                value = await fetch()
            # Rangé ICI, sous le verrou : l'attendeur qui le relit à sa chute le trouve (#4722).
            if value:
                await set_json(namespace, key, value, ttl)
            elif empty_ttl and value is not None and not errors and await _redis() is not None:
                await set_json(namespace, key, _wrap_empty(value), empty_ttl)
            return value

        (value, produced), is_winner = await source_cache.single_flight(
            namespace, key, lambda: single_flight_shared(namespace, key, produce)
        )
        _log_source_outcome(namespace, "call" if is_winner and produced else "coalesced")
        return value
    return await fetch()


async def cached_limited(
    namespace: str,
    key: str,
    limit: int,
    fetch: Callable[[int], Awaitable[list[Any]]],
    ttl: int | None = None,
) -> list[Any]:
    """CACHE-API — get-or-fetch d'une LISTE dont la longueur est un paramètre d'AFFICHAGE.

    La clé est l'objet seul (``key``) : ``limit`` n'y entre jamais. L'entrée porte la
    limite avec laquelle elle a été payée ; une lecture avec une limite plus petite se
    FILTRE (``[:limit]``), une plus grande n'est re-payée que si la source avait de quoi
    donner plus (entrée pleine). Une liste vide n'est jamais écrite."""
    limit = max(1, int(limit))
    if key:
        hit = await get_json(namespace, key)
        if isinstance(hit, dict) and isinstance(hit.get("items"), list):
            items, stored = hit["items"], int(hit.get("limit") or 0)
            if stored >= limit or len(items) < stored:
                return items[:limit]
    value = await fetch(limit)
    if key and value:
        await set_json(namespace, key, {"limit": limit, "items": list(value)}, ttl)
    return value


def cached_by(
    namespace: str,
    key_fn: Callable[..., str | None],
    ttl: int | None = None,
    empty_ttl: int | None = None,
) -> Callable:
    """Decorator that caches an async provider fn's JSON-serialisable result
    GLOBALLY, keyed by ``key_fn(*args, **kwargs)`` (the company identity — no user).

    One line to cache a company-scoped fetch everywhere:
        @cached_by("jobs:ft", lambda company, **_: normalize(company), ttl=TTL_JOBS)
        async def it_job_signals(company, ...): ...

    A cache HIT skips the wrapped fn entirely (no provider call). An empty key or a
    falsy result is never cached — unless ``empty_ttl`` is set (SIG-C, see
    ``cached_json``). Best-effort: no Redis → straight passthrough, so tests and
    prod both keep working."""

    def decorator(fn: Callable[..., Awaitable[Any]]) -> Callable[..., Awaitable[Any]]:
        @functools.wraps(fn)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            key = key_fn(*args, **kwargs)
            if not key:
                return await fn(*args, **kwargs)
            return await cached_json(namespace, str(key), lambda: fn(*args, **kwargs), ttl, empty_ttl)

        wrapper.__provider_cache_empty_ttl__ = empty_ttl  # type: ignore[attr-defined]
        return wrapper

    return decorator


def empty_ttl_of(fn: Callable[..., Any]) -> int | None:
    """Le TTL du vide déclaré par ``@cached_by(..., empty_ttl=…)`` — None s'il n'y en a pas."""
    return getattr(fn, "__provider_cache_empty_ttl__", None)
