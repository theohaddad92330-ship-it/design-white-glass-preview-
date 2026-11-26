"""Tavily — AI web-search API (IA v2 Data Gateway search provider #2).

Tavily is an LLM-oriented search API returning ranked results with extracted
content. It is the second provider in the Data Gateway waterfall (Serper → Tavily
→ Brave): tried when Serper has no key (or yielded nothing) and ``TAVILY_API_KEY``
is set. Without the key it **no-ops** (returns ``[]`` with no network call — NO
FAKE) so the gateway falls through to Brave. Rate-limited via the shared ``tavily``
throttle; empty on any error so it can never break research.
"""

from __future__ import annotations

import logging
import os

import httpx

from app.middleware.correlation_id import get_correlation_id
from app.services.data_sources._http_pool import get_shared_client
from app.services.rate_limiter import back_off_provider, retry_after_header, throttle
from app.services.source_health import record_degradation

logger = logging.getLogger(__name__)

_URL = "https://api.tavily.com/search"
_TIMEOUT_S = 12.0


def has_key() -> bool:
    """True when ``TAVILY_API_KEY`` is configured (non-empty)."""
    return bool(os.environ.get("TAVILY_API_KEY", "").strip())


async def tavily_search(query: str, *, limit: int = 10, client: httpx.AsyncClient | None = None) -> list[dict]:
    """Top Tavily results for ``query``. Each hit is
    ``{title, url, description, source}``. Empty without ``TAVILY_API_KEY`` (no
    network call) or on any error."""
    key = os.environ.get("TAVILY_API_KEY", "").strip()
    cleaned = (query or "").strip()
    if not key or not cleaned:
        return []

    limit = max(1, min(limit, 20))
    body = {
        "query": cleaned,
        "search_depth": "basic",
        "max_results": limit,
    }

    http = client if client is not None else get_shared_client("tavily", timeout=_TIMEOUT_S)
    try:
        async with throttle("tavily"):
            # LOT (15/10) DATA-A point 8 — la clé en `Authorization: Bearer`, plus dans le corps de la requête.
            resp = await http.post(_URL, json=body, headers={"Authorization": f"Bearer {key}"})
        if not resp.is_success:
            if resp.status_code == 429:
                back_off_provider("tavily", retry_after_header(resp))
            logger.warning("Tavily search failed (status %s) for %r", resp.status_code, cleaned)
            record_degradation(get_correlation_id(), source="data_gateway", reason=f"tavily: HTTP {resp.status_code}")
            return []
        payload = resp.json()
    except Exception as exc:  # noqa: BLE001 — a search source must never break research
        logger.warning("Tavily search failed for %r: %s", cleaned, exc)
        record_degradation(get_correlation_id(), source="data_gateway", reason=f"tavily: {exc}")
        return []

    results = payload.get("results") if isinstance(payload, dict) else None
    out: list[dict] = []
    for r in results or []:
        if not isinstance(r, dict):
            continue
        url = r.get("url")
        if not url:
            continue
        out.append(
            {
                "title": str(r.get("title") or "").strip(),
                "url": url,
                "description": str(r.get("content") or "").strip()[:500],
                "source": "tavily",
                # #2616.1 — Tavily rend parfois `published_date` (ISO) ; transmise
                # telle quelle, jamais devinée quand absente.
                "date": str(r.get("published_date") or "").strip(),
            }
        )
        if len(out) >= limit:
            break
    return out
