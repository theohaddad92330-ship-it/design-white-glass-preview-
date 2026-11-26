"""Typed wrapper around Pappers ``/v2/recherche``.

``search_company`` resolves a name to the single best-match SIREN, raising
``PappersAmbiguousMatchError`` when the top hit doesn't look like the
query. ``search_company_suggestions`` keeps the soft-fail list behaviour
required by the autocomplete UX.
"""

from __future__ import annotations

import json
import logging
from difflib import SequenceMatcher
from typing import Literal

import httpx
from pydantic import ValidationError

from app.middleware.correlation_id import get_correlation_id
from app.services import provider_cache
from app.services.rate_limiter import back_off_provider, retry_after_header, throttle

from . import budget
from ._auth import get_api_key
from .models import (
    CompanySearchHit,
    CompanySearchParams,
    PappersAmbiguousMatchError,
    PappersNoResultError,
    PappersParsingError,
    PappersUnavailableError,
    classify_pappers_failure,
)

logger = logging.getLogger(__name__)

PAPPERS_SEARCH_URL = "https://api.pappers.fr/v2/recherche"

# Cache namespaces. Company-scoped and public, so keyed with NO user — the same
# name typed by two commerciaux (or by the same one twice) costs ONE call.
#
# `get_company(siren)` was already cached; these two were not, and they are the
# high-VOLUME half: the autocomplete fires one search per typing pause (300 ms
# debounce), and the onboarding prefill + Découvrir add more. That is what
# drained the production quota while the expensive-looking /v2/entreprise call
# sat safely behind its 30-day cache.
#
# Two namespaces, not one: the two helpers cache different shapes (a single raw
# hit vs a list of raw hits) and must never be served to one another.
_NS_SEARCH_TOP = "pappers:search:top"
_NS_SEARCH_SUGGESTIONS = "pappers:search:suggestions"

# Below this Jaro-like ratio the top hit is treated as ambiguous.
MIN_NAME_SIMILARITY = 0.55


def _similarity(query: str, candidate: str | None) -> float:
    if not candidate:
        return 0.0
    return SequenceMatcher(None, query.lower().strip(), candidate.lower().strip()).ratio()


PappersPrecision = Literal["approximative", "standard", "exacte"]


def _merge_defaults(
    name: str,
    filters: CompanySearchParams | None,
    *,
    per_page: int,
    precision: PappersPrecision = "standard",
) -> CompanySearchParams:
    base = filters.model_copy(deep=True) if filters else CompanySearchParams()
    base.q = name
    if base.per_page is None:
        base.per_page = per_page
    if base.precision is None:
        base.precision = precision
    if base.has_ceased is None:
        base.has_ceased = False
    return base


def search_cache_key(params: CompanySearchParams) -> str:
    """Cache key for a ``/v2/recherche`` request: the EXACT query, minus the token.

    Derived from ``to_query`` — the very dict handed to httpx — rather than from
    the query text alone. That is the whole safety property: two requests share a
    cache entry **iff** they would send the same bytes to Pappers. Add a
    ``naf_code``, change ``precision``, ask for 20 results instead of 5, and the
    key changes, so a filtered search can never be answered with an unfiltered
    one. Serving the response of a *different* question would be fabricated data
    (CLAUDE.md : jamais de données fictives), which is exactly the failure mode a
    naive ``key = name.lower()`` would have shipped.

    The API token is excluded: it is a credential, not part of the question, and
    it must never reach Redis or the ``source_cache`` table. Sorted JSON keeps the
    key deterministic across field ordering — and readable in a log.
    """
    query = params.to_query("")
    query.pop("api_token", None)
    return json.dumps(query, sort_keys=True, ensure_ascii=False)


async def _fetch_search(
    params: CompanySearchParams,
    api_key: str,
    client: httpx.AsyncClient,
    *,
    on_error: str,
) -> list[dict] | None:
    """One billable ``/v2/recherche`` call → the raw ``resultats`` list.

    ``on_error='raise'`` keeps ``search_company``'s loud contract, now as a TYPED
    :class:`PappersUnavailableError` carrying the status and a
    :class:`DegradeReason` rather than a bare ``ValueError`` whose only content
    was a formatted string. ``record_degradation`` upstream can then group on the
    cause instead of re-parsing prose — and a spent quota stops reading like a
    bad token, which matters because Pappers answers 401 for both.
    ``on_error='soft'`` returns ``None`` for the autocomplete, which must never
    turn a provider hiccup into a broken typing flow. Either way the call is
    counted into the Pappers budget, successful or not — a rising error rate IS
    the "quota exhausted" signal.
    """
    cid = get_correlation_id()
    async with throttle("pappers"):
        res = await client.get(PAPPERS_SEARCH_URL, params=params.to_query(api_key))

    budget.record(budget.ENDPOINT_SEARCH, correlation_id=cid, ok=res.is_success)

    if not res.is_success:
        reason = classify_pappers_failure(res.status_code, res.text)
        if res.status_code == 429:
            back_off_provider("pappers", retry_after_header(res))
        if on_error == "raise":
            logger.error(
                "Pappers search failed (status %s, reason %s): %s",
                res.status_code,
                reason,
                res.text,
            )
            raise PappersUnavailableError(
                res.status_code, reason, res.text, context=f"recherche {params.q or ''!r}"
            )
        logger.warning(
            "Pappers suggestions failed (status %s, reason %s): %s",
            res.status_code,
            reason,
            res.text,
        )
        return None

    data = res.json()
    return data.get("resultats") or []


async def _cached_search(
    namespace: str,
    params: CompanySearchParams,
    api_key: str,
    client: httpx.AsyncClient,
    *,
    on_error: str,
) -> list[dict] | None:
    """Cached ``/v2/recherche``. A hit costs NO call and no credit.

    Only a non-empty result is cached: an error and an empty result set are both
    re-tried next time. Caching a ``[]`` produced by a 401 « plus assez de
    crédits » would freeze every dropdown empty for the whole TTL — the outage
    would outlive the quota top-up.
    """
    key = search_cache_key(params)
    cached = await provider_cache.get_json(namespace, key)
    if cached is not None:
        budget.record_cache_hit(budget.ENDPOINT_SEARCH)
        return cached

    resultats = await _fetch_search(params, api_key, client, on_error=on_error)
    if resultats:
        await provider_cache.set_json(
            namespace, key, resultats, ttl=provider_cache.TTL_REGISTRY_SEARCH
        )
    return resultats


async def search_company(
    name: str,
    *,
    filters: CompanySearchParams | None = None,
    http_client: httpx.AsyncClient | None = None,
) -> CompanySearchHit:
    """Resolve ``name`` to the single best-match Pappers hit.

    Always constrains the request to ``par_page=1`` and
    ``entreprise_cessee=false`` unless overridden via ``filters``. If the
    similarity between ``name`` and the top hit's legal name falls under
    :data:`MIN_NAME_SIMILARITY`, raises :class:`PappersAmbiguousMatchError`
    so the pipeline can soft-fail loudly instead of silently picking a
    wrong SIREN.

    Cached for 24 h on the EXACT query (see :func:`search_cache_key`). What is
    cached is Pappers' RAW answer, not the verdict: the similarity gate is
    re-applied on every call, hit or miss. A cache must make an answer cheaper,
    never change it.
    """
    api_key = get_api_key()
    params = _merge_defaults(name, filters, per_page=1)

    owns_client = http_client is None
    client = http_client or httpx.AsyncClient(timeout=30.0)

    try:
        # The HTTP call (and its now-typed failure) lives in _fetch_search, behind
        # the 24h cache origin/main added. A cache hit costs no call and no credit.
        resultats = await _cached_search(
            _NS_SEARCH_TOP, params, api_key, client, on_error="raise"
        )
        if not resultats:
            # Pappers answered, and the answer is "not in the registry". That is
            # a fact about the COMPANY, not about the source — it must never be
            # recorded as a Pappers degradation.
            raise PappersNoResultError(name)

        raw_hit = resultats[0]
        try:
            hit = CompanySearchHit.model_validate(raw_hit)
        except ValidationError as exc:
            raise PappersParsingError(
                f"Pappers search payload for '{name}' could not be parsed"
            ) from exc

        score = _similarity(name, hit.legal_name)
        if score < MIN_NAME_SIMILARITY:
            raise PappersAmbiguousMatchError(name, hit.legal_name, score)

        return hit
    finally:
        if owns_client:
            await client.aclose()


async def search_company_suggestions(
    name: str,
    *,
    limit: int = 5,
    filters: CompanySearchParams | None = None,
    http_client: httpx.AsyncClient | None = None,
) -> list[CompanySearchHit]:
    """Autocomplete helper.

    Soft-fails to ``[]`` on transport / API errors so an empty
    autocomplete never breaks the user's typing flow.

    This is the single largest Pappers consumer by volume — one call per typing
    pause, per user, with nothing shared between them — so it is cached for 24 h
    on the exact query. The cache is GLOBAL (no user in the key): the second
    commercial to type "Capgemini" today pays nothing.
    """
    api_key = get_api_key()
    # Autocomplete is strict on purpose: a single exact match avoids the
    # commercial picking a near-namesake by mistake. Callers that want
    # broader matching can pass an explicit `precision` via `filters`.
    params = _merge_defaults(name, filters, per_page=limit, precision="approximative")

    owns_client = http_client is None
    client = http_client or httpx.AsyncClient(timeout=10.0)

    try:
        resultats = await _cached_search(
            _NS_SEARCH_SUGGESTIONS, params, api_key, client, on_error="soft"
        )
        if not resultats:
            return []

        out: list[CompanySearchHit] = []
        for raw in resultats:
            try:
                out.append(CompanySearchHit.model_validate(raw))
            except ValidationError as exc:
                logger.warning("Skipping unparseable suggestion: %s", exc)
        return out
    except Exception as exc:  # noqa: BLE001 — soft-fail for autocomplete
        logger.warning("Pappers suggestions request failed: %s", exc)
        return []
    finally:
        if owns_client:
            await client.aclose()
