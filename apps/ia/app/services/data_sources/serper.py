"""Serper.dev — Google SERP API (IA v2 Data Gateway search provider #1).

Serper proxies Google Search and returns structured organic results. It is the
first-choice web-search provider in the Data Gateway waterfall (Serper → Tavily →
Brave): when ``SERPER_API_KEY`` is set it is tried first, otherwise it **no-ops**
(returns ``[]`` without any network call — NO FAKE) and the gateway falls through
to the next keyed provider. Rate-limited via the shared ``serper`` throttle; empty
on any error so it can never break research. FR-scoped by default (``gl=fr``).
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

_URL = "https://google.serper.dev/search"
_TIMEOUT_S = 10.0


def has_key() -> bool:
    """True when ``SERPER_API_KEY`` is configured (non-empty)."""
    return bool(os.environ.get("SERPER_API_KEY", "").strip())


async def serper_search(query: str, *, limit: int = 10, client: httpx.AsyncClient | None = None) -> list[dict]:
    """Top Google organic results for ``query`` via Serper. Each hit is
    ``{title, url, description, source}``. Empty without ``SERPER_API_KEY`` (no
    network call) or on any error."""
    key = os.environ.get("SERPER_API_KEY", "").strip()
    cleaned = (query or "").strip()
    if not key or not cleaned:
        return []

    limit = max(1, min(limit, 20))
    headers = {"X-API-KEY": key, "Content-Type": "application/json"}
    body = {"q": cleaned, "gl": "fr", "hl": "fr", "num": limit}

    http = client if client is not None else get_shared_client("serper", timeout=_TIMEOUT_S)
    try:
        async with throttle("serper"):
            resp = await http.post(_URL, json=body, headers=headers)
        if not resp.is_success:
            if resp.status_code == 429:
                back_off_provider("serper", retry_after_header(resp))
            logger.warning("Serper search failed (status %s) for %r", resp.status_code, cleaned)
            record_degradation(get_correlation_id(), source="data_gateway", reason=f"serper: HTTP {resp.status_code}")
            return []
        payload = resp.json()
    except Exception as exc:  # noqa: BLE001 — a search source must never break research
        logger.warning("Serper search failed for %r: %s", cleaned, exc)
        return []

    organic = payload.get("organic") if isinstance(payload, dict) else None
    out: list[dict] = []
    for r in organic or []:
        if not isinstance(r, dict):
            continue
        url = r.get("link")
        if not url:
            continue
        out.append(
            {
                "title": str(r.get("title") or "").strip(),
                "url": url,
                "description": str(r.get("snippet") or "").strip()[:500],
                "source": "serper",
                # #2616.1 — Google/Serper annote parfois un résultat d'une date ;
                # transmise telle quelle, jamais devinée quand absente.
                "date": str(r.get("date") or "").strip(),
            }
        )
        if len(out) >= limit:
            break
    return out
