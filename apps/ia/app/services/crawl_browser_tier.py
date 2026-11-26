"""#4108 palier 2 — crawl4ai (auto-hébergé) entre trafilatura et Firecrawl.

Une page que ``trafilatura`` ne sait pas lire (rendu JS) n'a pas forcément besoin du
rendu payant de Firecrawl : ``crawl4ai`` (Apache-2.0) la rend dans un Chromium sans
en-tête AUTO-HÉBERGÉ avant d'escalader vers Firecrawl.

Mêmes garanties qu'au palier 1 (doctrine N2 — collecte propre, mesurée, agent
identifié), vérifiées ICI et non supposées héritées : ce palier peut être activé
seul, sans le palier 1.

- ``CRAWL_TIER_BROWSER_ENABLED`` ÉTEINT par défaut : sans lui, ``crawl4ai`` n'est
  même pas importé, chemin byte-identique.
- Jamais de faux user-agent ; ``robots.txt`` respecté par NOTRE contrôle (le même
  que le palier 1, cache partagé), pas par celui — plus tardif — de crawl4ai, donc
  désactivé côté crawl4ai (``check_robots_txt=False``) pour ne pas re-fetcher deux
  fois avec deux user-agents différents.
- Jamais les domaines exclus (LinkedIn en tête) — réutilise la liste et le cache
  robots du palier 1 (``crawl_free_tier``) pour qu'un changement ne vive qu'à un
  seul endroit.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Literal

import httpx

from app.services import crawl_free_tier

logger = logging.getLogger(__name__)

#: ms, passé à crawl4ai (``page_timeout``) — rendu navigateur, plus lent qu'un fetch simple.
_PAGE_TIMEOUT_MS = int(os.getenv("CRAWL_TIER_BROWSER_TIMEOUT_MS", "20000"))

Status = Literal["served", "insufficient", "refused", "robots_disallowed"]


@dataclass(frozen=True)
class BrowserOutcome:
    status: Status
    text: str | None = None


def is_enabled() -> bool:
    return os.getenv("CRAWL_TIER_BROWSER_ENABLED", "").strip().lower() in {"1", "true", "yes", "on"}


async def _robots_allows(url: str) -> bool:
    async with crawl_free_tier._new_client() as client:
        parser = await crawl_free_tier._robots_parser(client, url)
    return parser is None or parser.can_fetch(crawl_free_tier._ROBOTS_TOKEN, url)


async def try_browser(url: str) -> BrowserOutcome:
    """Tente le rendu navigateur auto-hébergé. N'appelle JAMAIS Firecrawl (l'appelant décide)."""
    if crawl_free_tier.is_refused_domain(url):
        return BrowserOutcome("refused")
    try:
        if not await _robots_allows(url):
            return BrowserOutcome("robots_disallowed")
    except (httpx.HTTPError, OSError) as exc:
        logger.info("Palier navigateur : robots.txt illisible pour %s (%s)", url, type(exc).__name__)
        return BrowserOutcome("robots_disallowed")  # prudence, même règle que le palier 1

    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig  # import tardif : flag éteint ⇒ jamais chargé

    browser_config = BrowserConfig(user_agent=crawl_free_tier.USER_AGENT, headless=True, verbose=False)
    run_config = CrawlerRunConfig(page_timeout=_PAGE_TIMEOUT_MS, check_robots_txt=False)
    try:
        async with AsyncWebCrawler(config=browser_config) as crawler:
            result = await crawler.arun(url=url, config=run_config)
    except Exception as exc:  # noqa: BLE001 — un rendu qui plante retombe sur Firecrawl, jamais une erreur de run
        logger.info("Palier navigateur : rendu impossible pour %s (%s)", url, type(exc).__name__)
        return BrowserOutcome("insufficient")

    if not getattr(result, "success", False) or not result.markdown:
        return BrowserOutcome("insufficient")
    text = str(result.markdown)
    if crawl_free_tier.is_sufficient(text):
        return BrowserOutcome("served", text)
    return BrowserOutcome("insufficient")
