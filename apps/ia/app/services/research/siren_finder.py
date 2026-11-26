"""Resolve a SIREN from the web when Pappers name-search can't.

Many companies trade under a brand that differs from their legal name
(OVHcloud → OVH GROUPE SA), so Pappers' name → SIREN search rejects the match
on low similarity. French law (art. R.123-237) requires every company website
to publish its SIREN / RCS on its *mentions légales*, so we can read the exact
SIREN there and query Pappers by SIREN directly — no name guessing.

``extract_siren`` is pure and deterministic (Luhn-validated, keyword-aware).
``find_siren_via_web`` orchestrates search + scrape via injected callables so
it's testable without hitting Brave / Firecrawl.
"""

from __future__ import annotations

import asyncio
import logging
import re
from collections.abc import Awaitable, Callable, Mapping

from app.middleware.correlation_id import get_correlation_id
from app.services.source_health import record_degradation

logger = logging.getLogger(__name__)

# 9 to 14 digits, optionally separated by spaces / dots (SIREN or SIRET).
_NUMBER_RE = re.compile(r"\d(?:[\d\s.]{7,16})\d")
# Legal markers that precede a SIREN on a mentions-légales page.
_KEYWORDS = ("siren", "siret", "rcs", "r.c.s")
_KEYWORD_WINDOW = 40

# URL fragments that mark a legal page — scraped first.
_LEGAL_URL_HINTS = ("mentions-legales", "mentions_legales", "mentionslegales", "legal", "cgu", "cgv", "/cgv", "informations-legales")
_MAX_PAGES = 4


def _luhn_ok(digits: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(digits)):
        d = int(ch)
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


def _normalize(raw: str) -> str | None:
    """A raw digit run → a valid 9-digit SIREN, or None."""
    digits = re.sub(r"\D", "", raw)
    if len(digits) >= 14:
        digits = digits[:14]  # SIRET → SIREN is the first 9
    if len(digits) == 14:
        digits = digits[:9]
    if len(digits) == 9 and _luhn_ok(digits):
        return digits
    return None


def extract_siren(text: str | None) -> str | None:
    """Return the first Luhn-valid SIREN in ``text``, preferring one that sits
    right after a SIREN / SIRET / RCS marker."""
    if not text:
        return None
    low = text.lower()
    keyword_near: list[str] = []
    anywhere: list[str] = []
    for m in _NUMBER_RE.finditer(text):
        window = low[max(0, m.start() - _KEYWORD_WINDOW) : m.start()]
        (keyword_near if any(k in window for k in _KEYWORDS) else anywhere).append(m.group(0))
    for raw in (*keyword_near, *anywhere):
        siren = _normalize(raw)
        if siren:
            return siren
    return None


_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def _normalize_token(text: str) -> str:
    return _NON_ALNUM.sub("", text.lower())


def _host(url: str) -> str:
    host = re.sub(r"^https?://", "", url.lower()).split("/", 1)[0]
    return host[4:] if host.startswith("www.") else host


def _host_matches_company(url: str, company_token: str) -> bool:
    """Does this URL's host plausibly belong to the company? Guards against
    grabbing a *stranger's* SIREN off some unrelated legal page that happened
    to rank in the search results — a wrong SIREN poisons the whole dossier.

    Strict on purpose: the full company token must be contained in the host
    (``ovhcloud`` in ``www.ovhcloud.com`` / ``shop.ovhcloud.com``). No
    prefix/substring shortcut — that would let a stranger sharing a short prefix
    latch on (``air.io`` must NOT match ``airfrance``; ``coin.fr`` must NOT match
    ``leboncoin``), and a wrong SIREN poisons the whole dossier. A company's own
    mentions-légales sit on a host carrying its brand, so this stays robust.
    """
    if not company_token or len(company_token) < 3:
        return False
    return company_token in _normalize_token(_host(url))


def _url_rank_key(url: str, company_token: str) -> tuple[int, int, int, int]:
    """Company-owned hosts first, then legal pages, then the apex host (fewest
    subdomain labels — official site over a subsite), then the shorter URL."""
    owned = 0 if _host_matches_company(url, company_token) else 1
    is_legal = 0 if any(h in url.lower() for h in _LEGAL_URL_HINTS) else 1
    return (owned, is_legal, _host(url).count("."), len(url))


def _rank_legal_first(urls: list[str], company_token: str) -> list[str]:
    return sorted(urls, key=lambda u: _url_rank_key(u, company_token))


def _md_of(source: object) -> str | None:
    if isinstance(source, Mapping):
        return source.get("scraped_markdown") or source.get("markdown")
    return getattr(source, "scraped_markdown", None) or getattr(source, "markdown", None)


def _url_of(source: object) -> str:
    if isinstance(source, Mapping):
        return str(source.get("url") or "")
    return str(getattr(source, "url", "") or "")


def find_siren_in_bundle(sources: object, company_name: str) -> str | None:
    """Extract the SIREN from pages already scraped in phase 1 — no extra fetch.

    The main Firecrawl bundle usually already scraped the company's official site
    (whose mentions-légales footer carries the SIREN). Reading it from there
    avoids a second Brave+Firecrawl round (F1). Same safety as the web resolver:
    only a page on the company's own host is trusted.
    """
    company_token = _normalize_token(company_name)
    items = list(sources) if sources else []
    items.sort(key=lambda s: _url_rank_key(_url_of(s), company_token))
    for source in items:
        url = _url_of(source)
        if not _host_matches_company(url, company_token):
            continue
        siren = extract_siren(_md_of(source))
        if siren:
            logger.info("Resolved SIREN %s for %r from already-scraped %s", siren, company_name, url)
            return siren
    return None


async def find_siren_via_web(
    company_name: str,
    *,
    search_fn: Callable[[str], Awaitable[list[str]]],
    scrape_fn: Callable[[str], Awaitable[str | None]],
    max_pages: int = _MAX_PAGES,
) -> str | None:
    """Find ``company_name``'s SIREN from its mentions-légales / legal pages.

    ``search_fn(query)`` returns candidate URLs; ``scrape_fn(url)`` returns page
    text. Both are injected so the orchestration is unit-testable. Scrape errors
    on a single page are swallowed — we just move to the next candidate.
    """
    company_token = _normalize_token(company_name)
    queries = [
        f'"{company_name}" mentions légales SIREN',
        f"{company_name} mentions légales RCS",
    ]

    # Collect candidate URLs across queries, dedupe, rank once.
    candidates: list[str] = []
    seen: set[str] = set()
    for query in queries:
        try:
            urls = await search_fn(query)
        except Exception as exc:  # noqa: BLE001
            logger.warning("SIREN web search failed for %r: %s", query, exc)
            record_degradation(
                get_correlation_id(), source="pappers", reason=f"recherche SIREN web: {exc}"
            )
            continue
        for url in urls:
            if url and url not in seen:
                seen.add(url)
                candidates.append(url)

    # Safety: only read a SIREN off a page on the company's own host. A wrong
    # SIREN would poison the whole dossier with another company's data — better
    # to return None than a stranger's SIREN.
    eligible = [
        url for url in _rank_legal_first(candidates, company_token) if _host_matches_company(url, company_token)
    ][:max_pages]
    if not eligible:
        return None

    # Scrape the eligible pages concurrently instead of one-at-a-time (each was
    # a ~25s fetch on the critical path); ``gather`` preserves order, so we still
    # return the SIREN from the highest-ranked page.
    async def _scrape(url: str) -> tuple[str, str | None]:
        try:
            return url, await scrape_fn(url)
        except Exception as exc:  # noqa: BLE001
            logger.warning("SIREN scrape failed for %s: %s", url, exc)
            record_degradation(get_correlation_id(), source="pappers", reason=f"scrape SIREN: {exc}")
            return url, None

    for url, text in await asyncio.gather(*(_scrape(u) for u in eligible)):
        if not text:
            continue
        siren = extract_siren(text)
        if siren:
            logger.info("Resolved SIREN %s for %r via %s", siren, company_name, url)
            return siren
    return None
