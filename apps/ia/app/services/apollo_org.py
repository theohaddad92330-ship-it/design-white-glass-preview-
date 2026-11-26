"""Apollo.io Organization Enrichment — logo réel + firmographie FACTUELLE.

``GET /api/v1/organizations/enrich?domain=X`` (1 crédit Apollo / domaine) renvoie
le logo de l'entreprise et des données firmographiques (employés estimés,
industrie, année de fondation, LinkedIn/Twitter, funding, technologies).

Règles :
  - env-gated sur ``APOLLO_API_KEY`` — sans clé : no-op strict (None, zéro réseau) ;
  - JAMAIS de donnée inventée : champ absent chez Apollo = absent ici, échec
    HTTP/réseau = None (le pipeline continue sans le bloc) ;
  - coût maîtrisé : un hit RÉEL est mis en cache Redis 30 jours par domaine
    (deux comptes sur le même domaine = 1 seul crédit) ; les miss/erreurs ne
    sont jamais cachés (la donnée Apollo s'améliore avec le temps).

Doc : https://docs.apollo.io/reference/organization-enrichment
"""

from __future__ import annotations

import hashlib
import logging
import os
import time
from datetime import date
from typing import Any, TypedDict, cast

import httpx
from pydantic import BaseModel, Field

from app.services import provider_cache, source_cache
from app.services.distributed_rate_limiter import get_client, redis_url
from app.services.rate_limiter import back_off_provider, retry_after_header, throttle

logger = logging.getLogger(__name__)

APOLLO_ORG_ENRICH_URL = "https://api.apollo.io/api/v1/organizations/enrich"

# Un logo/une firmographie persistés < 30 j ne se re-paient pas (mission :
# « ne ré-enrichis pas si logo déjà persisté < 30j »).
_ORG_CACHE_TTL_S = int(os.getenv("APOLLO_ORG_CACHE_TTL_S", str(30 * 24 * 3600)))

# Bounded so a pathological payload can't bloat raw_analysis / the prompt.
_MAX_TECHNOLOGIES = 12
_MAX_KEYWORDS = 20
_MAX_DEPARTMENTS = 15
_MAX_FUNDING_EVENTS = 10
_MAX_SUBORGANIZATIONS = 20
_MAX_NAICS = 10


# ─── Apollo wire shape (TypedDict — static doc, no runtime validation) ───────


class ApolloTechnologyRaw(TypedDict, total=False):
    name: str
    category: str


class ApolloOrgEnrichRaw(TypedDict, total=False):
    """Subset of Apollo's `organization` shape we actually read."""

    id: str
    name: str
    primary_domain: str
    logo_url: str
    estimated_num_employees: int
    industry: str
    founded_year: int
    linkedin_url: str
    twitter_url: str
    total_funding_printed: str
    latest_funding_stage: str
    latest_funding_round_date: str
    annual_revenue: float
    annual_revenue_printed: str
    current_technologies: list[ApolloTechnologyRaw]
    technology_names: list[str]
    # Factual extras present on the SAME organizations/enrich payload (zero extra
    # cost): company blurb, postal address, phone, stock listing, headcount by
    # department, keywords, parent org, retail footprint.
    short_description: str
    seo_description: str
    raw_address: str
    street_address: str
    city: str
    state: str
    country: str
    postal_code: str
    phone: str
    sanitized_phone: str
    primary_phone: dict[str, Any]
    publicly_traded_symbol: str
    publicly_traded_exchange: str
    departmental_head_count: dict[str, Any]
    keywords: list[str]
    parent: str
    subsidiary_of: str
    owned_by_organization: dict[str, Any]
    retail_location_count: int
    # LOT (15/10) DATA-A point 9 — payés par le MÊME appel et jusqu'ici jetés.
    organization_headcount_six_month_growth: float
    organization_headcount_twelve_month_growth: float
    organization_headcount_twenty_four_month_growth: float
    funding_events: list[dict[str, Any]]
    suborganizations: list[dict[str, Any]]
    ultimate_parent: dict[str, Any]
    ultimate_parent_organization: dict[str, Any]
    naics_codes: list[str]


class ApolloOrgEnrichResponseRaw(TypedDict, total=False):
    organization: ApolloOrgEnrichRaw | None


# ─── Typed output (camelCase wire — mirrors AnalysisApolloOrgEnrichment) ─────


class ApolloOrgEnrichment(BaseModel):
    """Factual org enrichment. Dumped ``by_alias=True, exclude_none=True`` so the
    wire (→ ``raw_analysis.apolloEnrichment`` → ``accounts.apollo_enrichment``)
    matches ``AnalysisApolloOrgEnrichment`` in ``@bellum/contracts``: absent
    field = absent key, rien d'inventé."""

    # Apollo's own organization id — the strongest People-Search scope key
    # (`organization_ids`). Persisted so a later per-contact enrichment scopes the
    # role search to THIS org instead of fuzzy-matching a messy entity label.
    organization_id: str | None = Field(default=None, serialization_alias="organizationId")
    domain: str | None = None
    logo_url: str | None = Field(default=None, serialization_alias="logoUrl")
    estimated_num_employees: int | None = Field(default=None, serialization_alias="estimatedNumEmployees")
    industry: str | None = None
    founded_year: int | None = Field(default=None, serialization_alias="foundedYear")
    linkedin_url: str | None = Field(default=None, serialization_alias="linkedinUrl")
    twitter_url: str | None = Field(default=None, serialization_alias="twitterUrl")
    total_funding_printed: str | None = Field(default=None, serialization_alias="totalFundingPrinted")
    latest_funding_stage: str | None = Field(default=None, serialization_alias="latestFundingStage")
    # #3917.a — date (AAAA-MM-JJ) du dernier tour. Sans elle, montant et stade sont
    # RETIRÉS : un financement non daté ne s'affiche jamais comme s'il était récent.
    latest_funding_round_date: str | None = Field(default=None, serialization_alias="latestFundingRoundDate")
    # Chiffre d'affaires NUMÉRIQUE, à côté de la version pré-imprimée. Le front en
    # a besoin pour CONFRONTER Apollo au chiffre déposé au registre (#818) : on ne
    # peut pas comparer « $1.2B » à un montant déposé. Absent chez Apollo ⇒ absent
    # ici ⇒ aucun écart n'est calculé (present-only, jamais de valeur reconstruite).
    annual_revenue: float | None = Field(default=None, serialization_alias="annualRevenue")
    annual_revenue_printed: str | None = Field(default=None, serialization_alias="annualRevenuePrinted")
    # None (absent on the wire) when Apollo lists none — absent = absent.
    technologies: list[str] | None = None
    # ─ Extra factual fields (same call, no extra Apollo credit) ─
    short_description: str | None = Field(default=None, serialization_alias="shortDescription")
    raw_address: str | None = Field(default=None, serialization_alias="rawAddress")
    city: str | None = None
    state: str | None = None
    country: str | None = None
    postal_code: str | None = Field(default=None, serialization_alias="postalCode")
    phone: str | None = None
    publicly_traded_symbol: str | None = Field(default=None, serialization_alias="publiclyTradedSymbol")
    publicly_traded_exchange: str | None = Field(default=None, serialization_alias="publiclyTradedExchange")
    # Headcount per department (positive ints only). None when Apollo lists none.
    departmental_head_count: dict[str, int] | None = Field(default=None, serialization_alias="departmentalHeadCount")
    keywords: list[str] | None = None
    parent_organization: str | None = Field(default=None, serialization_alias="parentOrganization")
    retail_location_count: int | None = Field(default=None, serialization_alias="retailLocationCount")
    # ─ LOT (15/10) DATA-A point 9 — ce que l'appel payant rendait et qu'on jetait (même crédit) ─
    # Croissance des effectifs (ratio, ex. 0.04 = +4 %), présente seulement : un 0 n'est stocké que si Apollo l'envoie.
    headcount_growth: dict[str, float] | None = Field(default=None, serialization_alias="headcountGrowth")
    funding_events: list[dict[str, str]] | None = Field(default=None, serialization_alias="fundingEvents")
    suborganizations: list[dict[str, str]] | None = None
    ultimate_parent: dict[str, str] | None = Field(default=None, serialization_alias="ultimateParent")
    naics_codes: list[str] | None = Field(default=None, serialization_alias="naicsCodes")
    # Technologies AVEC leur catégorie ; `technologies` (noms seuls) reste inchangé.
    technologies_detailed: list[dict[str, str]] | None = Field(default=None, serialization_alias="technologiesDetailed")


# ─── Extraction (raw Apollo org → typed pieces) ──────────────────────────────


def _clean_str(raw: Any) -> str | None:
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    return None


def _clean_int(raw: Any) -> int | None:
    # Apollo emits ints; bool is an int subclass — exclude it explicitly.
    if isinstance(raw, bool):
        return None
    if isinstance(raw, int) and raw > 0:
        return raw
    return None


def _clean_number(raw: Any) -> float | None:
    """Nombre positif, ou ``None``. Apollo envoie le CA en nombre ; une chaîne, un
    zéro ou un booléen ne sont pas un chiffre d'affaires et ne doivent pas devenir
    une valeur — un CA à 0 affiché comme un fait serait une donnée inventée."""
    if isinstance(raw, bool):
        return None
    if isinstance(raw, (int, float)) and raw > 0:
        return float(raw)
    return None


def _clean_str_list(raw: Any, limit: int) -> list[str]:
    """Deduped (case-insensitive, order-preserving), bounded list of non-empty
    strings. Non-list / empty input → ``[]``."""
    if not isinstance(raw, list):
        return []
    seen: set[str] = set()
    out: list[str] = []
    for item in raw:
        value = _clean_str(item)
        if value is None:
            continue
        key = value.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(value)
        if len(out) >= limit:
            break
    return out


def _clean_head_counts(raw: Any) -> dict[str, int]:
    """Apollo's ``departmental_head_count`` → ``{department: positive int}``.
    Zero / non-positive / non-int values are dropped (a department Apollo has no
    figure for is absent, never shown as 0). Bounded, sorted by headcount desc."""
    if not isinstance(raw, dict):
        return {}
    pairs: list[tuple[str, int]] = []
    for key, value in raw.items():
        name = _clean_str(key)
        count = _clean_int(value)
        if name is not None and count is not None:
            pairs.append((name, count))
    pairs.sort(key=lambda p: p[1], reverse=True)
    return dict(pairs[:_MAX_DEPARTMENTS])


def _extract_address(org: ApolloOrgEnrichRaw) -> str | None:
    """A single display address line. Prefer Apollo's pre-formatted ``raw_address``;
    otherwise compose from the components. ``None`` when nothing is present."""
    raw = _clean_str(org.get("raw_address"))
    if raw:
        return raw
    postal_city = " ".join(
        p for p in (_clean_str(org.get("postal_code")), _clean_str(org.get("city"))) if p
    )
    parts = [
        _clean_str(org.get("street_address")),
        postal_city or None,
        _clean_str(org.get("state")),
        _clean_str(org.get("country")),
    ]
    joined = ", ".join(p for p in parts if p)
    return joined or None


def _extract_phone(org: ApolloOrgEnrichRaw) -> str | None:
    """Phone from ``phone``, the ``primary_phone`` object, or ``sanitized_phone``."""
    primary = org.get("primary_phone")
    primary_number = _clean_str(primary.get("number")) if isinstance(primary, dict) else None
    return _clean_str(org.get("phone")) or primary_number or _clean_str(org.get("sanitized_phone"))


def _extract_parent(org: ApolloOrgEnrichRaw) -> str | None:
    """Parent / owning company name, present-only. Apollo exposes this as a plain
    ``parent`` / ``subsidiary_of`` string or an ``owned_by_organization`` object."""
    owned_by = org.get("owned_by_organization")
    owned_name = _clean_str(owned_by.get("name")) if isinstance(owned_by, dict) else None
    return _clean_str(org.get("parent")) or owned_name or _clean_str(org.get("subsidiary_of"))


def _extract_technologies(org: ApolloOrgEnrichRaw) -> list[str]:
    """Names from ``current_technologies`` first (the curated list), falling back
    to the flat ``technology_names``. Deduped (order-preserving), bounded."""
    names: list[str] = []
    current = org.get("current_technologies")
    if isinstance(current, list):
        for item in current:
            if isinstance(item, dict):
                name = _clean_str(item.get("name"))
                if name:
                    names.append(name)
    if not names:
        flat = org.get("technology_names")
        if isinstance(flat, list):
            names = [s for s in (_clean_str(x) for x in flat) if s]
    seen: set[str] = set()
    out: list[str] = []
    for name in names:
        key = name.lower()
        if key not in seen:
            seen.add(key)
            out.append(name)
    return out[:_MAX_TECHNOLOGIES]


def _clean_date(raw: Any) -> str | None:
    """``AAAA-MM-JJ`` d'une date ISO Apollo (``2021-02-01T00:00:00.000+00:00``), sinon None."""
    text = _clean_str(raw)
    if not text:
        return None
    try:
        return date.fromisoformat(text[:10]).isoformat()
    except ValueError:
        return None


def _clean_ratio(raw: Any) -> float | None:
    """Un ratio de croissance (négatif ou nul possibles : c'est une mesure). Absent / non numérique ⇒ None."""
    if isinstance(raw, bool) or not isinstance(raw, (int, float)):
        return None
    return float(raw)


def _extract_headcount_growth(org: ApolloOrgEnrichRaw) -> dict[str, float]:
    pairs = (
        ("sixMonths", org.get("organization_headcount_six_month_growth")),
        ("twelveMonths", org.get("organization_headcount_twelve_month_growth")),
        ("twentyFourMonths", org.get("organization_headcount_twenty_four_month_growth")),
    )
    return {key: value for key, raw in pairs if (value := _clean_ratio(raw)) is not None}


def _extract_funding_events(org: ApolloOrgEnrichRaw) -> list[dict[str, str]]:
    """Tours de financement DATÉS (un tour sans date n'est pas un fait récent), plus récent d'abord."""
    events: list[dict[str, str]] = []
    for item in org.get("funding_events") or []:
        if not isinstance(item, dict):
            continue
        when = _clean_date(item.get("date"))
        if not when:
            continue
        entry = {"date": when}
        for src, dst in (("type", "type"), ("amount", "amount"), ("currency", "currency"), ("investors", "investors"), ("news_url", "newsUrl")):
            value = _clean_str(item.get(src)) if not isinstance(item.get(src), (int, float)) else str(item.get(src))
            if value:
                entry[dst] = value
        events.append(entry)
    events.sort(key=lambda e: e["date"], reverse=True)
    return events[:_MAX_FUNDING_EVENTS]


def _named(item: Any) -> dict[str, str] | None:
    if not isinstance(item, dict):
        return None
    name = _clean_str(item.get("name"))
    if not name:
        return None
    out = {"name": name}
    site = _clean_str(item.get("website_url")) or _clean_str(item.get("primary_domain"))
    if site:
        out["websiteUrl"] = site
    return out


def _extract_suborganizations(org: ApolloOrgEnrichRaw) -> list[dict[str, str]]:
    seen: set[str] = set()
    out: list[dict[str, str]] = []
    for item in org.get("suborganizations") or []:
        named = _named(item)
        if named and named["name"].lower() not in seen:
            seen.add(named["name"].lower())
            out.append(named)
    return out[:_MAX_SUBORGANIZATIONS]


def _extract_technologies_detailed(org: ApolloOrgEnrichRaw) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in org.get("current_technologies") or []:
        if not isinstance(item, dict):
            continue
        name = _clean_str(item.get("name"))
        if not name or name.lower() in seen:
            continue
        seen.add(name.lower())
        entry = {"name": name}
        category = _clean_str(item.get("category"))
        if category:
            entry["category"] = category
        out.append(entry)
    return out[:_MAX_TECHNOLOGIES]


def _to_org_enrichment(org: ApolloOrgEnrichRaw, domain: str) -> ApolloOrgEnrichment:
    # #3917.a — financement daté ou retiré (champ lu par Apollo sur le même appel ;
    # absent ⇒ montant et stade retirés, jamais une date devinée).
    funding_date = _clean_date(org.get("latest_funding_round_date"))
    return ApolloOrgEnrichment(
        organization_id=_clean_str(org.get("id")),
        domain=_clean_str(org.get("primary_domain")) or domain,
        logo_url=_clean_str(org.get("logo_url")),
        estimated_num_employees=_clean_int(org.get("estimated_num_employees")),
        industry=_clean_str(org.get("industry")),
        founded_year=_clean_int(org.get("founded_year")),
        linkedin_url=_clean_str(org.get("linkedin_url")),
        twitter_url=_clean_str(org.get("twitter_url")),
        total_funding_printed=_clean_str(org.get("total_funding_printed")) if funding_date else None,
        latest_funding_stage=_clean_str(org.get("latest_funding_stage")) if funding_date else None,
        latest_funding_round_date=funding_date
        if (org.get("total_funding_printed") or org.get("latest_funding_stage"))
        else None,
        annual_revenue=_clean_number(org.get("annual_revenue")),
        annual_revenue_printed=_clean_str(org.get("annual_revenue_printed")),
        technologies=_extract_technologies(org) or None,
        short_description=_clean_str(org.get("short_description")) or _clean_str(org.get("seo_description")),
        raw_address=_extract_address(org),
        city=_clean_str(org.get("city")),
        state=_clean_str(org.get("state")),
        country=_clean_str(org.get("country")),
        postal_code=_clean_str(org.get("postal_code")),
        phone=_extract_phone(org),
        publicly_traded_symbol=_clean_str(org.get("publicly_traded_symbol")),
        publicly_traded_exchange=_clean_str(org.get("publicly_traded_exchange")),
        departmental_head_count=_clean_head_counts(org.get("departmental_head_count")) or None,
        keywords=_clean_str_list(org.get("keywords"), _MAX_KEYWORDS) or None,
        parent_organization=_extract_parent(org),
        retail_location_count=_clean_int(org.get("retail_location_count")),
        headcount_growth=_extract_headcount_growth(org) or None,
        funding_events=_extract_funding_events(org) or None,
        suborganizations=_extract_suborganizations(org) or None,
        ultimate_parent=_named(org.get("ultimate_parent") or org.get("ultimate_parent_organization")),
        naics_codes=_clean_str_list(org.get("naics_codes"), _MAX_NAICS) or None,
        technologies_detailed=_extract_technologies_detailed(org) or None,
    )


# ─── 30-day Redis cache (same best-effort pattern as the People-Match cache) ─
#
# L2 durable (Postgres via ``source_cache``, lot 16 / câble 3 / GA-323) sits
# UNDER this same Redis L1, exactly like ``provider_cache``/``scrape_cache``
# already layer it: same identity key (the domain — no user_id), same
# best-effort guarantees, Redis miss falls through to Postgres before ever
# re-spending the Apollo credit, and an L2 hit backfills L1 with the
# REMAINING ttl (Redis can never outlive the Postgres expiry).

_CACHE_NAMESPACE = "apollo:org_enrich"


def _org_cache_key(domain: str) -> str:
    return "apollo:orgenrich:" + hashlib.sha256(domain.strip().lower().encode("utf-8")).hexdigest()


async def _org_cache_redis():
    """Pooled redis client, or None when caching is unavailable (best-effort)."""
    url = redis_url()
    if not url:
        return None
    try:
        return await get_client(url)
    except Exception as exc:  # noqa: BLE001 — cache is best-effort
        logger.debug("Apollo org cache: Redis unavailable (%s) — caching off", exc)
        return None


# ─── Public API ──────────────────────────────────────────────────────────────


async def enrich_organization(
    domain: str | None,
    http_client: httpx.AsyncClient | None = None,
) -> ApolloOrgEnrichment | None:
    """Enrich a company by registrable domain via Apollo Organization Enrichment.

    Returns ``None`` (no network call for the no-key/no-domain cases) when:
      - ``APOLLO_API_KEY`` is not configured (env-gated no-op),
      - ``domain`` is empty/None,
      - Apollo has no record for the domain, or the call fails (graceful).
    A real hit is cached 30 days per domain — Redis (L1) backed by a durable
    Postgres tier (L2, ``source_cache``) so a Redis eviction never re-spends
    the Apollo credit (lot 16 / GA-323) — so re-analyses don't re-spend the
    Apollo credit; misses and errors are never cached.
    """
    domain = (domain or "").strip().lower()
    if not domain:
        return None
    api_key = os.environ.get("APOLLO_API_KEY", "")
    if not api_key:
        return None

    key = _org_cache_key(domain)
    r = await _org_cache_redis()
    if r is not None:
        try:
            raw = await r.get(key)
            if raw:
                source_cache.record_hit(_CACHE_NAMESPACE)
                provider_cache.log_call("firmo:apollo_org", hit=True)
                return ApolloOrgEnrichment.model_validate_json(raw)
        except Exception as exc:  # noqa: BLE001 — best-effort
            logger.debug("Apollo org cache get failed: %s", exc)

    # L2 durable — survives the Redis eviction that L1 alone can't (GA-323).
    entry = await source_cache.get(_CACHE_NAMESPACE, domain)
    if entry is not None:
        payload, remaining_s = entry
        try:
            result = ApolloOrgEnrichment.model_validate(payload)
        except Exception as exc:  # noqa: BLE001 — malformed row: fall through to live
            logger.debug("Apollo org cache L2 decode failed: %s", exc)
        else:
            source_cache.record_hit(_CACHE_NAMESPACE)
            provider_cache.log_call("firmo:apollo_org", hit=True)
            if r is not None:
                try:  # backfill L1 with the REMAINING ttl (never outlive L2)
                    await r.set(key, result.model_dump_json(), ex=max(remaining_s, 1))
                except Exception as exc:  # noqa: BLE001 — backfill is a nicety
                    logger.debug("Apollo org cache L1 backfill failed: %s", exc)
            return result
    source_cache.record_miss(_CACHE_NAMESPACE)
    provider_cache.log_call("firmo:apollo_org", hit=False)

    result = await _enrich_organization_uncached(domain, api_key, http_client=http_client)

    if result is not None:
        r = await _org_cache_redis()
        if r is not None:
            try:
                await r.set(key, result.model_dump_json(), ex=_ORG_CACHE_TTL_S)
            except Exception as exc:  # noqa: BLE001 — best-effort
                logger.debug("Apollo org cache set failed: %s", exc)
        await source_cache.put(_CACHE_NAMESPACE, domain, result.model_dump(mode="json"), _ORG_CACHE_TTL_S)
    return result


async def _enrich_organization_uncached(
    domain: str,
    api_key: str,
    http_client: httpx.AsyncClient | None = None,
) -> ApolloOrgEnrichment | None:
    client = http_client or httpx.AsyncClient(timeout=30)
    should_close = http_client is None
    started = time.monotonic()

    try:
        try:
            async with throttle("apollo"):
                res = await client.get(
                    APOLLO_ORG_ENRICH_URL,
                    params={"domain": domain},
                    headers={"x-api-key": api_key, "Content-Type": "application/json"},
                )
        except (httpx.TransportError, httpx.TimeoutException) as exc:
            logger.warning("Apollo org enrich network error: domain=%r exc=%s", domain, exc)
            return None

        duration_ms = int((time.monotonic() - started) * 1000)

        if not res.is_success:
            if res.status_code == 429:
                # Le jeton acquis ne dit rien du débit RÉEL qu'Apollo accepte —
                # même compartiment partagé que search_people (throttle("apollo")).
                back_off_provider("apollo", retry_after_header(res))
            # Graceful on every failure mode (403 plan, 429, 5xx…): the dossier
            # simply ships without the Apollo firmographics block.
            logger.warning(
                "Apollo org enrich error: domain=%r status=%d duration_ms=%d body=%s",
                domain,
                res.status_code,
                duration_ms,
                res.text[:300],
            )
            return None

        try:
            body = cast(ApolloOrgEnrichResponseRaw, res.json())
        except ValueError:
            logger.warning("Apollo org enrich: 200 but non-JSON body domain=%r", domain)
            return None

        org = body.get("organization")
        if not isinstance(org, dict):
            logger.info("Apollo org enrich miss domain=%r duration_ms=%d", domain, duration_ms)
            return None

        result = _to_org_enrichment(org, domain)
        logger.info(
            "Apollo org enrich hit domain=%r logo=%s employees=%s industry=%s duration_ms=%d",
            domain,
            bool(result.logo_url),
            result.estimated_num_employees,
            result.industry or "-",
            duration_ms,
        )
        return result
    finally:
        if should_close:
            await client.aclose()
