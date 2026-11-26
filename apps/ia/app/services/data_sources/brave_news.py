"""Brave News — recent press for a company.

Reuses the existing ``BRAVE_API_KEY`` + the shared ``brave`` throttle, so it adds
a dedicated NEWS query (acquisitions, RFP wins, nominations, restructurings) in
parallel with the web search / scraping of Phase 1 — fresher, dated signals than
the generic web crawl. No-op (empty) without a key; empty on any error.
"""

from __future__ import annotations

import logging
import os

import httpx

from app.middleware.correlation_id import get_correlation_id
from app.services import cost_ledger, provider_cache
from app.services.brave_snippets import extra_snippets_params, merge_description
from app.services.company_filters import DegradeReason
from app.services.data_sources._http_pool import get_shared_client
from app.services.rate_limiter import back_off_provider, retry_after_header, throttle
from app.services.source_health import record_degradation

logger = logging.getLogger(__name__)

_URL = "https://api.search.brave.com/res/v1/news/search"
_TIMEOUT_S = 10.0


#: CACHE-API (15/10) — on paie UNE fois la page complète (même prix que 6 chez Brave) ;
#: ``limit`` est un paramètre d'AFFICHAGE : il se filtre à la lecture, il n'est pas dans la clé.
_FETCH_COUNT = 20


async def recent_news(
    company: str,
    *,
    limit: int = 6,
    client: httpx.AsyncClient | None = None,
    freshness: str | None = None,
) -> list[dict]:
    """Recent French news items for a company, newest-relevant first. Empty
    without ``BRAVE_API_KEY`` or on any error. Cached 30 d per company (``TTL_NEWS``).

    LOT (15/10) DATA-A point 2 — ``freshness="pd"`` (veille quotidienne) : seules les nouveautés des
    dernières 24 h, UN appel par compte et par jour, cache À PART (``news:brave_pd``, ``TTL_BRAVE_NEWS_FRESH``)
    pour que le cache 30 j ne masque jamais une nouveauté."""

    async def _fetch() -> list[dict]:
        # L'appel Brave lui-même : le 429 y est classé et déclenche ``back_off_provider``.
        limit = _FETCH_COUNT
        key = os.environ.get("BRAVE_API_KEY", "")
        cleaned = (company or "").strip()
        if not key or not cleaned:
            return []

        headers = {"X-Subscription-Token": key, "Accept": "application/json"}
        params = {"q": cleaned, "count": str(max(1, min(limit, 20))), "country": "fr", "search_lang": "fr", **extra_snippets_params()}
        if freshness:
            params["freshness"] = freshness

        http = client if client is not None else get_shared_client("brave_news", timeout=_TIMEOUT_S)
        try:
            async with throttle("brave"):
                resp = await http.get(_URL, params=params, headers=headers)
            if resp.status_code == 429:
                back_off_provider("brave", retry_after_header(resp))
            resp.raise_for_status()
            # LOT (15/10) DATA-A point 7 — appel payant parti : une ligne au registre de coûts.
            cost_ledger.record("brave_news", "news", units=1)
            payload = resp.json()
        except Exception as exc:  # noqa: BLE001 — a source must never break research
            logger.warning("Brave News failed for %r: %s", cleaned, exc)
            # Report the REAL cause: without it the run can only say "aucun
            # résultat", which reads identically to a company that genuinely has
            # nothing here — opposite facts, same message.
            #
            # #2528/#2529 — a 402 is a QUOTA, not "rien à dire" : classed apart so
            # it is never confused with an empty result. 429 is a rate limit, a
            # different (transient) fact. Anything else keeps its free-text reason,
            # unclassified — never a guessed code for a status we haven't measured.
            status = getattr(getattr(exc, "response", None), "status_code", None)
            code = DegradeReason.QUOTA_EXCEEDED if status == 402 else DegradeReason.RATE_LIMITED if status == 429 else ""
            record_degradation(get_correlation_id(), source="brave_news", reason=str(exc), code=code)
            return []

        results = payload.get("results") if isinstance(payload, dict) else None
        out: list[dict] = []
        for r in results or []:
            if not isinstance(r, dict) or not r.get("url"):
                continue
            out.append(
                {
                    "title": str(r.get("title") or "").strip(),
                    "url": r.get("url"),
                    "age": r.get("age") or r.get("page_age"),
                    "description": merge_description(str(r.get("description") or "").strip()[:300], r.get("extra_snippets")),
                }
            )
        return out

    items = await provider_cache.cached_json(
        "news:brave_pd" if freshness else "news:brave",
        (company or "").strip().lower(),
        _fetch,
        ttl=provider_cache.TTL_BRAVE_NEWS_FRESH if freshness else provider_cache.TTL_NEWS,
    )
    return (items or [])[: max(1, min(limit, 20))]
