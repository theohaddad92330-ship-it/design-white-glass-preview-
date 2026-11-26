"""Pages carrières publiques — les offres balisées JSON-LD `JobPosting` (#3925.1).

Beaucoup d'entreprises publient leurs offres sur leur PROPRE site, avec le
balisage schema.org que les moteurs d'emploi lisent. Ce module lit ces balises
sur les pages carrières PUBLIQUES du domaine du compte.

LA FRONTIÈRE (c79 — « on collecte largement, tant que c'est PROPRE »)
---------------------------------------------------------------------
- pages publiques seulement : aucun cookie, aucune authentification, aucun
  rendu JavaScript, aucun contournement de captcha ni d'anti-robot ;
- `robots.txt` du domaine respecté (`urllib.robotparser`, récupéré et mis en
  cache par hôte) : un chemin interdit n'est JAMAIS requêté, et le refus est
  noté (`record_degradation`) ;
- user-agent HONNÊTE et fixe, jamais un navigateur usurpé ;
- un 403 / 429 / captcha arrête la collecte de CE domaine : noté, pas de retry ;
- plafonds durs : 5 pages carrières + 2 sitemaps par domaine, 2 Mo par réponse,
  10 s de timeout, ≥ 1 s entre deux requêtes sur un hôte.

L'ATTRIBUTION : le domaine est celui du compte (preuve par construction), plus
un contrôle — si `hiringOrganization.name` est présent et n'a aucun mot
significatif en commun avec l'entreprise, l'offre est écartée ; absent, gardée.

Même contrat de sortie que `it_job_signals_ats` (`merge_job_signals` dédupe par
URL), plus `sourceUrl` : la page où l'offre a été lue. Échec ⇒ ``[]``.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import unicodedata
from datetime import UTC, datetime, timedelta
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import httpx

from app.middleware.correlation_id import get_correlation_id
from app.services import provider_cache, safe_fetch
from app.services.company_name_variants import company_name_variants
from app.services.data_sources._http_pool import get_shared_client
from app.services.data_sources.employer_match import same_employer
from app.services.data_sources.france_travail import is_it_offer
from app.services.internship_posting import drop_internship_postings
from app.services.rate_limiter import throttle_per_domain
from app.services.source_health import record_degradation

logger = logging.getLogger(__name__)

_SOURCE = "careers_pages"
# Convention d'UA du dépôt (cf. apec.py) : nominatif, avec un contact.
_USER_AGENT = "bellum-ia/1.0 (+https://bellum-ai.com)"
_ROBOTS_TOKEN = "bellum-ia"

_TIMEOUT_S = 10.0
_MAX_BYTES = 2 * 1024 * 1024
_MAX_PAGES = 5
_MAX_SITEMAPS = 2
_MIN_GAP_S = 1.0
_MAX_REDIRECTS = 3
_MAX_AGE_DAYS = 365
_ROBOTS_TTL_S = 3600.0

_CAREERS_PATH = re.compile(
    r"carrieres?|careers?|jobs?|recrutement|emploi|rejoignez|nous-rejoindre|offres", re.IGNORECASE
)
_CAPTCHA = re.compile(r"captcha|cf-chl|are you a robot|attention required|access denied", re.IGNORECASE)
_LD_JSON = re.compile(
    r"<script[^>]*type\s*=\s*[\"']application/ld\+json[\"'][^>]*>(.*?)</script>", re.IGNORECASE | re.DOTALL
)
_LOC = re.compile(r"<loc>\s*(.*?)\s*</loc>", re.IGNORECASE | re.DOTALL)

#: robots.txt par hôte : {host: (expire_monotonic, parser | None)} — None = tout autorisé.
_ROBOTS_CACHE: dict[str, tuple[float, RobotFileParser | None]] = {}
#: Dernier instant (monotonic) où l'on a requêté un hôte — cadence ≥ 1 s.
_LAST_HIT: dict[str, float] = {}


class _StopDomain(Exception):
    """403 / 429 / captcha / robots illisible : on arrête CE domaine, sans retry."""


async def _sleep(seconds: float) -> None:
    await asyncio.sleep(seconds)


def _degrade(reason: str) -> None:
    record_degradation(get_correlation_id(), source=_SOURCE, reason=reason)


def _clean(value: object) -> str | None:
    s = " ".join(str(value or "").split())
    return s or None


def _fold(value: object) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn").lower()
    return re.sub(r"[^a-z0-9]+", "", text)


def _host_of(domain: str | None) -> str | None:
    """`https://www.Acme.com/carrieres` → ``acme.com`` ; illisible → ``None``."""
    raw = (domain or "").strip().lower()
    if not raw:
        return None
    raw = re.sub(r"^[a-z]+://", "", raw)
    # Audit IA M5 : un littéral IP (169.254.169.254, [::1]…) n'est jamais un domaine d'entreprise.
    if raw.startswith("["):
        return None
    host = raw.split("/")[0].split("?")[0].split("#")[0].split(":")[0]
    if host.startswith("www."):
        host = host[4:]
    if "." not in host or safe_fetch._literal_ip(host) is not None:  # noqa: SLF001
        return None
    return host


def _same_site(host: str, base: str) -> bool:
    host = host.lower()
    return host == base or host.endswith("." + base)


async def _pace(host: str) -> None:
    wait = _MIN_GAP_S - (time.monotonic() - _LAST_HIT.get(host, -_MIN_GAP_S))
    if wait > 0:
        await _sleep(wait)
    _LAST_HIT[host] = time.monotonic()


async def _fetch(http: httpx.AsyncClient, url: str, base: str) -> httpx.Response | None:
    """Un GET poli : cadence, throttle, UA honnête, redirections maison (même site,
    autorisées par robots.txt). 403/429 ⇒ `_StopDomain`. Autre échec ⇒ ``None``."""
    current = url
    for _hop in range(_MAX_REDIRECTS + 1):
        host = urlparse(current).hostname or ""
        if not _same_site(host, base):
            return None
        try:
            await safe_fetch.assert_public_host(host)
        except safe_fetch.UnsafeHostError:
            _degrade(f"{host}: adresse non publique, requête refusée")
            return None
        except safe_fetch.DnsResolutionError:
            return None
        if not current.endswith("/robots.txt") and not await _allowed(http, current, base):
            _degrade(f"robots.txt interdit {urlparse(current).path or '/'} sur {host}")
            return None
        await _pace(host)
        try:
            # #3925.a — un seau PAR DOMAINE (plus de seau global partagé par tous les sites).
            async with throttle_per_domain("careers_pages", host):
                resp = await http.get(current, headers={"User-Agent": _USER_AGENT, "Accept": "text/html,application/xml,text/plain"})
        except Exception as exc:  # noqa: BLE001 — une source d'appoint ne casse rien
            logger.warning("careers page fetch failed for %s: %s", current, exc)
            _degrade(f"{host}: {exc}")
            return None
        if resp.status_code in (403, 429):
            _degrade(f"{host}: HTTP {resp.status_code}, collecte arrêtée pour ce domaine")
            raise _StopDomain(host)
        if resp.status_code in (301, 302, 303, 307, 308):
            location = resp.headers.get("location")
            if not location:
                return None
            current = urljoin(current, location)
            continue
        if resp.status_code != 200:
            return None
        if len(resp.content) > _MAX_BYTES:
            _degrade(f"{host}: réponse > 2 Mo ignorée")
            return None
        return resp
    return None


async def _robots_for(http: httpx.AsyncClient, host: str, base: str) -> RobotFileParser | None:
    cached = _ROBOTS_CACHE.get(host)
    if cached and cached[0] > time.monotonic():
        return cached[1]
    resp = await _fetch(http, f"https://{host}/robots.txt", base)
    parser: RobotFileParser | None = None
    if resp is not None:
        parser = RobotFileParser()
        parser.parse(resp.text.splitlines())
    # Absent / illisible (404…) : RFC 9309 — pas de règle, tout est autorisé.
    _ROBOTS_CACHE[host] = (time.monotonic() + _ROBOTS_TTL_S, parser)
    return parser


async def _allowed(http: httpx.AsyncClient, url: str, base: str) -> bool:
    host = urlparse(url).hostname or ""
    parser = await _robots_for(http, host, base)
    return True if parser is None else parser.can_fetch(_ROBOTS_TOKEN, url)


def _parse_dt(value: object, *, end_of_day: bool = False) -> datetime | None:
    s = str(value or "").strip().replace("Z", "+00:00")
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        try:
            dt = datetime.fromisoformat(s[:10])
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    if end_of_day and len(s) <= 10:
        dt += timedelta(days=1)
    return dt


def _types(node: dict) -> list[str]:
    t = node.get("@type")
    return [str(x) for x in t] if isinstance(t, list) else [str(t)] if t else []


def _walk(node: object) -> list[dict]:
    """Tous les `JobPosting` d'un bloc JSON-LD : objet, liste ou `@graph`."""
    if isinstance(node, list):
        return [p for item in node for p in _walk(item)]
    if not isinstance(node, dict):
        return []
    found = [node] if "JobPosting" in _types(node) else []
    return found + _walk(node.get("@graph"))


def _location(raw: object) -> str | None:
    places = raw if isinstance(raw, list) else [raw]
    parts: list[str] = []
    for place in places:
        address = place.get("address") if isinstance(place, dict) else None
        if isinstance(address, dict):
            country = address.get("addressCountry")
            country = country.get("name") if isinstance(country, dict) else country
            bits = [_clean(address.get("addressLocality")) or _clean(address.get("addressRegion"))]
            if not bits[0]:
                bits = [_clean(country)]
            parts.extend(b for b in bits if b)
        elif isinstance(address, str) and _clean(address):
            parts.append(_clean(address) or "")
    return ", ".join(dict.fromkeys(parts)) or None


def _same_employer(company: str, org_name: str | None) -> bool:
    """Absent → gardée (la page est sur le domaine du compte). Présent → le contrôle
    d'employeur UNIQUE (#3915.a, `employer_match.same_employer`) sur une des formes
    du nom : un mot en commun ne suffit plus (« Acme Bakery » n'est pas « Acme »)."""
    if not org_name:
        return True
    return any(same_employer(org_name, variant) for variant in company_name_variants(company))


def _extract(html: str, page_url: str, company: str, all_roles: bool) -> list[dict]:
    now = datetime.now(UTC)
    cutoff = now - timedelta(days=_MAX_AGE_DAYS)
    postings: list[dict] = []
    for block in _LD_JSON.findall(html):
        try:
            postings.extend(_walk(json.loads(block.strip(), strict=False)))
        except ValueError:
            continue
    out: list[dict] = []
    for p in postings:
        title = _clean(p.get("title") or p.get("name"))
        if not title or (not all_roles and not is_it_offer({"intitule": title})):
            continue
        org = p.get("hiringOrganization")
        org_name = _clean(org.get("name") if isinstance(org, dict) else org)
        if not _same_employer(company, org_name):
            continue
        posted = _parse_dt(p.get("datePosted"))
        until = _parse_dt(p.get("validThrough"), end_of_day=True)
        # Lot 762 : une annonce ancienne ou échue est STOCKÉE estampillée ``historical``, jamais jetée.
        historical = bool((until and until < now) or (posted and posted < cutoff))
        location = _location(p.get("jobLocation"))
        employment = p.get("employmentType")
        employment = employment[0] if isinstance(employment, list) and employment else employment
        out.append(
            {
                "title": title,
                "location": location or "",
                "date": posted.date().isoformat() if posted else None,
                "contractType": _clean(employment),
                "skills": [],
                "company": org_name,
                "city": location,
                "url": _clean(p.get("url")) or _clean(p.get("sameAs")),
                "sourceUrl": page_url,
                "source": "careers_page",
                **({"historical": True} if historical else {}),
                "_at": posted,
            }
        )
    # Sans URL propre, l'offre porte celle de la page — avec un repère si la page
    # en liste plusieurs, pour que la déduplication par URL ne les fonde pas.
    missing = [j for j in out if not j["url"]]
    for job in missing:
        job["url"] = page_url if len(missing) == 1 else f"{page_url}#{_fold(job['title'])}"
    return out


def _sitemap_locs(xml: str) -> list[str]:
    return [loc.replace("&amp;", "&") for loc in _LOC.findall(xml)]


async def _discover(http: httpx.AsyncClient, base: str, host: str) -> list[str]:
    """URLs de pages carrières, via robots.txt (lignes Sitemap) puis les sitemaps."""
    robots = await _robots_for(http, host, base)
    declared = list(robots.site_maps() or []) if robots is not None else []
    queue = [u for u in declared if _same_site(urlparse(u).hostname or "", base)]
    queue += [f"https://{host}/sitemap.xml", f"https://{host}/sitemap_index.xml"]
    seen: set[str] = set()
    candidates: list[str] = []
    fetched = 0
    while queue and fetched < _MAX_SITEMAPS:
        url = queue.pop(0)
        if url in seen:
            continue
        seen.add(url)
        resp = await _fetch(http, url, base)
        fetched += 1
        if resp is None:
            continue
        for loc in _sitemap_locs(resp.text):
            path = urlparse(loc).path
            if loc.endswith(".xml"):
                # Sitemap d'index : un enfant de plus, sous le même plafond.
                if _same_site(urlparse(loc).hostname or "", base):
                    queue.append(loc)
            elif _CAREERS_PATH.search(path) and _same_site(urlparse(loc).hostname or "", base):
                candidates.append(loc)
    # Pages de listing d'abord (chemin le moins profond) ; l'ordre du sitemap sinon.
    candidates = list(dict.fromkeys(candidates))
    candidates.sort(key=lambda u: len([s for s in urlparse(u).path.split("/") if s]))
    return candidates


@provider_cache.cached_by(
    "jobs:careers",
    lambda company, domain=None, *, limit=12, **_: (
        f"{(company or '').strip().lower()}:{_host_of(domain) or ''}:{limit}" if _host_of(domain) else None
    ),
    ttl=provider_cache.TTL_JOBS,
)
async def it_job_signals_careers(
    company: str,
    domain: str | None,
    *,
    limit: int = 12,
    all_roles: bool = False,
    client: httpx.AsyncClient | None = None,
) -> list[dict]:
    """Offres IT lues dans le JSON-LD des pages carrières publiques du domaine.

    Sans domaine ⇒ ``[]`` sans aucun réseau. Même forme de sortie que
    `it_job_signals_ats`. Voir l'en-tête du module pour la frontière c79.
    """
    cleaned = (company or "").strip()
    base = _host_of(domain)
    if not cleaned or not base:
        return []
    limit = max(1, min(limit, 20))

    http = client
    if http is None:
        http = get_shared_client(
            "careers_pages", transport=safe_fetch.new_pinned_transport(), timeout=_TIMEOUT_S, follow_redirects=False, trust_env=False
        )
        # Aucun cookie : la politique du jar refuse tout domaine.
        from http.cookiejar import DefaultCookiePolicy

        http.cookies.jar.set_policy(DefaultCookiePolicy(allowed_domains=[]))

    found: list[dict] = []
    try:
        pages = (await _discover(http, base, base))[:_MAX_PAGES]
        for page in pages:
            resp = await _fetch(http, page, base)
            if resp is None:
                continue
            offers = _extract(resp.text, page, cleaned, all_roles)
            if not offers and _CAPTCHA.search(resp.text) and "ld+json" not in resp.text.lower():
                _degrade(f"{base}: page de vérification anti-robot, collecte arrêtée")
                break
            found.extend(offers)
    except _StopDomain:
        pass
    except Exception as exc:  # noqa: BLE001
        logger.warning("careers pages failed for %s: %s", base, exc)
        _degrade(f"{base}: {exc}")

    seen: set[str] = set()
    unique: list[dict] = []
    for job in found:
        key = str(job["url"]).lower()
        if key not in seen:
            seen.add(key)
            unique.append(job)
    _min = datetime.min.replace(tzinfo=UTC)
    unique.sort(key=lambda j: j["_at"] or _min, reverse=True)
    # #4044 — une offre de STAGE n'est jamais un signal (décision Louis 12/10).
    return drop_internship_postings([{k: v for k, v in job.items() if k != "_at"} for job in unique[:limit]], title_keys=("title",), contract_keys=("contractType",))
