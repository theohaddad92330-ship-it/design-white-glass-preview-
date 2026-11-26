"""Registry LIST-BUILDING on Pappers ``/v2/recherche`` (Découvrir v2).

``search_company`` / ``search_company_suggestions`` answer « which SIREN is this
company? ». This module answers the opposite question — « which companies match
these criteria? » — which is what the Découvrir screen needs before any LLM is
involved (agent_docs/discover-v2-contract.md: *le registre produit la liste*).

It is deliberately NOT built on ``search_company_suggestions``: that helper
swallows every failure into ``[]``, and the contract requires a source that is
tokenless / rate-limited / erroring to surface a machine-readable reason for
``DiscoverResponse.degraded``. Here every failure mode is mapped to a
:class:`DegradeReason` and appended to the caller's sink — empty result, loud
cause, never an invented row.
"""

from __future__ import annotations

import logging

import httpx
from pydantic import ValidationError

from app.middleware.correlation_id import get_correlation_id
from app.services import provider_cache
from app.services.company_filters import (
    CompanyDiscoveryFilters,
    DegradeReason,
    degraded_entry,
    department_from_postal_code,
    iso_to_pappers_date,
)
from app.services.rate_limiter import RateLimitTimeout, back_off_provider, retry_after_header, throttle

from . import budget
from ._auth import get_api_key
from .models import CompanySearchHit, CompanySearchParams
from .search import PAPPERS_SEARCH_URL, search_cache_key

logger = logging.getLogger(__name__)

SOURCE_NAME = "pappers"

# Criteria-based lists are cached on the same 24 h tier as the name searches and
# for the same reason: « NAF 62.02 × dept 69 × effectif 250-499 » returns the same
# companies all day, and Découvrir is re-run with identical criteria constantly
# (pagination, back-navigation, two commerciaux on the same segment).
_NS_DISCOVERY = "pappers:discovery"

# Pappers caps a page; keep the request within a sane bound whatever the caller asks.
MAX_PER_PAGE = 100

_STATUS_REASONS: dict[int, str] = {
    401: DegradeReason.UNAUTHORIZED,
    403: DegradeReason.UNAUTHORIZED,
    402: DegradeReason.QUOTA_EXCEEDED,
    429: DegradeReason.RATE_LIMITED,
}


def pappers_can_answer_geography(filters: CompanyDiscoveryFilters) -> bool:
    """Pappers peut-il honorer la maille GÉOGRAPHIQUE demandée ?

    `False` dès qu'une commune ou un cercle est demandé : ces deux critères
    n'ont pas d'équivalent VÉRIFIÉ chez Pappers, et `CompanySearchParams` les
    refuse (`extra="forbid"`). Un repli qui les jetterait rendrait un
    département là où l'écran promet une ville ou douze kilomètres.

    Ce prédicat est LU par le routeur, pas seulement écrit ici : voir
    ``POST /companies/discover``. Sans lecteur, il serait exactement le défaut
    n°1 du dépôt — du code juste que personne n'appelle.
    """
    return filters.commune_code is None and filters.radius_km is None


def to_pappers_search_params(filters: CompanyDiscoveryFilters) -> CompanySearchParams:
    """Map the source-agnostic filters onto Pappers' typed query params.

    Only criteria the caller actually set are carried over, so an empty
    ``CompanyDiscoveryFilters`` produces an empty ``CompanySearchParams`` and the
    pre-existing autocomplete requests stay byte-identical. Pagination,
    ``precision`` and ``par_page`` are left to the caller.

    ``naf_section`` has no Pappers equivalent (it is a gouv.fr-only facet) and is
    intentionally dropped rather than approximated.

    ⚠️ **La commune et le cercle ne sont PAS mappés, et ce n'est pas un oubli.**
    `CompanySearchParams` porte `extra="forbid"` et n'a ni `code_commune` ni
    `lat`/`long`/`radius` ; leur équivalent Pappers, s'il existe, n'a pas été
    vérifié sur une instance réelle — et un contrat d'API non vérifiable ne se
    devine pas. Les laisser tomber ici SANS RIEN DIRE rendrait le département
    entier sous l'étiquette « à 12 km de Toulouse », ce qui est pire qu'une
    erreur : c'est une réponse fausse qui a l'air juste. C'est pourquoi
    :func:`pappers_can_answer_geography` existe, et pourquoi le routeur refuse
    ce repli plutôt que de l'élargir en silence.

    ⚠️ ``naf_code`` peut porter une LISTE de codes séparés par des virgules
    depuis que Découvrir croise plusieurs secteurs. Que Pappers la lise comme un
    OU est **NON VÉRIFIÉ** : ça demanderait une clé et un appel réel, et un
    contrat d'API non vérifiable ne se devine pas. Le risque est borné — la
    source gouv.fr, elle MESURÉE (`30.30Z,29.10Z` → 1423 = 745 + 678), couvre
    désormais ces critères et passe donc en premier ; Pappers n'est appelé qu'en
    repli, quand le gratuit ne rend rien. À lever le jour où une clé est
    disponible.
    """
    return CompanySearchParams(
        q=filters.q,
        cursor=filters.cursor,
        naf_code=filters.naf_code,
        department=filters.department,
        region=filters.region,
        postal_code=filters.postal_code,
        legal_category=filters.legal_category,
        corporate_purpose=filters.corporate_purpose,
        on_headquarters_only=filters.on_headquarters_only,
        has_ceased=filters.has_ceased,
        headcount_tranche_min=filters.headcount_tranche_min,
        headcount_tranche_max=filters.headcount_tranche_max,
        # Pappers takes numeric ranges as strings (see CompanySearchParams).
        revenue_min=None if filters.revenue_min is None else str(filters.revenue_min),
        revenue_max=None if filters.revenue_max is None else str(filters.revenue_max),
        capital_min=None if filters.capital_min is None else str(filters.capital_min),
        capital_max=None if filters.capital_max is None else str(filters.capital_max),
        # ISO in, JJ-MM-AAAA out — Pappers' documented date format.
        creation_date_min=iso_to_pappers_date(filters.creation_date_min),
        creation_date_max=iso_to_pappers_date(filters.creation_date_max),
        publication_type=filters.publication_type,
        publication_date_min=iso_to_pappers_date(filters.publication_date_min),
        publication_date_max=iso_to_pappers_date(filters.publication_date_max),
    )


def _headcount_range(hit: CompanySearchHit) -> str | None:
    """Registry headcount bracket. Prefers Pappers' own label; otherwise rebuilds
    it from the min/max bounds it returned. Absent → ``None``, never guessed."""
    if hit.headcount_label:
        return hit.headcount_label
    if hit.headcount_min is not None and hit.headcount_max is not None:
        return f"{hit.headcount_min} à {hit.headcount_max} salariés"
    return None


def _to_row(hit: CompanySearchHit) -> dict | None:
    """Registry half of ``DiscoverCandidate``. ``None`` when the hit carries no
    SIREN — « Pas de SIREN = candidat écarté »."""
    siren = (hit.siren or "").strip()
    name = (hit.legal_name or hit.denomination or "").strip()
    if not siren or not name:
        return None
    return {
        "source": SOURCE_NAME,
        "name": name,
        "siren": siren,
        "nafCode": hit.naf_code,
        "sector": hit.naf_label,
        "city": hit.city,
        "department": hit.department or department_from_postal_code(hit.postal_code),
        "headcountRange": _headcount_range(hit),
        "creationDate": hit.creation_date,
    }


async def search_companies_filtered(
    filters: CompanyDiscoveryFilters,
    limit: int = 25,
    *,
    degraded: list[dict[str, str]] | None = None,
    http_client: httpx.AsyncClient | None = None,
) -> list[dict]:
    """List companies matching ``filters`` from the Pappers registry.

    Returns at most ``limit`` rows shaped like the registry half of
    ``DiscoverCandidate`` (name, siren, nafCode, sector, city, department,
    headcountRange, creationDate + ``source``). Rows without a SIREN are dropped.

    Never raises and never invents: on a missing token, a rate limit, a quota, a
    transport failure or an unparseable payload it returns ``[]`` and appends one
    ``{source, reason}`` entry to ``degraded`` (when a sink is provided) for the
    caller to expose in ``DiscoverResponse.degraded``.
    """
    sink = degraded if degraded is not None else []

    try:
        api_key = get_api_key()
    except ValueError:
        # Tokenless is a normal, expected state (the keyless gouv.fr source is
        # the documented fallback) — no network call, just a stated degradation.
        logger.info("pappers discovery skipped: no PAPPERS_API_KEY")
        sink.append(degraded_entry(SOURCE_NAME, DegradeReason.MISSING_API_KEY))
        return []

    params = to_pappers_search_params(filters)
    params.per_page = max(1, min(int(limit), MAX_PER_PAGE))
    if params.precision is None:
        params.precision = "approximative"
    if params.has_ceased is None:
        params.has_ceased = False

    # A cache hit costs no call and no credit. Nothing is appended to ``degraded``:
    # the rows ARE the ones Pappers returned for these exact criteria, so nothing
    # degraded — the key is derived from the full query (see ``search_cache_key``),
    # never from the free-text alone.
    cache_key = f"{search_cache_key(params)}|limit={params.per_page}"
    cached = await provider_cache.get_json(_NS_DISCOVERY, cache_key)
    if isinstance(cached, list):
        budget.record_cache_hit(budget.ENDPOINT_SEARCH)
        return cached[:limit]

    owns_client = http_client is None
    client = http_client or httpx.AsyncClient(timeout=15.0)
    try:
        async with throttle(SOURCE_NAME):
            res = await client.get(PAPPERS_SEARCH_URL, params=params.to_query(api_key))

        budget.record(
            budget.ENDPOINT_SEARCH, correlation_id=get_correlation_id(), ok=res.is_success
        )

        if not res.is_success:
            reason = _STATUS_REASONS.get(res.status_code, DegradeReason.UPSTREAM_ERROR)
            if res.status_code == 429:
                back_off_provider("pappers", retry_after_header(res))
            # #4447 — un refus du fournisseur (503…) est DIT dans `degraded[]` : warning, pas error (Sentry).
            logger.warning(
                "pappers discovery failed (status %s, reason %s)", res.status_code, reason
            )
            sink.append(degraded_entry(SOURCE_NAME, reason))
            return []

        payload = res.json()
    except RateLimitTimeout as exc:
        logger.warning("pappers discovery rate-limit deadline: %s", exc)  # #4447
        sink.append(degraded_entry(SOURCE_NAME, DegradeReason.RATE_LIMITED))
        return []
    except (httpx.HTTPError, OSError) as exc:
        logger.warning("pappers discovery transport failure: %s", exc)  # #4447
        sink.append(degraded_entry(SOURCE_NAME, DegradeReason.NETWORK_ERROR))
        return []
    except ValueError as exc:  # res.json() on a non-JSON body
        logger.error("pappers discovery returned a non-JSON body: %s", exc)
        sink.append(degraded_entry(SOURCE_NAME, DegradeReason.INVALID_RESPONSE))
        return []
    finally:
        if owns_client:
            await client.aclose()

    resultats = payload.get("resultats") if isinstance(payload, dict) else None
    if not isinstance(resultats, list):
        logger.error("pappers discovery payload has no `resultats` list")
        sink.append(degraded_entry(SOURCE_NAME, DegradeReason.INVALID_RESPONSE))
        return []

    rows: list[dict] = []
    for raw in resultats:
        try:
            hit = CompanySearchHit.model_validate(raw)
        except ValidationError as exc:
            logger.warning("pappers discovery: skipping unparseable hit: %s", exc)
            continue
        row = _to_row(hit)
        if row is not None:
            rows.append(row)

    # Only a non-empty answer is cached. An empty list is indistinguishable from
    # « the criteria matched nothing today » and must stay re-tryable.
    if rows:
        await provider_cache.set_json(
            _NS_DISCOVERY, cache_key, rows, ttl=provider_cache.TTL_REGISTRY_SEARCH
        )
    return rows[:limit]


__all__ = ["SOURCE_NAME", "search_companies_filtered", "to_pappers_search_params"]
