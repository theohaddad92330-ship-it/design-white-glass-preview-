"""#3205.1 (épopée #3239) — le fetch CIBLÉ des pages de crédits du site officiel.

`site_credit_partners.py` (#3095) et `provider_footprint_mentions.py` relisent
les pages que la recherche Brave a déjà rendues. Ce module ajoute le seul fetch
neuf que l'issue réclamait : les pages mentions légales / crédits / partenaires
du SITE OFFICIEL du compte, quand la recherche ne les a pas rendues.

Garde-fous : sans clé Firecrawl, aucun appel (no-op strict) ; même hôte que le
site officiel ; jamais plus que ce qui reste du plafond de pages du run
(`MAX_PAGES_PER_RUN`) — pas un budget de plus ; un échec ne fait pas tomber le run.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Awaitable, Callable, Collection
from typing import Any
from urllib.parse import urlparse

from app.services.firecrawl import scrape_hits
from app.services.research.firecrawl import MAX_PAGES_PER_RUN
from app.services.research.sources import SourceCategory

logger = logging.getLogger(__name__)

#: LOT (15/10) DATA-A point 4 — plus de chemins DEVINÉS (4 scrapes dont la plupart tombaient en
#: 404, facturés) : un appel `/map` (1 crédit) liste les pages RÉELLES du site, et seules celles
#: dont le chemin évoque des crédits sont scrapées. Du plus au moins probable.
_KEYWORDS: tuple[str, ...] = ("mentions-legales", "mentions", "legal", "credits", "partenaires", "partners")
_MAP_SEARCH = "mentions légales crédits partenaires"
_MAP_LIMIT = 100
_MAP_TTL_S = 30 * 24 * 3600  # 30 j, comme tout appel payant (Louis 15/10)

MapLinks = Callable[[str], Awaitable[list[str]]]


def _key(url: str) -> str:
    return url.rstrip("/").lower()


def _host(url: str) -> str:
    return (urlparse(url).hostname or "").lower().removeprefix("www.")


def _base(website: str | None) -> str | None:
    try:
        parsed = urlparse((website or "").strip())
    except ValueError:
        return None
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return None
    return f"{parsed.scheme}://{parsed.netloc}"


def candidate_urls(website: str | None, already_scraped: Collection[str], links: Collection[str] = ()) -> list[str]:
    """Les pages de crédits qui EXISTENT (rendues par `/map`) sur l'hôte du site officiel,
    sans celles déjà scrapées. Sans lien connu : rien (on ne devine plus un chemin)."""
    base = _base(website)
    if base is None:
        return []
    seen = {_key(url) for url in already_scraped}
    ranked: list[tuple[int, str]] = []
    for link in links:
        if _host(link) != _host(base) or _key(link) in seen:
            continue
        path = urlparse(link).path.lower()
        rank = next((i for i, word in enumerate(_KEYWORDS) if word in path), None)
        if rank is not None and not any(link == other for _, other in ranked):
            ranked.append((rank, link))
    return [link for _, link in sorted(ranked)]


async def map_site(website: str) -> list[str]:
    """Les pages du site (Firecrawl `/map`, 1 crédit), cache commun 30 j par hôte."""
    from firecrawl import AsyncFirecrawl

    from app.services import cost_ledger, provider_cache
    from app.services.rate_limiter import throttle

    async def _fetch() -> list[str]:
        client = AsyncFirecrawl(api_key=os.environ["FIRECRAWL_API_KEY"])
        async with throttle("firecrawl"):
            data = await client.map(url=website, search=_MAP_SEARCH, limit=_MAP_LIMIT)
        cost_ledger.record("firecrawl", "map")
        found = getattr(data, "links", None) or []
        return [str(getattr(item, "url", item)) for item in found if getattr(item, "url", item)]

    return await provider_cache.cached_json("map:firecrawl", _host(website), _fetch, ttl=_MAP_TTL_S) or []


async def crawl_footprint_pages(
    website: str | None,
    already_scraped: Collection[str],
    *,
    pages_already_used: int,
    scrape: Callable[..., Awaitable[list[Any]]] = scrape_hits,
    mapper: MapLinks = map_site,
) -> list[dict[str, Any]]:
    """``[{"url", "markdown"}]`` des pages de crédits rendues OK, ou ``[]``."""
    if not os.environ.get("FIRECRAWL_API_KEY"):
        return []
    budget = MAX_PAGES_PER_RUN - pages_already_used
    base = _base(website)
    if budget <= 0 or base is None:
        return []
    try:
        links = await mapper(base)
    except Exception as exc:  # fail-soft : pas de carte du site, pas de scrape deviné
        logger.warning("provider footprint map failed (continuing): %s", exc)
        return []
    urls = candidate_urls(website, already_scraped, links)[:budget]
    if not urls:
        return []
    hits = [
        {"url": url, "title": "", "description": "", "category": SourceCategory.OFFICIAL}
        for url in urls
    ]
    try:
        results = await scrape(hits, max_pages=len(hits))
    except Exception as exc:  # fail-soft : le run continue sans ces pages
        logger.warning("provider footprint crawl failed (continuing): %s", exc)
        return []
    return [
        {"url": r["url"], "markdown": r["markdown"]}
        for r in results
        if r.get("scrape_status") == "ok" and r.get("markdown")
    ]


__all__ = ["candidate_urls", "crawl_footprint_pages", "map_site"]
