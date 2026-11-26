"""#4108 palier 1 — lecture GRATUITE (trafilatura) devant Firecrawl (payant).

Une page statique lisible n'a pas besoin d'un appel Firecrawl facturé par page.
Ordre : fetch HTTP simple → ``trafilatura.extract`` → texte suffisant ? on le
sert ; sinon l'appelant retombe sur Firecrawl comme avant.

Règles (doctrine N2 — collecte propre, mesurée, agent identifié) :

- ``CRAWL_TIER_FREE_ENABLED`` ÉTEINT par défaut : sans lui, le chemin est
  byte-identique et ``trafilatura`` n'est même pas importé.
- Jamais de faux user-agent : on se présente comme BellumAI.
- ``robots.txt`` respecté. Interdit (ou illisible en 5xx, par prudence) ⇒ on ne
  crawle PAS du tout, ni ici ni chez Firecrawl : résultat ``skipped`` explicite.
- Jamais LinkedIn (ni les autres domaines exclus de la collecte).
- Même garde SSRF que la lecture de documents (``web_documents``).
"""

from __future__ import annotations

import logging
import os
import re
import time
from dataclasses import dataclass
from typing import Literal
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import httpx

from app.services.web_documents import WebDocumentError, _assert_safe

logger = logging.getLogger(__name__)

USER_AGENT = "BellumAI/1.0 (+https://bellum-ai.com; collecte publique respectueuse de robots.txt)"
_ROBOTS_TOKEN = "BellumAI"

#: Sous ce seuil de caractères de texte extrait, la page est « pauvre » (coquille JS,
#: mur de cookies, page vide) : on laisse Firecrawl la rendre. Valeur mesurable, à
#: ajuster sur le lot de mesure — pas une opinion.
MIN_USEFUL_CHARS = 800
#: Et au moins ce nombre de mots, pour qu'un mur de ponctuation ne passe pas.
_MIN_USEFUL_WORDS = 100
_WORD_RE = re.compile(r"\w{2,}", re.UNICODE)

_FETCH_TIMEOUT_S = 8.0
_MAX_HTML_BYTES = 3_000_000
_MAX_REDIRECTS = 4
_ROBOTS_TTL_S = 3600.0

ERROR_CODE_ROBOTS_DISALLOWED = "ROBOTS_DISALLOWED"
ERROR_CODE_DOMAIN_REFUSED = "DOMAIN_REFUSED"

#: Refus à TOUS les paliers. LinkedIn d'abord ; le reste suit la liste d'exclusion
#: de la collecte (``firecrawl.EXCLUDED_DOMAINS``) — dupliquée ici pour éviter un import circulaire.
REFUSED_DOMAINS = (
    "linkedin.com",
    "facebook.com",
    "youtube.com",
    "twitter.com",
    "instagram.com",
    "tiktok.com",
    "pinterest.com",
)

# host -> (expiration monotonic, parser | None = tout autorisé | _DENY_ALL)
_ROBOTS_CACHE: dict[str, tuple[float, RobotFileParser | None]] = {}

Status = Literal["served", "insufficient", "refused", "robots_disallowed"]


@dataclass(frozen=True)
class FreeOutcome:
    status: Status
    text: str | None = None


def is_enabled() -> bool:
    return os.getenv("CRAWL_TIER_FREE_ENABLED", "").strip().lower() in {"1", "true", "yes", "on"}


def is_refused_domain(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return any(host == d or host.endswith("." + d) for d in REFUSED_DOMAINS)


def is_sufficient(text: str | None) -> bool:
    if not text or len(text) < MIN_USEFUL_CHARS:
        return False
    return len(_WORD_RE.findall(text)) >= _MIN_USEFUL_WORDS


def _new_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=_FETCH_TIMEOUT_S,
        follow_redirects=False,  # suivies à la main : chaque saut est revalidé (SSRF, robots)
        headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"},
    )


async def _robots_parser(client: httpx.AsyncClient, url: str) -> RobotFileParser | None:
    parsed = urlparse(url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    cached = _ROBOTS_CACHE.get(origin)
    if cached and cached[0] > time.monotonic():
        return cached[1]
    parser: RobotFileParser | None = RobotFileParser()
    try:
        resp = await client.get(f"{origin}/robots.txt")
        if resp.status_code >= 500:
            parser.parse(["User-agent: *", "Disallow: /"])  # illisible : prudence
        elif resp.status_code >= 400:
            parser = None  # RFC 9309 : absent ⇒ tout est autorisé
        else:
            parser.parse(resp.text.splitlines())
    except httpx.HTTPError:
        parser.parse(["User-agent: *", "Disallow: /"])
    _ROBOTS_CACHE[origin] = (time.monotonic() + _ROBOTS_TTL_S, parser)
    return parser


async def _fetch_html(client: httpx.AsyncClient, url: str) -> str | None:
    current = url
    for _ in range(_MAX_REDIRECTS + 1):
        await _assert_safe(current)
        resp = await client.get(current)
        if resp.is_redirect:
            location = resp.headers.get("location")
            if not location:
                return None
            target = str(httpx.URL(current).join(location))
            # Saut vers un AUTRE hôte : son robots.txt n'est pas lu, on s'arrête (Firecrawl reprend).
            if urlparse(target).netloc != urlparse(current).netloc or is_refused_domain(target):
                return None
            current = target
            continue
        if resp.status_code >= 400:
            return None
        if "html" not in resp.headers.get("content-type", "").lower():
            return None
        if len(resp.content) > _MAX_HTML_BYTES:
            return None
        return resp.text
    return None


def _extract(html: str, url: str) -> str | None:
    import trafilatura  # import tardif : flag éteint ⇒ jamais chargé

    return trafilatura.extract(html, url=url, include_comments=False, include_tables=True, favor_recall=True)


async def try_free(url: str) -> FreeOutcome:
    """Tente la lecture gratuite. N'appelle JAMAIS Firecrawl (c'est l'appelant qui décide)."""
    if is_refused_domain(url):
        return FreeOutcome("refused")
    try:
        async with _new_client() as client:
            parser = await _robots_parser(client, url)
            if parser is not None and not parser.can_fetch(_ROBOTS_TOKEN, url):
                return FreeOutcome("robots_disallowed")
            html = await _fetch_html(client, url)
    except (httpx.HTTPError, WebDocumentError, OSError) as exc:
        logger.info("Palier gratuit : fetch impossible pour %s (%s)", url, type(exc).__name__)
        return FreeOutcome("insufficient")
    if not html:
        return FreeOutcome("insufficient")
    try:
        text = _extract(html, url)
    except Exception as exc:  # noqa: BLE001 — l'extraction ne casse jamais un run
        logger.info("Palier gratuit : extraction impossible pour %s (%s)", url, type(exc).__name__)
        return FreeOutcome("insufficient")
    if is_sufficient(text):
        return FreeOutcome("served", text)
    return FreeOutcome("insufficient")
