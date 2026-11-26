"""Workable, SmartRecruiters, Recruitee, Teamtailor, Personio (#3925, partie 2).

Cinq ATS PUBLICS de plus, à côté de Greenhouse et Lever (`ats_boards`). Chaque
point d'accès a été VÉRIFIÉ en direct (curl, sans cookie ni authentification) le
**2026-10-08** sur un job board réel ; ce qui n'a pas pu l'être n'est pas écrit.

    Workable        GET https://apply.workable.com/api/v1/widget/accounts/{slug}?details=true
                    vérifié sur `huggingface` → {name, description, jobs:[{title,
                    shortcode, url, published_on, city, country, …}]}.
                    Un compte inconnu répond 404 OU 200 `jobs: []`.
    SmartRecruiters GET https://api.smartrecruiters.com/v1/companies/{id}/postings?limit=100
                    vérifié sur `Ubisoft2` → {content:[{id, name, company:{identifier,
                    name}, releasedDate, location:{city,country,fullLocation}}]}.
                    URL publique : https://jobs.smartrecruiters.com/{identifier}/{id}
                    (200 vérifié). Compte inconnu : 200 `content: []`.
    Recruitee       GET https://{slug}.recruitee.com/api/offers/
                    vérifié sur `bunq` → {offers:[{title, company_name, careers_url,
                    published_at "AAAA-MM-JJ HH:MM:SS UTC", location, city, …}]}.
                    Compte inconnu : 404.
    Teamtailor      GET https://{slug}.teamtailor.com/jobs.rss
                    vérifié sur `storytel` → RSS 2.0, <channel><title> = nom de
                    l'entreprise, <item>{title, link, pubDate, tt:locations}.
                    Compte inconnu : 404.
    Personio        GET https://{slug}.jobs.personio.de/xml
                    vérifié sur `mobimeo` et `personio` → <workzag-jobs><position>
                    {id, [subcompany], office, name, createdAt}. URL publique :
                    https://{slug}.jobs.personio.de/job/{id} (200 vérifié).
                    Compte inconnu : 404.

NON VÉRIFIÉS, donc non écrits : le point d'accès `POST /api/v3/accounts/{slug}/jobs`
de Workable (non documenté publiquement) et tout flux d'un domaine personnalisé
Teamtailor (`jobs.exemple.com`) — seul `{slug}.teamtailor.com` est interrogé.

Même règle d'ATTRIBUTION que `ats_boards` : on n'attribue que sur PREUVE.
Le slug vient du domaine du compte (de confiance), ou la réponse NOMME l'entreprise
(`name` Workable, `company.name` SmartRecruiters, `company_name` Recruitee,
`<channel><title>` Teamtailor, `<subcompany>` Personio — sinon offre écartée).

Frontière c79 : endpoints publics documentés, aucun cookie, aucune authentification,
user-agent honnête, aucun contournement. 403/429 ⇒ ARRÊT pour ce slug (et ses
variantes : on n'insiste pas), tracé par `record_degradation`. 4 essais de slug au
plus par ATS et par compte. Échec quelconque ⇒ ``[]``.
"""

from __future__ import annotations

import json
import logging
import os
import socket
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from email.utils import parsedate_to_datetime
from xml.etree import ElementTree

import httpx

from app.middleware.correlation_id import get_correlation_id
from app.services.company_name_variants import company_name_variants
from app.services.data_sources.ats_boards import (
    _MAX_AGE_DAYS,
    _clean,
    _domain_slug,
    _is_it_title,
    _parse_iso,
    _slug,
)
from app.services.data_sources.employer_match import same_employer
from app.services.rate_limiter import back_off_provider, retry_after_header, throttle
from app.services.source_health import error_reason, record_degradation

logger = logging.getLogger(__name__)

_WORKABLE_URL = "https://apply.workable.com/api/v1/widget/accounts/{slug}"
_SMARTRECRUITERS_URL = "https://api.smartrecruiters.com/v1/companies/{slug}/postings"
_RECRUITEE_URL = "https://{slug}.recruitee.com/api/offers/"
_TEAMTAILOR_URL = "https://{slug}.teamtailor.com/jobs.rss"
_PERSONIO_URL = "https://{slug}.jobs.personio.de/xml"
_PERSONIO_JOB_URL = "https://{slug}.jobs.personio.de/job/{id}"
#: Plafond de pages SmartRecruiters (100 offres chacune).
_SMARTRECRUITERS_MAX_PAGES = 3
_SMARTRECRUITERS_JOB_URL = "https://jobs.smartrecruiters.com/{ident}/{id}"

#: Plafond d'essais de slug par ATS et par compte (décision #3925).
_MAX_SLUG_TRIES = 4
#: Au-delà, une réponse n'est pas un job board : on ne la lit pas.
_MAX_BODY_BYTES = 3_000_000
_UA = "Mozilla/5.0 (compatible; BellumAI/1.0; +https://bellum-ai.com)"
_TT_NS = "{https://teamtailor.com/locations}"

# Résultats d'un GET.
_OK, _ABSENT, _STOP = "ok", "absent", "stop"


def extra_ats_enabled() -> bool:
    """`ATS_EXTRA_ENABLED` (défaut VRAI) — l'interrupteur des cinq ATS ajoutés."""
    return os.getenv("ATS_EXTRA_ENABLED", "true").strip().lower() not in {"0", "false", "no", "off"}


_DNS_MARKERS = ("name or service not known", "nodename nor servname", "name resolution", "getaddrinfo failed")


def _is_dns_failure(exc: BaseException) -> bool:
    """Échec de RÉSOLUTION DNS (``gaierror``, ou ``ConnectError`` qui en porte le message)."""
    seen: BaseException | None = exc
    for _ in range(4):
        if seen is None:
            return False
        if isinstance(seen, socket.gaierror) or any(m in str(seen).lower() for m in _DNS_MARKERS):
            return True
        seen = seen.__cause__ or seen.__context__
    return False


async def _fetch(http: httpx.AsyncClient, url: str, bucket: str, params: dict | None = None) -> tuple[str, str | None]:
    """Un GET qui ne lève jamais. 404 = absent ; 403/429 = ARRÊT (jamais de contournement).

    Le seau de débit est appliqué par l'APPELANT avec une clé littérale (garde
    `test_upstream_throttle_coverage`) ; ``bucket`` n'est que le nom du seau.
    """
    try:
        resp = await http.get(url, params=params or {}, headers={"User-Agent": _UA, "Accept": "*/*"})
        if resp.status_code == 404:
            return _ABSENT, None
        if resp.status_code in (403, 429):
            if resp.status_code == 429:
                back_off_provider(bucket, retry_after_header(resp))
            record_degradation(get_correlation_id(), source=bucket, reason=f"HTTP {resp.status_code}")
            return _STOP, None
        resp.raise_for_status()
        body = resp.text
        if len(body) > _MAX_BODY_BYTES:
            return _ABSENT, None
        return _OK, body
    except Exception as exc:  # noqa: BLE001 — une source d'appoint ne casse rien
        if _is_dns_failure(exc):
            # Sous-domaine deviné inexistant = « pas de compte », comme le 404 : rien à dégrader.
            return _ABSENT, None
        logger.warning("ATS board %s failed for %s: %s", bucket, url, exc)
        record_degradation(get_correlation_id(), source=bucket, reason=error_reason(exc))
        return _ABSENT, None


def _names_company(company: str, siren: str | None, got: object) -> bool:
    """La réponse NOMME-t-elle ce compte ? (une des formes de son nom)

    #3915.a/b — le contrôle d'employeur UNIQUE (`employer_match.same_employer`),
    plus l'inclusion dans les deux sens : « Renault » n'accepte plus « Renault Trucks ».
    """
    return any(
        variant != siren and same_employer(got, variant) for variant in company_name_variants(company, siren=siren)
    )


def _candidates(company: str, website: str | None, siren: str | None) -> list[tuple[str, bool]]:
    """(slug, de_confiance) — le domaine d'abord, puis les formes du nom ; ≤ 4."""
    out: list[tuple[str, bool]] = []
    seen: set[str] = set()
    domain = _domain_slug(website)
    if domain:
        seen.add(domain)
        out.append((domain, True))
    for variant in company_name_variants(company, siren=siren):
        if variant == siren:
            continue  # un SIREN ne nomme aucun board
        slug = _slug(variant)
        if slug and slug not in seen:
            seen.add(slug)
            out.append((slug, False))
    return out[:_MAX_SLUG_TRIES]


def _finish(raw: list[dict]) -> list[dict]:
    """Retrait de la clé interne ``_at`` — AUCUNE borne d'âge de stockage (lot 762) : l'estampille ``historical``
    est posée par ``ats_boards`` d'après la date."""
    return [{k: v for k, v in job.items() if k != "_at"} for job in raw]


def _signal(*, source: str, title: str, url: str | None, location: str | None, at: datetime | None, company: str | None = None, contract: str | None = None, city: str | None = None) -> dict:
    return {
        "title": title,
        "location": location or "",
        "date": at.date().isoformat() if at else None,
        "contractType": contract,
        "skills": [],
        "company": company,
        "city": city,
        "url": url,
        "source": source,
        "_at": at,
    }


async def _try_slugs(
    company: str,
    website: str | None,
    siren: str | None,
    fetch: Callable[[str], Awaitable[tuple[str, str | None]]],
    parse: Callable[[str, str, bool], list[dict]],
) -> list[dict]:
    cleaned = (company or "").strip()
    if not cleaned:
        return []
    for slug, trusted in _candidates(cleaned, website, siren):
        status, body = await fetch(slug)
        if status == _STOP:
            return []  # 403/429 : on n'insiste pas, ni sur ce slug ni sur ses variantes
        if status != _OK or not body:
            continue
        try:
            jobs = parse(body, slug, trusted)
        except Exception as exc:  # noqa: BLE001 — un format inattendu n'est jamais une panne
            logger.warning("ATS extra parse failed for %s: %s", slug, exc)
            continue
        kept = _finish(jobs)
        if kept:
            return kept
    return []


def _json(body: str) -> object:
    try:
        return json.loads(body)
    except ValueError:
        return None


def _xml(body: str) -> ElementTree.Element | None:
    """Parse un flux XML public. DOCTYPE/ENTITY refusés : pas d'expansion d'entités."""
    head = body[:4096].upper()
    if "<!DOCTYPE" in head or "<!ENTITY" in head:
        return None
    try:
        return ElementTree.fromstring(body)
    except ElementTree.ParseError:
        return None


# --- Workable -------------------------------------------------------------------


def _parse_workable(company: str, siren: str | None, all_roles: bool):
    def parse(body: str, _slug_: str, trusted: bool) -> list[dict]:
        data = _json(body)
        jobs = data.get("jobs") if isinstance(data, dict) else None
        if not isinstance(jobs, list) or not jobs:
            return []
        name = _clean(data.get("name"))
        if not trusted and not _names_company(company, siren, name):
            return []
        out = []
        for job in jobs:
            if not isinstance(job, dict):
                continue
            title = _clean(job.get("title"))
            if not title or (not all_roles and not _is_it_title(title)):
                continue
            city, country = _clean(job.get("city")), _clean(job.get("country"))
            out.append(
                _signal(
                    source="workable",
                    title=title,
                    url=_clean(job.get("url")) or _clean(job.get("shortlink")),
                    location=", ".join(p for p in (city, country) if p),
                    at=_parse_iso(job.get("published_on")) or _parse_iso(job.get("created_at")),
                    company=name,
                    contract=_clean(job.get("employment_type")),
                    city=city,
                )
            )
        return out

    return parse


async def workable_jobs(company: str, *, website: str | None = None, http: httpx.AsyncClient, all_roles: bool = False, siren: str | None = None) -> list[dict]:
    async def fetch(slug: str) -> tuple[str, str | None]:
        async with throttle("workable"):
            return await _fetch(http, _WORKABLE_URL.format(slug=slug), "workable", {"details": "true"})

    return await _try_slugs(company, website, siren, fetch, _parse_workable(company, siren, all_roles))


# --- SmartRecruiters ------------------------------------------------------------


def _parse_smartrecruiters(company: str, siren: str | None, all_roles: bool):
    def parse(body: str, slug: str, trusted: bool) -> list[dict]:
        data = _json(body)
        content = data.get("content") if isinstance(data, dict) else None
        if not isinstance(content, list) or not content:
            return []
        out = []
        for post in content:
            if not isinstance(post, dict):
                continue
            comp = post.get("company") if isinstance(post.get("company"), dict) else {}
            if not trusted and not _names_company(company, siren, comp.get("name")):
                continue
            title = _clean(post.get("name"))
            if not title or (not all_roles and not _is_it_title(title)):
                continue
            loc = post.get("location") if isinstance(post.get("location"), dict) else {}
            kind = post.get("typeOfEmployment") if isinstance(post.get("typeOfEmployment"), dict) else {}
            pid = _clean(post.get("id"))
            ident = _clean(comp.get("identifier")) or slug
            out.append(
                _signal(
                    source="smartrecruiters",
                    title=title,
                    url=_SMARTRECRUITERS_JOB_URL.format(ident=ident, id=pid) if pid else None,
                    location=_clean(loc.get("fullLocation")) or _clean(loc.get("city")),
                    at=_parse_iso(post.get("releasedDate")),
                    company=_clean(comp.get("name")),
                    contract=_clean(kind.get("label")),
                    city=_clean(loc.get("city")),
                )
            )
        return out

    return parse


async def smartrecruiters_jobs(company: str, *, website: str | None = None, http: httpx.AsyncClient, all_roles: bool = False, siren: str | None = None) -> list[dict]:
    async def fetch(slug: str) -> tuple[str, str | None]:
        # #4016 SIG-D6 — doc SmartRecruiters : `limit` ≤ 100, `offset`, `totalFound` ;
        # page suivante tant qu'il en reste (au plus _SMARTRECRUITERS_MAX_PAGES pages).
        url = _SMARTRECRUITERS_URL.format(slug=slug)
        async with throttle("smartrecruiters"):
            status, body = await _fetch(http, url, "smartrecruiters", {"limit": "100"})
        for page in range(1, _SMARTRECRUITERS_MAX_PAGES):
            data = _json(body) if status == _OK and body else None
            content = data.get("content") if isinstance(data, dict) else None
            total = data.get("totalFound") if isinstance(data, dict) else None
            if not isinstance(content, list) or not isinstance(total, int) or len(content) >= total:
                break
            async with throttle("smartrecruiters"):
                nxt_status, nxt_body = await _fetch(
                    http, url, "smartrecruiters", {"limit": "100", "offset": str(page * 100)}
                )
            nxt = _json(nxt_body) if nxt_status == _OK and nxt_body else None
            more = nxt.get("content") if isinstance(nxt, dict) else None
            if not isinstance(more, list) or not more:
                break  # la page 1 reste acquise : un échec de page 2 ne la perd pas
            data["content"] = [*content, *more]
            body = json.dumps(data)
        return status, body

    return await _try_slugs(company, website, siren, fetch, _parse_smartrecruiters(company, siren, all_roles))


# --- Recruitee ------------------------------------------------------------------


def _parse_recruitee(company: str, siren: str | None, all_roles: bool):
    def parse(body: str, _slug_: str, trusted: bool) -> list[dict]:
        data = _json(body)
        offers = data.get("offers") if isinstance(data, dict) else None
        if not isinstance(offers, list) or not offers:
            return []
        out = []
        for offer in offers:
            if not isinstance(offer, dict):
                continue
            if not trusted and not _names_company(company, siren, offer.get("company_name")):
                continue
            title = _clean(offer.get("title"))
            if not title or (not all_roles and not _is_it_title(title)):
                continue
            # « 2026-10-05 16:05:18 UTC » → ISO
            stamp = str(offer.get("published_at") or offer.get("created_at") or "").replace(" UTC", "+00:00")
            out.append(
                _signal(
                    source="recruitee",
                    title=title,
                    url=_clean(offer.get("careers_url")),
                    location=_clean(offer.get("location")) or _clean(offer.get("city")),
                    at=_parse_iso(stamp),
                    company=_clean(offer.get("company_name")),
                    contract=_clean(offer.get("employment_type_code")),
                    city=_clean(offer.get("city")),
                )
            )
        return out

    return parse


async def recruitee_jobs(company: str, *, website: str | None = None, http: httpx.AsyncClient, all_roles: bool = False, siren: str | None = None) -> list[dict]:
    async def fetch(slug: str) -> tuple[str, str | None]:
        async with throttle("recruitee"):
            return await _fetch(http, _RECRUITEE_URL.format(slug=slug), "recruitee")

    return await _try_slugs(company, website, siren, fetch, _parse_recruitee(company, siren, all_roles))


# --- Teamtailor -----------------------------------------------------------------


def _parse_teamtailor(company: str, siren: str | None, all_roles: bool):
    def parse(body: str, _slug_: str, trusted: bool) -> list[dict]:
        root = _xml(body)
        channel = root.find("channel") if root is not None else None
        if channel is None:
            return []
        name = _clean(channel.findtext("title"))
        if not trusted and not _names_company(company, siren, name):
            return []
        out = []
        for item in channel.findall("item"):
            title = _clean(item.findtext("title"))
            if not title or (not all_roles and not _is_it_title(title)):
                continue
            try:
                at = parsedate_to_datetime(item.findtext("pubDate") or "")
                at = at if at.tzinfo else at.replace(tzinfo=UTC)
            except (TypeError, ValueError):
                at = None
            loc = item.find(f"{_TT_NS}locations/{_TT_NS}location")
            city = _clean(loc.findtext(f"{_TT_NS}city")) if loc is not None else None
            country = _clean(loc.findtext(f"{_TT_NS}country")) if loc is not None else None
            out.append(
                _signal(
                    source="teamtailor",
                    title=title,
                    url=_clean(item.findtext("link")),
                    location=", ".join(p for p in (city, country) if p),
                    at=at,
                    company=name,
                    city=city,
                )
            )
        return out

    return parse


async def teamtailor_jobs(company: str, *, website: str | None = None, http: httpx.AsyncClient, all_roles: bool = False, siren: str | None = None) -> list[dict]:
    async def fetch(slug: str) -> tuple[str, str | None]:
        async with throttle("teamtailor"):
            return await _fetch(http, _TEAMTAILOR_URL.format(slug=slug), "teamtailor")

    return await _try_slugs(company, website, siren, fetch, _parse_teamtailor(company, siren, all_roles))


# --- Personio -------------------------------------------------------------------


def _parse_personio(company: str, siren: str | None, all_roles: bool):
    def parse(body: str, slug: str, trusted: bool) -> list[dict]:
        root = _xml(body)
        if root is None:
            return []
        out = []
        for pos in root.findall("position"):
            # Personio ne nomme l'entreprise que par <subcompany>, quand il existe :
            # sans domaine de confiance et sans ce nom, l'offre est écartée.
            if not trusted and not _names_company(company, siren, pos.findtext("subcompany")):
                continue
            title = _clean(pos.findtext("name"))
            if not title or (not all_roles and not _is_it_title(title)):
                continue
            pid = _clean(pos.findtext("id"))
            office = _clean(pos.findtext("office"))
            out.append(
                _signal(
                    source="personio",
                    title=title,
                    url=_PERSONIO_JOB_URL.format(slug=slug, id=pid) if pid else None,
                    location=office,
                    at=_parse_iso(pos.findtext("createdAt")),
                    company=_clean(pos.findtext("subcompany")),
                    contract=_clean(pos.findtext("employmentType")),
                    city=office,
                )
            )
        return out

    return parse


async def personio_jobs(company: str, *, website: str | None = None, http: httpx.AsyncClient, all_roles: bool = False, siren: str | None = None) -> list[dict]:
    async def fetch(slug: str) -> tuple[str, str | None]:
        async with throttle("personio"):
            return await _fetch(http, _PERSONIO_URL.format(slug=slug), "personio")

    return await _try_slugs(company, website, siren, fetch, _parse_personio(company, siren, all_roles))


#: L'ordre d'interrogation, après Greenhouse et Lever. Le premier ATS qui rend des
#: offres arrête la recherche (même logique que Greenhouse → Lever).
EXTRA_ADAPTERS = (workable_jobs, smartrecruiters_jobs, recruitee_jobs, teamtailor_jobs, personio_jobs)
