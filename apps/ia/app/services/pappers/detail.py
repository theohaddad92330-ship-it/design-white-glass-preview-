"""Typed wrapper around Pappers ``/v2/entreprise`` and ``/v2/entreprise/cartographie``.

``get_company`` returns a fully-typed :class:`CompanyProfile`. The
cartographie call is optional (controlled by ``include_graph``) and
soft-fails to ``corporate_graph=None`` + ``subsidiaries=[]`` +
``parent_companies=[]`` on 404, so callers never need to special-case the
absence of a corporate graph.
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

import httpx
from pydantic import ValidationError

from app.middleware.correlation_id import get_correlation_id
from app.services import provider_cache
from app.services.rate_limiter import back_off_provider, retry_after_header, throttle

from . import budget
from ._auth import get_api_key

# Global cache namespace: the Pappers profile is public + company-scoped, so it is
# keyed by SIREN with NO user — the paid /v2/entreprise call runs ONCE per company
# and every user/run reuses it (Théo/Louis: stop re-spending credits re-scraping).
_PAPPERS_COMPANY_NS = "pappers:company"
from .cartographie import extract_group_affiliation, extract_parent_companies, extract_subsidiaries
from .models import (
    CompanyProfile,
    CorporateGraph,
    Executive,
    PappersNoResultError,
    PappersParsingError,
    PappersUnavailableError,
    classify_pappers_failure,
)

logger = logging.getLogger(__name__)

PAPPERS_DETAIL_URL = "https://api.pappers.fr/v2/entreprise"
PAPPERS_CARTOGRAPHIE_URL = "https://api.pappers.fr/v2/entreprise/cartographie"

CHAMPS_SUPPLEMENTAIRES_DEFAULT = "representants_legaux,lien_pappers"

_C_LEVEL_PATTERN = re.compile(
    r"(?i)(président|présidente|direct(?:eur|rice)\s+général[e]?(?:\s+délégué[e]?)?"
    r"|dgd|gérant|ceo|coo|cfo|cto|cdo|cmo|co[- ]fondateur|co[- ]founder)"
)

C_LEVEL_CAP = 10


def _is_c_level(role: str | None) -> bool:
    if not role:
        return False
    return bool(_C_LEVEL_PATTERN.search(role))


def _derive_revenue_latest(*sources: list[Any]) -> int | None:
    """Return the most recent non-null ``chiffre_affaires`` across any
    number of financial-year lists. Consolidated accounts win over solo
    accounts: pass them first so a holding's group-level revenue is
    preferred to the parent entity's own slim P&L (which is often null).
    """
    for source in sources:
        sorted_years = sorted(
            (f for f in source if f.year is not None),
            key=lambda f: f.year,
            reverse=True,
        )
        for entry in sorted_years:
            if entry.revenue is not None:
                return entry.revenue
    return None


def _derive_activity_label(naf_code: str | None, naf_label: str | None) -> str | None:
    if not naf_code and not naf_label:
        return None
    return f"{naf_code or ''} - {naf_label or ''}".strip(" -")


async def _fetch_cartographie(
    siren: str,
    client: httpx.AsyncClient,
    api_key: str,
) -> CorporateGraph | None:
    """Fetch the corporate graph. Returns ``None`` on 404 / parse error."""
    params = {
        "siren": siren,
        "api_token": api_key,
        "include_entreprises_dirigees": "true",
        "include_sci": "true",
        "rejeter_premier_degre": "true",
    }
    cid = get_correlation_id()
    try:
        async with throttle("pappers"):
            res = await client.get(PAPPERS_CARTOGRAPHIE_URL, params=params)
    except Exception as exc:  # noqa: BLE001
        budget.record(budget.ENDPOINT_CARTOGRAPHIE, correlation_id=cid, ok=False)
        logger.warning("Pappers cartographie request failed for %s: %s", siren, exc)
        return None

    budget.record(budget.ENDPOINT_CARTOGRAPHIE, correlation_id=cid, ok=res.is_success)

    if res.status_code == 404:
        logger.info("Pappers cartographie 404 for %s (no graph available)", siren)
        return None

    if not res.is_success:
        if res.status_code == 429:
            back_off_provider("pappers", retry_after_header(res))
        logger.warning(
            "Pappers cartographie failed for %s (status %s): %s",
            siren,
            res.status_code,
            res.text,
        )
        return None

    try:
        return CorporateGraph.model_validate(res.json())
    except ValidationError as exc:
        logger.warning("Pappers cartographie payload for %s did not parse: %s", siren, exc)
        return None


async def get_company(
    siren: str,
    *,
    include_graph: bool = True,
    http_client: httpx.AsyncClient | None = None,
) -> CompanyProfile:
    """Fetch the full Pappers profile for a SIREN.

    Calls ``/v2/entreprise`` with ``representants_legaux`` enabled, then
    optionally enriches with ``/v2/entreprise/cartographie`` for the
    corporate graph + subsidiaries hint. Raises
    :class:`PappersParsingError` only if the primary payload cannot be
    parsed (the cartographie call always soft-fails).

    Cached globally by SIREN (best-effort Redis): a cache hit returns the parsed
    profile WITHOUT any Pappers call — no credit spent, no client opened.
    """
    cache_key = f"{siren}:{int(include_graph)}"
    cached = await provider_cache.get_json(_PAPPERS_COMPANY_NS, cache_key)
    if cached is None and not include_graph:
        # CACHE-API (15/10) — « avec cartographie » est un SUR-ENSEMBLE de « sans » : un profil
        # déjà payé avec son graphe sert aussi la demande sans graphe (le graphe ne s'affiche
        # pas = se filtre à la lecture), jamais l'inverse.
        cached = await provider_cache.get_json(_PAPPERS_COMPANY_NS, f"{siren}:1")
    if cached is not None:
        try:
            profile = CompanyProfile.model_validate(cached)
        except ValidationError:
            pass  # stale/incompatible cached shape → fall through to a live fetch
        else:
            # One entreprise call + (usually) one cartographie call avoided.
            budget.record_cache_hit(budget.ENDPOINT_COMPANY)
            if include_graph:
                budget.record_cache_hit(budget.ENDPOINT_CARTOGRAPHIE)
            return profile

    api_key = get_api_key()

    owns_client = http_client is None
    client = http_client or httpx.AsyncClient(timeout=30.0)

    # The cartographie call only needs the SIREN (already known), not the parsed
    # /entreprise profile, and the Pappers limiter admits 20 concurrent — so run
    # it in parallel with the main call instead of after it (~0.5-1.5s off Phase
    # 1). It soft-fails to None internally, so awaiting it never raises.
    carto_task = (
        asyncio.ensure_future(_fetch_cartographie(siren, client, api_key)) if include_graph else None
    )

    try:
        async with throttle("pappers"):
            res = await client.get(
                PAPPERS_DETAIL_URL,
                params={
                    "siren": siren,
                    "api_token": api_key,
                    "entreprise_cessee": "false",
                    "extrait_rcs": "true",
                    "champs_supplementaires": CHAMPS_SUPPLEMENTAIRES_DEFAULT,
                },
            )

        budget.record(
            budget.ENDPOINT_COMPANY, correlation_id=get_correlation_id(), ok=res.is_success
        )

        if not res.is_success:
            # 404 = Pappers answered "no such SIREN": a fact about the company,
            # not a source outage. Everything else is the source failing, typed
            # so a spent quota is distinguishable from a bad token and a 5xx.
            if res.status_code == 404:
                logger.info("Pappers detail 404 for %s (SIREN absent du registre)", siren)
                raise PappersNoResultError(siren)
            reason = classify_pappers_failure(res.status_code, res.text)
            if res.status_code == 429:
                back_off_provider("pappers", retry_after_header(res))
            logger.error(
                "Pappers detail failed (status %s, reason %s): %s",
                res.status_code,
                reason,
                res.text,
            )
            raise PappersUnavailableError(
                res.status_code, reason, res.text, context=f"SIREN {siren}"
            )

        raw = res.json()

        # Diagnostic: what did Pappers actually give us? Without this, a
        # missing `executives` list silently looks like "no dirigeants" when
        # in fact the field arrived under a name we didn't expect or the
        # plan didn't include `representants_legaux` in champs_supplementaires.
        logger.info(
            "Pappers entreprise raw shape for %s: top_keys=%s, representants=%d, "
            "representants_legaux=%d, etablissements=%d, finances=%d",
            siren,
            sorted(raw.keys()),
            len(raw.get("representants") or []),
            len(raw.get("representants_legaux") or []),
            len(raw.get("etablissements") or []),
            len(raw.get("finances") or []),
        )

        try:
            profile = CompanyProfile.model_validate(raw)
        except ValidationError as exc:
            raise PappersParsingError(
                f"Pappers entreprise payload for SIREN {siren!r} could not be parsed"
            ) from exc

        # Derived fields
        profile.activity_label = _derive_activity_label(profile.naf_code, profile.naf_label)
        profile.revenue_latest = _derive_revenue_latest(
            profile.consolidated_financials,
            profile.financials_history,
        )
        profile.branch_count = len(profile.branches)
        profile.c_level = _select_c_level(profile.executives)

        logger.info(
            "Pappers profile parsed for %s: executives=%d, c_level=%d (roles=%s), "
            "revenue_latest=%s, naf_label=%s, headquarters=%s/%s",
            siren,
            len(profile.executives),
            len(profile.c_level),
            [e.role for e in profile.c_level],
            profile.revenue_latest,
            profile.naf_label,
            profile.headquarters.city,
            profile.headquarters.postal_code,
        )

        if carto_task is not None:
            graph = await carto_task
            carto_task = None
            if graph is not None:
                profile.corporate_graph = graph
                profile.subsidiaries = extract_subsidiaries(graph, root_siren=siren)
                # #2086.25 — DÉCISION Louis 17/09 : « groupe ou filiale », les
                # deux moitiés du fait.
                profile.parent_companies = extract_parent_companies(graph, root_siren=siren)
                # #2165.24 / #2166.3 / #2165.16 — dérivé du même graphe, aucun
                # appel Pappers supplémentaire.
                profile.group_affiliation = extract_group_affiliation(graph, root_siren=siren)
                logger.info(
                    "Pappers cartographie for %s: companies=%d, persons=%d, "
                    "c2c_edges=%d, subsidiaries=%d, parent_companies=%d",
                    siren,
                    len(graph.companies),
                    len(graph.persons),
                    len(graph.company_to_company_edges),
                    len(profile.subsidiaries),
                    len(profile.parent_companies),
                )

        # Cache the fully-assembled profile (firmo + graph + subsidiaries) globally,
        # on the FIRMO tier (registry data moves slowly).
        await provider_cache.set_json(
            _PAPPERS_COMPANY_NS, cache_key, profile.model_dump(mode="json"), ttl=provider_cache.TTL_FIRMO
        )
        return profile
    finally:
        # Cancel the in-flight cartographie task if we bailed before awaiting it
        # (e.g. the /entreprise call failed), so it doesn't linger.
        if carto_task is not None and not carto_task.done():
            carto_task.cancel()
        if owns_client:
            await client.aclose()


def _select_c_level(executives: list[Executive]) -> list[Executive]:
    """Return the executive subset whose role matches the C-level regex.

    Mutates the original entries' ``is_c_level`` flag so consumers can also
    iterate the full ``executives`` list and read the boolean per row.
    """
    c_level: list[Executive] = []
    for exec_ in executives:
        if _is_c_level(exec_.role):
            exec_.is_c_level = True
            if len(c_level) < C_LEVEL_CAP:
                c_level.append(exec_)
    return c_level
