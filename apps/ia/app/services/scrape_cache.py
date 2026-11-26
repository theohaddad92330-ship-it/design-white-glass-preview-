"""Per-URL Firecrawl scrape cache.

Firecrawl is the research bottleneck — rpm-limited (20/min), slow per page AND
the #2 paid line of a run (~0,01 €/page). Re-analysing a company, or two
companies sharing a URL (a sector portal, a press article), re-scrapes the same
pages. This caches the scraped markdown by URL so those repeats are skipped.

Two tiers (C5), both best-effort — a cache miss or any backend error NEVER
breaks scraping, we just fall through to a live scrape:

- L1 Redis when ``REDIS_URL`` is set (reuses the distributed rate-limiter's
  pooled client) — fast but eviction-prone;
- L2 Postgres (``source_cache`` table, source=``firecrawl``) — durable across
  workers/deploys, shared by every workspace (the key is the URL, never the
  user). An L2 hit backfills L1 with the remaining ttl.

Controls come from ``source_cache``: ``SOURCE_CACHE_DISABLED`` break-glass,
fresh-re-run (< 1 h) read bypass, per-run hit/miss counters. Quality is
unchanged: the cached markdown is the exact content Firecrawl returned.
"""

from __future__ import annotations

import hashlib
import logging
import os
from collections.abc import Awaitable, Callable

from app.services import provider_cache, source_cache
from app.services.distributed_rate_limiter import RedisUnavailable, get_client, redis_url

logger = logging.getLogger(__name__)

# 30 days (15/10, Louis): Firecrawl is paid per page and TheirStack's credits were
# gone in 5 days — every paid provider now keeps its result 30 j (was 7 j, C5).
# Trade-off assumed: the press/job pages of the scrape set can be up to a month old;
# the freshest signals come from the dated sources. Env-overridable for tuning.
# Rationale: agent_docs/source-cache.md.
_TTL_SECONDS = int(os.getenv("SCRAPE_CACHE_TTL_S", str(30 * 24 * 3600)))
_PREFIX = "scrape:md:"
_NAMESPACE = "scrape:firecrawl"  # → source_cache (source="firecrawl", category="scrape")


async def _redis():
    """Pooled redis client, or None when caching is unavailable (best-effort)."""
    url = redis_url()
    if not url:
        return None
    try:
        return await get_client(url)
    except (RedisUnavailable, Exception) as exc:  # noqa: BLE001 — cache is best-effort
        logger.debug("Scrape cache: Redis unavailable (%s) — caching off", exc)
        return None


def normalize_url(url: str) -> str:
    """CACHE-API (15/10) — la page, pas l'écriture de son adresse : fragment (``#…``), slash
    final et paramètres de suivi (``utm_*``, ``fbclid``, ``gclid``) ne font pas une autre page."""
    text = (url or "").strip()
    text = text.split("#", 1)[0]
    base, _, query = text.partition("?")
    kept = [
        part
        for part in query.split("&")
        if part and not part.lower().startswith(("utm_", "fbclid=", "gclid=", "mc_cid=", "mc_eid="))
    ]
    base = base.rstrip("/") if base.count("/") > 2 else base
    return base + ("?" + "&".join(kept) if kept else "")


def _key(url: str) -> str:
    return _PREFIX + hashlib.sha256(normalize_url(url).encode("utf-8")).hexdigest()


async def get_markdown(url: str) -> str | None:
    """Cached markdown for ``url``, or None on miss / no cache. Counts one
    hit or one miss into the run's source-cache stats (a miss = a live scrape
    follows). Break-glass forces a live scrape (a fresh re-run does NOT: Firecrawl is paid)."""
    if source_cache.cache_disabled():
        provider_cache.log_call(_NAMESPACE, hit=False)
        return None
    # LOT (15/10) DATA-A point 3 — Firecrawl est PAYANT (1 crédit/page) : une relance < 1 h ne le
    # contourne pas (`reads_bypassed_for` est faux pour lui), le cache commun 30 j répond.
    r = await _redis()
    if r is not None:
        try:
            cached = await r.get(_key(url))
            if cached:
                source_cache.record_hit(_NAMESPACE)
                provider_cache.log_call(_NAMESPACE, hit=True)
                return cached
        except Exception as exc:  # noqa: BLE001 — best-effort
            logger.debug("Scrape cache get failed for %s: %s", url, exc)
    entry = await source_cache.get(_NAMESPACE, normalize_url(url))
    if entry is not None:
        markdown, remaining_s = entry
        if isinstance(markdown, str) and markdown:
            source_cache.record_hit(_NAMESPACE)
            provider_cache.log_call(_NAMESPACE, hit=True)
            if r is not None:
                try:  # backfill L1 with the remaining ttl (never outlive L2)
                    await r.set(_key(url), markdown, ex=max(remaining_s, 1))
                except Exception as exc:  # noqa: BLE001 — backfill is a nicety
                    logger.debug("Scrape cache L1 backfill failed for %s: %s", url, exc)
            return markdown
    source_cache.record_miss(_NAMESPACE)
    provider_cache.log_call(_NAMESPACE, hit=False)
    return None


async def set_markdown(url: str, markdown: str) -> None:
    """Write-through scraped markdown for ``url`` to BOTH tiers (best-effort,
    TTL-bounded). Only call on a successful scrape — never cache
    errors/timeouts/empty results.

    The TTL actually written is JITTERED (±10 %, ``source_cache.jittered_ttl``)
    around the nominal ``_TTL_SECONDS`` — anti-thundering-herd (C6, correctif
    A): a batch of scrapes landing in the same window must not all expire
    together. The nominal constant stays the one documented/compared against
    ``agent_docs/source-cache.md``.
    """
    if not markdown:
        return
    if source_cache.cache_disabled():
        return
    ttl_s = source_cache.jittered_ttl(_TTL_SECONDS)
    r = await _redis()
    if r is not None:
        try:
            await r.set(_key(url), markdown, ex=ttl_s)
        except Exception as exc:  # noqa: BLE001 — best-effort
            logger.debug("Scrape cache set failed for %s: %s", url, exc)
    await source_cache.put(_NAMESPACE, normalize_url(url), markdown, ttl_s)


async def cached_markdown(url: str, fetch: Callable[[], Awaitable[str | None]]) -> str | None:
    """Get-or-fetch combinator mirroring ``provider_cache.cached_json`` — WITH
    the anti-stampede single-flight lock (C6, correctif B): N concurrent cold
    ``url`` callers collapse into ONE real ``fetch()``, and only the winner
    writes the result through.

    Kept alongside the existing ``get_markdown``/``set_markdown`` pair (still
    called separately by ``firecrawl.py``'s own scrape loop, which owns the
    actual Firecrawl SDK call between the two) — a caller that wants the
    lock-protected get-or-fetch in one call uses this instead.
    """
    cached = await get_markdown(url)
    if cached:
        return cached
    value, is_winner = await source_cache.single_flight(_NAMESPACE, url, fetch)
    if is_winner and value:
        await set_markdown(url, value)
    return value
