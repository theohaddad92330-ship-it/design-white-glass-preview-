"""Durable Postgres cache of PUBLIC per-company source data (C5 — Matteo PDF5 §6/§12).

Two users analysing the same company re-scraped and re-paid every public source
(observed ~1,37 €/run vs ~0,35 € estimated). The Redis provider cache
(``provider_cache`` / ``scrape_cache``) already collapses repeats, but Redis on
Railway is shared with BullMQ, memory-bounded and eviction-prone — a cache that
is supposed to be the margin on the beta can't live on a best-effort LRU. This
module adds the durable tier: a ``source_cache`` Postgres table shared by every
worker/deploy, keyed by the COMPANY (SIREN / registry id / normalised name),
never by the user — multi-workspace reuse is the design, not an accident.

Ownership follows the graph's ``checkpoints*`` pattern (`app/graph/checkpoint.py`):
the IA service owns the table and creates it with idempotent DDL on first use —
NO NestJS migration. ``SOURCE_CACHE_PG_URL`` (else ``DATABASE_URL``) points the
store; with neither the store is off and callers degrade to their live fetch.

Scope rule — PUBLIC data ONLY: registry/firmo, legal notices, marchés publics,
job postings, press, tech signals, scraped public pages. NEVER user or CRM data
(no user_id in any key or payload). The single reserved ``__run__`` row family
stores a per-account *run timestamp* (an opaque account UUID, no payload) to
implement the fresh-re-run bypass below; it is never served as source data.

⚠️ This scope rule almost got contradicted once (lot 16, câble 3, 12/09/2026):
a first pass routed Apollo People-Match and SalesQL — a named PERSON's revealed
email/phone, not company firmo — through this table, reasoning that the key
(identity, no user_id) and TTL stayed unchanged. Louis reverted it: moving that
data from an EVICTABLE Redis cache to a durable, shared-across-every-deploy
Postgres table is a retention change in practice, on personal data, in a store
whose written rule says the opposite — "same key, same TTL" doesn't save it.
Apollo Organization Enrichment (``apollo:org_enrich``) stayed — it's company
firmo, not a person's contact reveal. If a future cache wants in here and its
payload can name a natural person (an email, a phone, a personal LinkedIn),
that is this exact near-miss again: it belongs in a Redis-only, evictable tier
(``apollo.py`` / ``salesql.py`` — see their own module comments), not here,
without an explicit GDPR sign-off first.

Controls:
- ``SOURCE_CACHE_DISABLED=true`` — break-glass kill switch (same pattern as
  ``JUDGE_DISABLED`` & co): all cached reads AND writes stop, every source goes
  live. Absent/empty = cache on.
- Automatic bypass: a re-run of the SAME account < 1 h (``SOURCE_CACHE_RERUN_BYPASS_S``,
  default 3600) skips cached READS for that run — a user relaunching an analysis
  wants fresh data — while write-through still refreshes the cache for everyone.

Observability: per-run hit/miss counters per source + an estimated € saving,
kept in a contextvar opened by ``begin_run`` (phase 1) and injected into the
run's ``_api_metrics`` by the research router.

Best-effort throughout: any Postgres error/timeout NEVER breaks a fetch — the
caller falls through to a live call (same guarantee as the Redis tier).
"""

from __future__ import annotations

import asyncio
import contextlib
import contextvars
import json
import logging
import os
import random
import re
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any

# Le nom de la variable vit au REGISTRE (``kill_switch.py``) et pas ici : un
# interrupteur déclaré à deux endroits est un interrupteur dont l'un des deux
# finira par ne pas avoir de surface. Ré-exporté pour les appelants existants.
from app.services.kill_switch import SOURCE_CACHE_KILL_SWITCH, disabled

logger = logging.getLogger(__name__)

# Reserved source for the per-account run stamp (fresh-re-run bypass). Never
# readable/writable through the public get/put — only ``begin_run`` touches it.
_RESERVED_PREFIX = "__"
RUN_STAMP_SOURCE = "__run__"
RUN_STAMP_CATEGORY = "rerun"
# VC.3 (18/10) — « cette société a été collectée récemment, par un espace réel » : le tampon
# COMMUNAUTAIRE que relit la veille quotidienne. Même source réservée, payload VIDE, clé = la
# société (``siren:…`` sinon ``domain:…``, jamais une raison sociale, jamais un espace).
COLLECTED_STAMP_CATEGORY = "collected"
#: VC.3 (18/10, Louis) — « récemment » = 24 h : une collecte de la même société par n'importe quel
#: espace dans cette fenêtre est RÉUTILISÉE par la veille (lectures cache) ; au-delà, la veille
#: recollecte les sources gratuites. Constante unique (GA-26).
WATCH_COMMUNITY_REUSE_S = 24 * 3600
_COMMUNITY_KEY = re.compile(r"^(?:siren:\d{9}|domain:[a-z0-9-]+(?:\.[a-z0-9-]+)+)$")

# Hard bound on any single cache round-trip: a slow/unreachable Postgres must
# cost at most this before the caller falls back to the live fetch.
_OP_TIMEOUT_S = 3.0

# Cache namespaces (as used by provider_cache/scrape_cache call sites) → the
# (source, category) columns of the table. Explicit map because the historic
# namespace strings are not uniformly "<category>:<source>".
_NAMESPACES: dict[str, tuple[str, str]] = {
    "registry:recherche_entreprises": ("recherche_entreprises", "registry"),
    "registry:recherche_entreprises:candidates": ("recherche_entreprises", "candidates"),
    "pappers:company": ("pappers", "company"),
    # Recherches par NOM (/v2/recherche) — le gros du VOLUME d'appels Pappers
    # (autocomplete, préremplissage, Découvrir). Deux catégories distinctes :
    # elles stockent des formes différentes (1 hit brut vs une liste) et ne
    # doivent jamais être servies l'une pour l'autre.
    "pappers:search:top": ("pappers", "search_top"),
    "pappers:search:suggestions": ("pappers", "search_suggestions"),
    "pappers:discovery": ("pappers", "discovery"),
    "insee:group_it": ("insee", "group_it"),
    "insee:sites": ("insee", "sites"),
    "bodacc:signals": ("bodacc", "legal"),
    "marches:boamp": ("boamp", "marches"),
    "marches:decp": ("decp", "marches"),
    "jobs:france_travail": ("france_travail", "jobs"),
    "jobs:apec": ("apec", "jobs"),
    "jobs:wttj": ("wttj", "jobs"),
    # #3885 — agrégateurs d'offres (`job_aggregators.py`), un namespace par fournisseur.
    # SIG-C (11/10) — une CATÉGORIE par fournisseur : la clé de compte est la même
    # pour les cinq, une catégorie commune les faisait partager UNE ligne Postgres.
    "jobs:adzuna": ("job_aggregators", "jobs_adzuna"),
    "jobs:jooble": ("job_aggregators", "jobs_jooble"),
    "jobs:theirstack": ("job_aggregators", "jobs_theirstack"),
    "jobs:mantiks": ("job_aggregators", "jobs_mantiks"),
    "jobs:fantastic_jobs": ("job_aggregators", "jobs_fantastic_jobs"),
    "news:brave": ("brave_news", "news"),
    "news:brave_pd": ("brave_news", "news_pd"),  # DATA-A point 2 — nouveautés du jour, TTL 1 j
    "tech:detect": ("tech_detect", "tech"),
    "tech:github_org": ("github_org", "tech"),
    "scrape:firecrawl": ("firecrawl", "scrape"),
    # Waterfall de recherche web (Serper → Tavily → Brave), un seul point de
    # cache pour tout le waterfall (data_gateway.py) — le jumeau non caché de
    # brave_search.py avant ce lot (C6, correctif C). Sans cette entrée, les
    # hits/miss de ce cache tomberaient dans le seau générique et resteraient
    # invisibles dans les métriques par SOURCE.
    "search:gateway": ("data_gateway", "search"),
    # Apollo Organization Enrichment (lot 16, câble 3 / GA-323) : firmographie
    # d'ENTREPRISE (logo, effectif, industrie, techs) — utilisait Redis SEUL,
    # sans étage durable ni compteur hit/miss, alors qu'une éviction y refait
    # dépenser un CRÉDIT PAYANT (plus coûteux qu'un scrape). Clé = le domaine,
    # la même identité déjà utilisée pour Redis — aucun user_id. ⚠️ N'AJOUTE
    # PAS ici le People-Match Apollo ni SalesQL (des révélations de contact
    # PERSONNEL, pas d'entreprise) : voir la ligne « Scope rule » tout en haut
    # de ce fichier, et la note juste en dessous.
    "apollo:org_enrich": ("apollo", "org_enrich"),
    # SIG-C (11/10) — registres pays, clé = identifiant légal (BCE, UID, n° de société, CIK).
    "registry:be_kbo": ("kbo", "registry"),
    "registry:ch_zefix": ("zefix", "registry"),
    "registry:ca_cbr": ("cbr", "federal_detail"),
    "registry:us_sec_submissions": ("sec_edgar", "submissions"),
    "registry:us_sec_financials": ("sec_edgar", "financial_profile"),
    # #4067 DECOUVRIR-COLLECTE — les faits PUBLICS rangés par ENTREPRISE (SIREN, sinon
    # domaine) et par nature, relus par Découvrir ET l'analyse complète, quel que
    # soit l'espace (`public_facts.py`). Jamais une donnée d'espace.
    "facts:jobs": ("public_facts", "jobs"),
    "facts:news": ("public_facts", "news"),
    "facts:legal": ("public_facts", "legal"),
    "facts:tenders": ("public_facts", "tenders"),
    "facts:registry": ("public_facts", "registry"),
}

# Estimated € avoided per cache HIT, per source (telemetry only — rough figures
# from agent_docs/apis.md; free sources save latency/quota, not euros).
_SAVED_EUR_PER_HIT: dict[str, float] = {
    "pappers": 0.02,  # ~0,02 €/requête API Pappers (fiche entreprise)
    "firecrawl": 0.01,  # ~0,01 €/page scrapée (1 crédit)
    "brave_news": 0.005,  # ~0,005 €/requête Brave
}


def cache_disabled() -> bool:
    """Break-glass: ``SOURCE_CACHE_DISABLED=true`` turns ALL source caching off
    (Postgres tier here + the Redis tier consulted by provider_cache/scrape_cache)."""
    return disabled(SOURCE_CACHE_KILL_SWITCH)


def split_namespace(namespace: str) -> tuple[str, str]:
    """Map a cache namespace to the table's (source, category) pair. Unknown
    namespaces store verbatim under ``source`` with an empty category."""
    return _NAMESPACES.get(namespace, (namespace, ""))


def _rerun_window_s() -> int:
    try:
        return int(os.environ.get("SOURCE_CACHE_RERUN_BYPASS_S", "3600"))
    except ValueError:
        return 3600


# ── TTL jitter (C6, correctif A) — expirations désynchronisées ──────────────
#
# Every TTL_* constant in provider_cache.py / scrape_cache.py is a FIXED
# duration. When N entries are written in the same window — the repo
# documents exactly this scenario (rate_limiter.py: "/discover/signals
# resolves up to 120 names") — a fixed TTL makes them expire TOGETHER,
# producing a re-collection spike aligned on the TTL rather than on traffic.
#
# The fix is noise applied at WRITE time only (never at read — reads must
# stay deterministic for the hit/miss counters): every write gets its OWN
# expiry, in a bounded window around the nominal duration. The nominal
# TTL_* constants stay untouched — they remain the single documented value
# compared by test_cache_ttl_doc_matches_code.py against
# agent_docs/source-cache.md; jitter only changes what actually lands in
# Redis' ``ex=`` and Postgres' ``expires_at``.
_TTL_JITTER_SPREAD = 0.1  # ±10 %


def jittered_ttl(ttl_s: int, *, spread: float = _TTL_JITTER_SPREAD) -> int:
    """Nominal TTL bruité de ``±spread`` (10 % par défaut), à appeler à
    l'ÉCRITURE uniquement. Une durée déjà invalide (<= 0, un chemin d'erreur
    amont) est renvoyée TELLE QUELLE — bruiter un TTL nul le rendrait positif
    par accident."""
    if ttl_s <= 0:
        return ttl_s
    factor = random.uniform(1 - spread, 1 + spread)
    return max(1, round(ttl_s * factor))


# ── Anti-stampede single-flight (C6, correctif B) ────────────────────────────
#
# ``get() -> live fetch -> write()`` had no lock anywhere: N concurrent
# requests on the same COLD key all went to the provider — some of those keys
# are billed per call (Pappers, Firecrawl). This collapses concurrent
# identical (namespace, key) fetches into ONE real call: the first caller
# creates its OWN asyncio Task for ``fetch()``; every other concurrent caller
# on the same key awaits that SAME task via ``asyncio.shield`` instead of
# firing a second one.
#
# ``asyncio.shield`` matters here: without it, cancelling ONE waiter's own
# Task would call ``.cancel()`` on the shared fetch Task too (asyncio's
# ``Task.cancel()`` propagates to whatever Future/Task it is currently
# suspended on) — killing the fetch for every OTHER waiter. Shielding means a
# cancelled waiter only stops waiting; the shared fetch keeps running for
# everyone else. A ``add_done_callback`` releases the slot on ANY completion
# reason (success, exception, or the shared task itself being cancelled) —
# never a lock that can outlive its fetch.
_inflight: dict[str, asyncio.Task[Any]] = {}


def _inflight_key(namespace: str, key: str) -> str:
    return f"{namespace}\x00{key}"


async def single_flight(namespace: str, key: str, fetch: Callable[[], Awaitable[Any]]) -> tuple[Any, bool]:
    """Get-or-join a shared fetch for ``(namespace, key)``.

    Returns ``(value, is_new)`` — ``is_new`` is True only for the caller that
    actually created the fetch (the "winner"), so ONLY that caller writes the
    result to the durable cache tiers (avoids N redundant Redis/Postgres
    writes on a stampede). ``fetch``'s exception re-raises to every waiter,
    exactly like an uncached call would.
    """
    map_key = _inflight_key(namespace, key)
    task = _inflight.get(map_key)
    is_new = task is None
    if is_new:
        task = asyncio.ensure_future(fetch())
        _inflight[map_key] = task

        def _release(done: asyncio.Task[Any]) -> None:
            if _inflight.get(map_key) is done:
                del _inflight[map_key]
            # Tous les waiters ont pu partir (budget dépassé, annulation) avant
            # la fin du fetch : une issue attendue (ex. scrape 403) resterait
            # « never retrieved » → asyncio la journalise en error → Sentry.
            # Les waiters encore là la reçoivent par ``shield`` ; on ne fait ici
            # que marquer l'exception comme lue.
            if not done.cancelled():
                done.exception()

        task.add_done_callback(_release)
    value = await asyncio.shield(task)
    return value, is_new


# ── Postgres store (owner = IA service, like the graph's checkpoints*) ───────

_DDL_STATEMENTS = (
    """
    CREATE TABLE IF NOT EXISTS source_cache (
        company_key TEXT NOT NULL,
        source      TEXT NOT NULL,
        category    TEXT NOT NULL DEFAULT '',
        payload     JSONB NOT NULL,
        fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at  TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (source, category, company_key)
    )
    """,
    "CREATE INDEX IF NOT EXISTS source_cache_expires_at_idx ON source_cache (expires_at)",
)
# #4067 — « on archive, on ne supprime pas » : un fait public périmé n'est plus
# SERVI (filtre `expires_at` à la lecture) mais reste en base ; la purge ne balaie
# que les réponses brutes de fournisseurs.
_PURGE_SQL = "DELETE FROM source_cache WHERE expires_at < now() AND source <> 'public_facts'"
_SELECT_SQL = (
    "SELECT payload, expires_at FROM source_cache "
    "WHERE source = %s AND category = %s AND company_key = %s AND expires_at > now()"
)
# #4045.4 (14/10) — lecture PÉRIMÉE, pour le repli « donnée accumulée » : la
# ligne existe encore (« on archive, on ne supprime pas », `_PURGE_SQL`
# ci-dessus l'exempte déjà), seul `get()` la filtre à la lecture. Bornée par
# `fetched_at`, jamais `expires_at` (périmée PAR DÉFINITION) — un appelant
# fixe sa propre fenêtre de repli (ex. 30 j pour une offre d'emploi), plus
# large que la fraîcheur normale du cache (7 j).
_SELECT_STALE_SQL = (
    "SELECT payload, fetched_at FROM source_cache "
    "WHERE source = %s AND category = %s AND company_key = %s "
    "AND fetched_at > now() - make_interval(secs => %s) "
    "ORDER BY fetched_at DESC LIMIT 1"
)
# COMPETENCE-TROUVE (20/10) — les OFFRES déjà rangées (faits publics « jobs », clé SIREN) qui citent
# une compétence : un balayage borné par `LIMIT`, sur la seule famille partagée (jamais une donnée
# d'espace, `public_facts` refuse d'en écrire), récentes d'après leur date de COLLECTE.
_SEARCH_JOBS_SQL = (
    "SELECT company_key, payload FROM source_cache "
    "WHERE source = 'public_facts' AND category = 'jobs' AND company_key LIKE 'siren:%%' "
    "AND fetched_at > now() - make_interval(secs => %s) AND payload::text ILIKE %s "
    "ORDER BY fetched_at DESC LIMIT %s"
)
# #4420.4 b — lignes lues au plus quand un filtre de zone précède la coupe (lecture base, aucun fournisseur).
_ZONE_SCAN_LIMIT = 2000
_UPSERT_SQL = (
    "INSERT INTO source_cache (company_key, source, category, payload, fetched_at, expires_at) "
    "VALUES (%s, %s, %s, %s, now(), now() + make_interval(secs => %s)) "
    "ON CONFLICT (source, category, company_key) DO UPDATE SET "
    "payload = EXCLUDED.payload, fetched_at = EXCLUDED.fetched_at, expires_at = EXCLUDED.expires_at"
)


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)


async def _connect(url: str) -> Any:
    """Open one autocommit psycopg connection. Isolated so tests can fake it.
    Imported lazily (checkpoint.py pattern): only paid for when a URL is set."""
    import psycopg

    return await psycopg.AsyncConnection.connect(url, autocommit=True, connect_timeout=5)


class _PgStore:
    """One lazily-opened, lock-serialised connection. The idempotent DDL runs on
    (re)connect — exactly how the graph's ``AsyncPostgresSaver.setup()`` owns its
    ``checkpoints*`` tables. Any error resets the connection for the next call."""

    def __init__(self, url: str) -> None:
        self.url = url
        self._conn: Any = None
        self._lock = asyncio.Lock()

    async def _ensure_conn_locked(self) -> Any:
        if self._conn is None or getattr(self._conn, "closed", False):
            conn = await _connect(self.url)
            for stmt in _DDL_STATEMENTS:
                await conn.execute(stmt)
            try:
                # Opportunistic sweep: dead rows are never SELECTed (the reads
                # filter on expires_at) but this keeps the table bounded.
                await conn.execute(_PURGE_SQL)
            except Exception as exc:  # noqa: BLE001 — purge is a nicety
                logger.debug("source_cache: expired-row purge failed: %s", exc)
            self._conn = conn
            logger.info("source_cache: Postgres store ready (table source_cache)")
        return self._conn

    async def _reset_locked(self) -> None:
        conn, self._conn = self._conn, None
        if conn is not None:
            with contextlib.suppress(Exception):  # already resetting
                await conn.close()

    async def get(self, source: str, category: str, key: str) -> tuple[Any, datetime] | None:
        """Fresh (payload, expires_at) for the row, or None (absent/expired)."""
        async with self._lock:
            try:
                conn = await self._ensure_conn_locked()
                cur = await conn.execute(_SELECT_SQL, (source, category, key))
                row = await cur.fetchone()
            except Exception:
                await self._reset_locked()
                raise
        if not row:
            return None
        return row[0], row[1]

    async def get_stale(self, source: str, category: str, key: str, max_age_s: int) -> tuple[Any, datetime] | None:
        """(payload, fetched_at) même PÉRIMÉ, s'il a moins de ``max_age_s``. None
        si la ligne n'existe pas ou est plus vieille — jamais une exception."""
        async with self._lock:
            try:
                conn = await self._ensure_conn_locked()
                cur = await conn.execute(_SELECT_STALE_SQL, (source, category, key, float(max_age_s)))
                row = await cur.fetchone()
            except Exception:
                await self._reset_locked()
                raise
        if not row:
            return None
        return row[0], row[1]

    async def search_jobs(
        self, needle: str, max_age_s: int, limit: int, keep: Callable[[Any], bool] | None = None
    ) -> list[tuple[str, Any]]:
        """(company_key, payload) des offres partagées récentes dont le texte contient ``needle``.

        #4420.4 b — ``keep`` (la zone) s'applique AVANT la coupe à ``limit`` : le balayage lit jusqu'à
        ``_ZONE_SCAN_LIMIT`` lignes récentes, dans la MÊME requête, et ne garde que ``limit`` lignes retenues."""
        async with self._lock:
            try:
                conn = await self._ensure_conn_locked()
                sql_limit = max(int(limit), _ZONE_SCAN_LIMIT) if keep else int(limit)
                cur = await conn.execute(_SEARCH_JOBS_SQL, (float(max_age_s), f"%{needle}%", sql_limit))
                rows = await cur.fetchall()
            except Exception:
                await self._reset_locked()
                raise
        hits = [(str(row[0]), row[1]) for row in rows or []]
        return [hit for hit in hits if keep(hit[1])][: int(limit)] if keep else hits

    async def put(self, source: str, category: str, key: str, payload: Any, ttl_s: int) -> None:
        from psycopg.types.json import Jsonb

        wrapped = Jsonb(payload, dumps=_json_dumps)
        async with self._lock:
            try:
                conn = await self._ensure_conn_locked()
                await conn.execute(_UPSERT_SQL, (key, source, category, wrapped, float(ttl_s)))
            except Exception:
                await self._reset_locked()
                raise


_store_obj: _PgStore | None = None


def _pg_url() -> str | None:
    """``SOURCE_CACHE_PG_URL`` wins so the cache can live in a dedicated DB;
    else the app's ``DATABASE_URL``; else None → store off."""
    return os.environ.get("SOURCE_CACHE_PG_URL") or os.environ.get("DATABASE_URL") or None


async def _store() -> _PgStore | None:
    """Lazy singleton store, or None when no Postgres is configured."""
    global _store_obj
    url = _pg_url()
    if not url:
        return None
    if _store_obj is None or _store_obj.url != url:
        _store_obj = _PgStore(url)
    return _store_obj


# ── Per-run observability + fresh-re-run bypass (contextvar-scoped) ──────────

_run_stats: contextvars.ContextVar[dict[str, Any] | None] = contextvars.ContextVar(
    "source_cache_run_stats", default=None
)


def _fresh_stats() -> dict[str, Any]:
    return {"hits": {}, "misses": {}, "estimated_saved_eur": 0.0, "bypassed": False, "community_reuse": False}


def _community_key(company_key: str | None) -> str | None:
    key = (company_key or "").strip()
    return key if _COMMUNITY_KEY.match(key) else None


async def begin_run(*, account_id: str, company: str = "", company_key: str | None = None, watch: bool = False) -> None:
    """Open the run's cache context: reset hit/miss counters and decide the
    fresh-re-run bypass — if the SAME account was analysed < 1 h ago, cached
    READS are skipped for this run (the user asked for fresh data) while
    write-through keeps refreshing the cache for everyone else.

    Must be awaited BEFORE the collector fans out its source tasks so the
    spawned tasks inherit (and share) the stats object via the context copy.
    Best-effort: any store error leaves the run un-bypassed with zeroed stats.

    VC.3 (18/10) — ``watch`` (veille quotidienne) : le contournement « relance < 1 h » est le
    geste d'un humain, la veille ne l'hérite pas. Elle relit le tampon COMMUNAUTAIRE de
    ``company_key`` (:func:`mark_collected`) : présent (< ``WATCH_COMMUNITY_REUSE_S``) → elle
    réutilise la collecte (lectures cache) ; absent, ou sans clé de société → elle recollecte
    les sources GRATUITES (``reads_bypassed_for`` ; une source payée n'est jamais relancée).
    """
    stats = _fresh_stats()
    _run_stats.set(stats)
    if cache_disabled():
        return
    store = await _store()
    # #3989.10 — « le plus de cache possible » : la clé du tampon est l'ENTREPRISE seule
    # (réutilisable par tous les espaces) ; le lien au compte reste côté espace. L'ancienne
    # forme (clé = account_id) est encore LUE le temps de la transition, plus jamais écrite.
    name = " ".join((company or "").lower().split())
    legacy_key = (account_id or "").strip()
    key = f"co:{name}" if name else legacy_key
    if store is None or not key:
        return
    try:
        async with asyncio.timeout(_OP_TIMEOUT_S):
            fresh = await store.get(RUN_STAMP_SOURCE, RUN_STAMP_CATEGORY, key)
            if fresh is None and legacy_key and key != legacy_key:
                fresh = await store.get(RUN_STAMP_SOURCE, RUN_STAMP_CATEGORY, legacy_key)
            if watch:
                community = _community_key(company_key)
                reused = (
                    community is not None
                    and (await store.get(RUN_STAMP_SOURCE, COLLECTED_STAMP_CATEGORY, community)) is not None
                )
                stats["community_reuse"] = reused
                stats["bypassed"] = not reused
                logger.info("watch_community outcome=%s", "reuse" if reused else "recollect")
            elif fresh is not None:
                stats["bypassed"] = True
                logger.info(
                    "Source cache: re-run of the same company < %d min ('%s') — bypassing cached reads",
                    _rerun_window_s() // 60,
                    company or key,
                )
            # Stamp payload is EMPTY on purpose (public cache: no user data) —
            # the row only carries "this company ran at fetched_at".
            await store.put(RUN_STAMP_SOURCE, RUN_STAMP_CATEGORY, key, {}, _rerun_window_s())
    except Exception as exc:  # noqa: BLE001 — cache is best-effort
        logger.debug("source_cache begin_run failed (continuing uncached): %s", exc)


async def mark_collected(company_key: str | None) -> None:
    """VC.3 (18/10) — tamponne « cette société vient d'être collectée » pour la veille des autres
    espaces, ``WATCH_COMMUNITY_REUSE_S``. Payload VIDE : ni espace, ni compte, ni coût (GA-43).
    Sans clé de société valide (SIREN / domaine) : rien. Best-effort, ne lève jamais.

    La démo n'y passe jamais : un espace ``is_demo`` est refusé par l'API AVANT tout appel IA."""
    community = _community_key(company_key)
    if community is None or cache_disabled():
        return
    store = await _store()
    if store is None:
        return
    try:
        async with asyncio.timeout(_OP_TIMEOUT_S):
            await store.put(RUN_STAMP_SOURCE, COLLECTED_STAMP_CATEGORY, community, {}, WATCH_COMMUNITY_REUSE_S)
    except Exception as exc:  # noqa: BLE001 — cache is best-effort
        logger.debug("source_cache mark_collected failed: %s", exc)


def community_reused() -> bool:
    """VC.3 — cette relecture de veille réutilise-t-elle une collecte communautaire récente ?"""
    stats = _run_stats.get()
    return bool(stats and stats.get("community_reuse"))


# LOT (15/10) DATA-A point 3 — le contournement « relance < 1 h » ne vaut QUE pour les sources
# GRATUITES (registres, légal, marchés, offres publiques, GitHub) : relancer une analyse ne doit
# jamais repayer Pappers, Firecrawl, Brave, un agrégateur d'offres… (cache COMMUN 30 j, Louis 15/10).
# Un namespace inconnu est PAYANT par défaut : la liste blanche est ce qui est gratuit.
_FREE_NAMESPACE_PREFIXES: tuple[str, ...] = (
    "registry:",
    "insee:",
    "bodacc:",
    "marches:",
    "jobs:france_travail",
    "jobs:apec",
    "jobs:wttj",
    "tech:github_org",
)


#: #4430 (Louis 21/10) — les namespaces PAYÉS dont la lecture est contournée pour UNE collecte fraîche
#: décidée par ``fresh_jobs`` (cache commun de plus de 7 jours, sous ses plafonds). Vide partout ailleurs.
_fresh_paid_reads: contextvars.ContextVar[tuple[str, ...]] = contextvars.ContextVar("fresh_paid_reads", default=())


@contextlib.contextmanager
def fresh_paid_reads(namespaces: tuple[str, ...]):
    """#4430 — dans ce bloc, ``namespaces`` (sources payées) ne sont plus RELUS : la collecte repart
    au réseau et sa réponse ÉCRASE l'entrée commune. Seul ``fresh_jobs`` l'ouvre, sous ses plafonds."""
    token = _fresh_paid_reads.set(tuple(namespaces))
    try:
        yield
    finally:
        _fresh_paid_reads.reset(token)


def reads_bypassed_for(namespace: str) -> bool:
    """Le contournement de relance s'applique-t-il à CE namespace ? Faux pour toute source payante,
    sauf dans une collecte fraîche ouverte par ``fresh_paid_reads`` (#4430)."""
    fresh = _fresh_paid_reads.get()
    if fresh and namespace.startswith(fresh):
        return True
    return reads_bypassed() and namespace.startswith(_FREE_NAMESPACE_PREFIXES)


def reads_bypassed() -> bool:
    """True when this run deliberately skips cached reads (fresh re-run < 1 h)."""
    stats = _run_stats.get()
    return bool(stats and stats.get("bypassed"))


def record_hit(namespace: str) -> None:
    """Count a cache hit (either tier) for the run report + € savings estimate."""
    stats = _run_stats.get()
    if stats is None:
        return
    source, _ = split_namespace(namespace)
    stats["hits"][source] = stats["hits"].get(source, 0) + 1
    stats["estimated_saved_eur"] += _SAVED_EUR_PER_HIT.get(source, 0.0)


def record_miss(namespace: str) -> None:
    """Count a cache miss (a real network call happened) for the run report."""
    stats = _run_stats.get()
    if stats is None:
        return
    source, _ = split_namespace(namespace)
    stats["misses"][source] = stats["misses"].get(source, 0) + 1


def run_stats() -> dict[str, Any]:
    """Snapshot of this run's cache counters (zeroed shape when no run is open)."""
    stats = _run_stats.get() or _fresh_stats()
    return {
        "hits": dict(stats["hits"]),
        "misses": dict(stats["misses"]),
        "hit_count": sum(stats["hits"].values()),
        "miss_count": sum(stats["misses"].values()),
        "estimated_saved_eur": round(stats["estimated_saved_eur"], 4),
        "bypassed": bool(stats["bypassed"]),
    }


# ── Durable get/put (consulted by provider_cache / scrape_cache) ─────────────


async def get(namespace: str, key: str) -> tuple[Any, int] | None:
    """Fresh cached (payload, remaining_ttl_s) for (namespace, key), or None.

    None on: empty key, kill switch, fresh-re-run bypass, no store, expired row,
    any Postgres error (best-effort — callers fall through to the live fetch).
    """
    if not key or cache_disabled() or reads_bypassed_for(namespace):
        return None
    source, category = split_namespace(namespace)
    if source.startswith(_RESERVED_PREFIX):
        return None
    store = await _store()
    if store is None:
        return None
    try:
        async with asyncio.timeout(_OP_TIMEOUT_S):
            row = await store.get(source, category, str(key))
    except Exception as exc:  # noqa: BLE001 — cache is best-effort
        logger.debug("source_cache get failed for %s/%s: %s", namespace, key, exc)
        return None
    if row is None:
        return None
    payload, expires_at = row
    remaining = int((expires_at - datetime.now(UTC)).total_seconds())
    if remaining <= 0:
        return None
    return payload, remaining


async def get_stale(namespace: str, key: str, max_age_s: int) -> tuple[Any, datetime] | None:
    """#4045.4 — (payload, fetched_at) même PÉRIMÉ, dans la fenêtre de REPLI
    ``max_age_s`` (jamais la fraîcheur normale du cache) : la donnée accumulée
    est un intrant du traitement quand la collecte LIVE échoue ou est coupée
    (doctrine Louis 12/10), pas une donnée servie comme fraîche.

    Ignore volontairement le bypass « fresh re-run » (:func:`reads_bypassed`) :
    il décide de préférer le LIVE à un cache normal, pas d'interdire un repli
    sur panne — refuser la donnée accumulée au moment précis où elle sert ne
    protégerait rien. Respecte toujours le coupe-circuit (:func:`cache_disabled`).
    """
    if not key or cache_disabled():
        return None
    source, category = split_namespace(namespace)
    if source.startswith(_RESERVED_PREFIX):
        return None
    store = await _store()
    if store is None:
        return None
    try:
        async with asyncio.timeout(_OP_TIMEOUT_S):
            row = await store.get_stale(source, category, str(key), max_age_s)
    except Exception as exc:  # noqa: BLE001 — cache is best-effort
        logger.debug("source_cache get_stale failed for %s/%s: %s", namespace, key, exc)
        return None
    if row is None:
        return None
    return row[0], row[1]


async def put(namespace: str, key: str, payload: Any, ttl_s: int) -> None:
    """Write-through a successful fetch (TTL-bounded upsert). Only call with a
    non-empty PUBLIC payload — never cache errors/empties, never user data."""
    if not key or payload is None or cache_disabled():
        return
    source, category = split_namespace(namespace)
    if source.startswith(_RESERVED_PREFIX):
        return
    store = await _store()
    if store is None:
        return
    try:
        async with asyncio.timeout(_OP_TIMEOUT_S):
            await store.put(source, category, str(key), payload, int(ttl_s))
    except Exception as exc:  # noqa: BLE001 — cache is best-effort
        logger.debug("source_cache put failed for %s/%s: %s", namespace, key, exc)


async def search_job_offers(
    term: str, *, max_age_s: int, limit: int, keep: Callable[[Any], bool] | None = None
) -> list[tuple[str, Any]]:
    """COMPETENCE-TROUVE — (clé ``siren:…|variante``, payload) des offres du cache commun qui citent ``term``.

    Lecture seule, bornée (``limit``), best-effort : sans Postgres, coupe-circuit posé ou erreur → ``[]``
    (le tirage continue sur les sources vivantes). Le mot est échappé : ``%``/``_`` ne deviennent jamais
    des jokers SQL. Le tri fin (mot entier, date de l'offre, stage) est fait par l'appelant."""
    needle = re.sub(r"([%_\\])", r"\\\1", (term or "").strip())
    if len(needle) < 2 or cache_disabled():
        return []
    store = await _store()
    if store is None:
        return []
    try:
        async with asyncio.timeout(_OP_TIMEOUT_S):
            return (
                await store.search_jobs(needle, max_age_s, limit, keep)
                if keep
                else await store.search_jobs(needle, max_age_s, limit)
            )
    except Exception as exc:  # noqa: BLE001 — cache is best-effort
        logger.debug("source_cache search_job_offers failed: %s", type(exc).__name__)
        return []
