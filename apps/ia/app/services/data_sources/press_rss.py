"""Presse française par flux RSS — signaux typés, datés, avec lien (#3917, #3925).

Lecture de flux PUBLICS de médias français (frontière c79 : collecte large mais
propre) : user-agent honnête, ≥ 1 s entre deux requêtes sur un même hôte, flux
mis en cache 30 min, aucun contournement. Aucun LLM : le type est décidé par des
listes de mots-clés français.

Flux VÉRIFIÉS le 2026-10-08 (``curl`` → HTTP 200, XML RSS 2.0 valide, robots.txt
sans interdiction pour ``User-agent: *`` sur les flux) : Silicon.fr, LeMagIT,
Usine Digitale, ZDNet France, Journal du Net, FrenchWeb, Maddyness.
ÉCARTÉS : Les Echos et Le Figaro (HTTP 403 sur lecture automatisée), Le Monde
(robots.txt restrictif envers les outils de veille média, CGU de réutilisation),
Decideo (404), Google News et tout agrégateur (CGU).

Rattachement STRICT (anti-homonymes, cf. #3901) : le nom légal complet (ou le
domaine, ou le SIREN) doit figurer dans le titre ou le résumé, à frontières de
mots ; un texte qui désigne une collectivité écarte l'article d'une société
privée ; un nom d'un seul mot court (< 6 caractères) ne suffit jamais seul ; un
article sans date est écarté (jamais traité comme récent).

``PRESS_RSS_ENABLED=false`` coupe la source (no-op, zéro réseau).
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import time
import unicodedata
import xml.etree.ElementTree as ET
from datetime import UTC, datetime, timedelta
from email.utils import parsedate_to_datetime
from urllib.parse import urlparse

import httpx

from app.middleware.correlation_id import get_correlation_id
from app.services import provider_cache
from app.services.data_sources._http_pool import get_shared_client
from app.services.data_sources.employer_match import named_in_text
from app.services.rate_limiter import throttle_per_domain
from app.services.source_health import record_degradation

logger = logging.getLogger(__name__)

PRESS_FEEDS: tuple[str, ...] = (
    "https://www.silicon.fr/feed",
    "https://www.lemagit.fr/rss/ContentSyndication.xml",
    "https://www.usine-digitale.fr/rss",
    "https://www.zdnet.fr/feeds/rss/actualites/",
    "https://www.journaldunet.com/rss/",
    "https://www.frenchweb.fr/feed",
    "https://www.maddyness.com/feed/",
)

_UA = "Mozilla/5.0 (compatible; BellumAI/1.0; +https://bellum-ai.com)"
_TIMEOUT_S = 10.0
_FEED_TTL_S = 30 * 60
_MIN_HOST_GAP_S = 1.0
_MAX_FEED_BYTES = 3_000_000
_MAX_SIGNALS = 20
# #3915.c — 6 : un nom d'un seul mot de 5 caractères (« Sanef », « Orano ») reste trop
# ambigu dans un titre de presse pour rattacher seul ; le SIREN ou le domaine le confirme.
_SHORT_NAME = 6

_TYPE_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("levee", re.compile(r"\b(?:lève|leve|levée de fonds|levee de fonds|tour de table)\b")),
    ("rachat", re.compile(r"\b(?:rachète|rachete|rachat|acquisition|acquiert|rachetée|racheté)\b")),
    ("nomination", re.compile(r"\b(?:nomme|nommé|nommée|nomination|rejoint|dsi|directeur général|directrice générale)\b")),
    ("projet", re.compile(r"\b(?:refonte|transformation|migration|plan stratégique|projet 20)")),
)
_COLLECTIVITY = re.compile(r"\b(?:mairie|commune|ville de|département|région|communauté de communes)\b")

_host_next_slot: dict[str, float] = {}
_host_locks: dict[str, asyncio.Lock] = {}


def _enabled() -> bool:
    return os.environ.get("PRESS_RSS_ENABLED", "true").strip().lower() not in {"0", "false", "no", "off"}


def _norm(text: str) -> str:
    """Minuscules sans accents, espaces compactés — pour comparer, pas pour afficher."""
    s = unicodedata.normalize("NFKD", text or "").casefold()
    s = "".join(c for c in s if not unicodedata.combining(c))
    return " ".join(s.split())


def _norm_keep(text: str) -> str:
    return " ".join(unicodedata.normalize("NFC", text or "").casefold().split())


async def fetch_feed(url: str, *, client: httpx.AsyncClient | None = None) -> str:
    """Texte brut d'un flux, mis en cache 30 min. Lève sur toute erreur (l'appelant isole)."""

    async def _fetch() -> str:
        host = urlparse(url).netloc
        lock = _host_locks.setdefault(host, asyncio.Lock())
        async with lock:  # ≥ 1 s entre deux requêtes sur le même hôte
            wait = _host_next_slot.get(host, 0.0) - time.monotonic()
            if wait > 0:
                await asyncio.sleep(wait)
            _host_next_slot[host] = time.monotonic() + _MIN_HOST_GAP_S
        http = client if client is not None else get_shared_client("press_rss", timeout=_TIMEOUT_S, follow_redirects=True)
        async with throttle_per_domain("press_rss", host):  # #3925.a — seau par domaine de média
            resp = await http.get(url, headers={"User-Agent": _UA, "Accept": "application/rss+xml, application/xml, text/xml"})
        resp.raise_for_status()
        text = resp.text
        if len(text) > _MAX_FEED_BYTES:
            raise ValueError("flux trop volumineux")
        return text

    return await provider_cache.cached_json("press:rss", url, _fetch, ttl=_FEED_TTL_S)


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def _strip_html(s: str) -> str:
    return " ".join(re.sub(r"<[^>]+>", " ", s or "").replace("&nbsp;", " ").split())


def _parse_date(raw: str) -> datetime | None:
    s = (raw or "").strip()
    if not s:
        return None
    try:
        dt = parsedate_to_datetime(s)
    except (TypeError, ValueError):
        try:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError:
            return None
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def parse_feed(xml_text: str) -> list[dict]:
    """Items ``{title, url, summary, published}`` (``published`` : datetime | None).
    Lève ``ValueError`` si ce n'est pas du XML RSS/Atom, ou s'il déclare une DTD
    (entités → expansion : refusé d'emblée, pas de parseur durci disponible)."""
    if re.search(r"<!(?:DOCTYPE|ENTITY)", xml_text or "", re.IGNORECASE):
        raise ValueError("DTD refusée")
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        raise ValueError(f"XML invalide: {exc}") from exc
    items: list[dict] = []
    for node in root.iter():
        if _local(node.tag) not in {"item", "entry"}:
            continue
        f: dict[str, str] = {}
        for child in node:
            name = _local(child.tag)
            if name == "link":
                href = child.get("href")
                if href and child.get("rel", "alternate") == "alternate":
                    f.setdefault("link", href)
                elif (child.text or "").strip():
                    f.setdefault("link", child.text.strip())
            elif name in {"title", "description", "summary", "pubdate", "published", "updated", "date"}:
                f.setdefault(name, child.text or "")
        date = _parse_date(f.get("pubdate") or f.get("published") or f.get("date") or f.get("updated") or "")
        items.append(
            {
                "title": _strip_html(f.get("title", "")),
                "url": f.get("link", "").strip(),
                "summary": _strip_html(f.get("description") or f.get("summary") or ""),
                "published": date,
            }
        )
    return items


def classify(title: str, summary: str = "") -> str:
    """levee | nomination | rachat | projet | autre — titre d'abord, résumé ensuite."""
    for text in (_norm_keep(title), _norm_keep(summary)):
        for kind, pattern in _TYPE_PATTERNS:
            if pattern.search(text):
                return kind
    return "autre"


def _clean_domain(domain: str | None) -> str:
    d = _norm(domain or "")
    d = re.sub(r"^https?://", "", d).split("/")[0]
    return d.removeprefix("www.")


def _match(text: str, text_norm: str, name: str, siren: str, domain: str) -> str | None:
    """Renvoie ``name`` | ``domain`` | ``siren`` si l'identité est confirmée, sinon None."""
    if siren and re.search(rf"(?<!\d){'[ .]?'.join((siren[:3], siren[3:6], siren[6:]))}(?!\d)", text_norm):
        return "siren"
    if domain and re.search(rf"(?<![\w.-]){re.escape(domain)}(?![\w-])", text_norm):
        return "domain"
    name_n = _norm(name)
    single_short = " " not in name_n and len(name_n) < _SHORT_NAME
    # #3915.a — le nom passe par le contrôle d'employeur UNIQUE (employer_match) :
    # « Renault » ne rattache pas « Renault Trucks ».
    if name_n and not single_short and named_in_text(text, name):
        return "name"
    return None


async def load_feeds() -> dict[str, list[dict] | Exception]:
    """Les flux lus et parsés, UNE fois — ``{url: items | erreur}``. ``{}`` si la
    source est coupée. DECOUVRIR-COLLECTE (13/10) : une page Découvrir les lit une
    fois et les partage entre ses 24 entreprises (``press_signals(feeds=…)``).
    Un flux en échec est noté (``record_degradation``), jamais caché."""
    if not _enabled():
        return {}

    async def one(url: str) -> list[dict] | Exception:
        try:
            return parse_feed(await fetch_feed(url))
        except Exception as exc:  # noqa: BLE001 — un flux en échec n'arrête pas les autres
            logger.warning("press RSS feed failed %s: %s", url, exc)
            return exc

    results = await asyncio.gather(*(one(u) for u in PRESS_FEEDS))
    failed = [r for r in results if isinstance(r, Exception)]
    if failed:
        record_degradation(
            get_correlation_id(),
            source="press_rss",
            reason=f"{len(failed)}/{len(PRESS_FEEDS)} flux en échec ({failed[0]})",
        )
    return dict(zip(PRESS_FEEDS, results, strict=True))


async def press_signals(
    company: str,
    siren: str | None,
    domain: str | None,
    *,
    max_age_days: int = 90,
    feeds: dict[str, list[dict] | Exception] | None = None,
) -> list[dict]:
    """Signaux presse récents ``{type, title, url, published_at, source, matched_on}``,
    récents d'abord. ``[]`` si désactivé, nom vide, ou rien de rattaché.
    ``feeds`` : flux déjà lus par ``load_feeds`` (partagés entre entreprises) ;
    absent = lus ici."""
    name = " ".join((company or "").split())
    if not name or not _enabled():
        return []
    name_n = _norm(name)
    siren_n = re.sub(r"\D", "", siren or "")
    siren_n = siren_n if len(siren_n) == 9 else ""
    domain_n = _clean_domain(domain)
    company_is_public_body = _COLLECTIVITY.search(name_n) is not None

    if feeds is None:
        feeds = await load_feeds()

    now = datetime.now(UTC)
    cutoff = now - timedelta(days=max_age_days)
    seen: set[str] = set()
    out: list[tuple[datetime, dict]] = []
    for url, res in feeds.items():
        if isinstance(res, Exception):
            continue
        source = urlparse(url).netloc.removeprefix("www.")
        for it in res:
            published = it["published"]
            if published is None or published > now + timedelta(days=1):  # lot 762 : plus de borne d'âge de stockage
                continue
            if not it["url"] or not it["title"]:
                continue
            text = f"{it['title']} {it['summary']}"
            text_n = _norm(text)
            matched = _match(text, text_n, name, siren_n, domain_n)
            if matched is None:
                continue
            if not company_is_public_body and _COLLECTIVITY.search(text_n):
                continue
            dedup = it["url"].split("#")[0].rstrip("/")
            if dedup in seen:
                continue
            seen.add(dedup)
            out.append(
                (
                    published,
                    {
                        "type": classify(it["title"], it["summary"]),
                        "title": it["title"],
                        "url": it["url"],
                        "published_at": published.isoformat(),
                        "source": source,
                        "matched_on": matched,
                        **({"historical": True} if published < cutoff else {}),
                    },
                )
            )
    out.sort(key=lambda p: p[0], reverse=True)
    return [s for _, s in out[:_MAX_SIGNALS]]


# #3917.b — âge Brave : relatif à l'heure, au jour ou à la semaine près, ou date ISO.
# « 2 months ago » ne date pas un jour : la brève est écartée, jamais datée au hasard.
_BRAVE_AGE_RE = re.compile(r"^\s*(\d+)\s*(minute|hour|day|week)s?\s+ago\s*$", re.IGNORECASE)
_BRAVE_AGE_UNIT = {"minute": timedelta(minutes=1), "hour": timedelta(hours=1), "day": timedelta(days=1), "week": timedelta(weeks=1)}


def _brave_published(age: object, now: datetime) -> datetime | None:
    raw = str(age or "").strip()
    m = _BRAVE_AGE_RE.match(raw)
    if m:
        return now - int(m.group(1)) * _BRAVE_AGE_UNIT[m.group(2).lower()]
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def attach_brave_news(
    news: object,
    *,
    company: str,
    legal_name: str | None,
    siren: str | None,
    domain: str | None,
    max_age_days: int = 90,
    now: datetime | None = None,
) -> list[dict]:
    """#3917.b — les brèves Brave (cherchées par NOM) rattachées par SIREN.

    Sans SIREN ancré (9 chiffres, registre de confiance) → ``[]`` : une brève
    trouvée par nom n'est jamais attribuée sur le seul nom. Avec : la brève doit
    nommer CETTE entité — son SIREN, son domaine, ou son nom légal (ou le nom tapé)
    passé par :func:`employer_match.named_in_text` ; une collectivité dans le texte
    l'écarte. Datée (âge Brave au jour près ou ISO), ≤ ``max_age_days`` (la même
    fenêtre que la presse RSS), lien http(s) — sinon écartée. Forme de
    :func:`press_signals`, pour :func:`merge_press_signals`.
    """
    siren_n = re.sub(r"\D", "", siren or "")
    if len(siren_n) != 9:
        return []
    reference = now or datetime.now(UTC)
    cutoff = reference - timedelta(days=max_age_days)
    domain_n = _clean_domain(domain)
    names = [n for n in dict.fromkeys(" ".join((x or "").split()) for x in (legal_name, company)) if n]
    out: list[tuple[datetime, dict]] = []
    seen: set[str] = set()
    for it in news if isinstance(news, list) else []:
        if not isinstance(it, dict):
            continue
        title = " ".join(str(it.get("title") or "").split())
        url = str(it.get("url") or "").strip()
        if not title or not url.lower().startswith(("http://", "https://")) or url in seen:
            continue
        published = _brave_published(it.get("age"), reference)
        if published is None or published > reference + timedelta(days=1):  # lot 762 : idem
            continue
        text = f"{title} {it.get('description') or ''}"
        text_n = _norm(text)
        matched = next((m for n in names if (m := _match(text, text_n, n, siren_n, domain_n))), None)
        if matched is None or (_COLLECTIVITY.search(text_n) and not any(_COLLECTIVITY.search(_norm(n)) for n in names)):
            continue
        seen.add(url)
        item = {
            "type": classify(title, str(it.get("description") or "")),
            "title": title,
            "url": url,
            "published_at": published.isoformat(),
            "source": (urlparse(url).hostname or "").removeprefix("www."),
            "matched_on": matched,
            **({"historical": True} if published < cutoff else {}),
        }
        out.append((published, item))
    out.sort(key=lambda p: p[0], reverse=True)
    return [i for _, i in out[:_MAX_SIGNALS]]


# #3917.1 — le type du flux RSS vers un type de signal que la veille classe déjà
# (``levee`` → budget, ``rachat`` → acquisition) ; ``autre`` reste sans type, jamais deviné.
_SIGNAL_TYPE_BY_KIND = {"levee": "budget", "rachat": "acquisition", "nomination": "nomination", "projet": "projet"}


def merge_press_signals(recent_signals: object, items: object) -> list[dict]:
    """Ajoute les articles RSS aux ``recentSignals`` — le seul chemin par lequel ils
    atteignent la veille, Mes cibles et Laura (``pressSignals`` n'avait aucun lecteur).

    Un article SANS titre, SANS date de publication ou SANS lien http(s) est écarté :
    jamais une date ni un lien inventés. Un lien déjà porté par un signal n'est pas
    ajouté deux fois. ``source_kind="press"`` nomme le genre de la preuve."""
    out = [dict(s) for s in recent_signals if isinstance(s, dict)] if isinstance(recent_signals, list) else []
    seen = {str(s.get("url") or "") for s in out if s.get("url")}
    for it in items if isinstance(items, list) else []:
        if not isinstance(it, dict):
            continue
        title = str(it.get("title") or "").strip()
        day = str(it.get("published_at") or "").strip()[:10]
        url = str(it.get("url") or "").strip()
        if not title or not day or not url.lower().startswith(("http://", "https://")) or url in seen:
            continue
        seen.add(url)
        out.append(
            {
                "signal": title,
                "source": str(it.get("source") or "").strip() or "Presse",
                "type": _SIGNAL_TYPE_BY_KIND.get(str(it.get("type") or ""), ""),
                "date": day,
                "url": url,
                "source_kind": "press",
            }
        )
    return out
