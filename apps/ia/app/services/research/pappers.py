"""Phase 1 — Pappers research step.

Resolves the company name to a SIREN then pulls the full
:class:`CompanyProfile` (entreprise + cartographie). Soft-fails to
``None`` on any error so the rest of the pipeline can keep running.

``research_pappers`` is the fast path (Pappers name search). When that fails
(brand ≠ legal name, e.g. OVHcloud → OVH GROUPE SA), phase 1 calls
``resolve_pappers_via_web_or_bundle`` *after* the main Firecrawl scrape: it
reads the SIREN off pages already scraped (the official site's mentions
légales), and only falls back to a fresh web fetch if the bundle has none.
"""

from __future__ import annotations

import logging
import os

from app.middleware.correlation_id import get_correlation_id
from app.services.company_filters import DegradeReason
from app.services.pappers import (
    CompanyProfile,
    PappersAmbiguousMatchError,
    PappersNoResultError,
    PappersUnavailableError,
    get_company,
    search_company,
)
from app.services.research.siren_finder import find_siren_in_bundle, find_siren_via_web
from app.services.source_health import record_degradation

logger = logging.getLogger(__name__)


def _record_pappers_failure(exc: Exception, *, step: str) -> None:
    """Record a Pappers OUTAGE, with the typed cause when the client gave us one.

    Only reached for failures that are actually about the source. « Cette
    entreprise n'est pas au registre » never lands here — it is handled by the
    caller as the ordinary outcome it is. That distinction is the whole point:
    an état-des-sources screen built on undifferentiated entries would have
    flagged Pappers as down every time an SME was missing.
    """
    if isinstance(exc, PappersUnavailableError):
        record_degradation(
            get_correlation_id(),
            source="pappers",
            reason=f"{step}: {exc}",
            code=exc.reason,
        )
        return
    record_degradation(
        get_correlation_id(),
        source="pappers",
        reason=f"{step}: {exc}",
        # Unclassified on purpose: we know the call failed, not why. Claiming a
        # precise cause here would be inventing one.
        code=DegradeReason.UPSTREAM_ERROR,
    )


async def research_pappers(company_name: str, siren: str | None = None) -> CompanyProfile | None:
    """Fast path: resolve via the Pappers name search. ``None`` on any failure.

    When ``siren`` is provided (the user picked a specific entity in the scope
    selector — Théo p.10 : choisir le périmètre avant de lancer), we anchor the
    research directly on that SIREN via ``get_company`` and SKIP the name search.
    That's the whole point of the scope lock: "Société Générale" no longer
    re-resolves ambiguously to one of ~100 SCIs — the run targets exactly the
    entity the commercial chose.
    """
    anchor = (siren or "").strip()
    if anchor:
        try:
            return await get_company(anchor)
        except PappersNoResultError:
            # Pappers answered: this SIREN isn't in the registry. A fact about the
            # entity, not an outage — recording it would make every unknown SIREN
            # look like Pappers going down.
            logger.info("Pappers ne connaît pas le SIREN %s (scope lock) — repli sur le nom", anchor)
        except Exception as exc:
            logger.warning("Pappers get_company(%s) failed for scope lock (falling back to name): %s", anchor, exc)
            _record_pappers_failure(exc, step=f"scope lock siren {anchor}")
            # Fall through to the name search rather than aborting research.
    try:
        hit = await search_company(company_name)
        resolved = (hit.siren or "").strip()
        if anchor and resolved == anchor:
            # The name search landed on the very SIREN whose ``get_company`` just
            # failed. Asking Pappers the identical question a second time cannot
            # produce a different answer — it only spends a second credit on the
            # same failure. Report it as one degradation, not two.
            logger.warning(
                "Pappers: la recherche par nom renvoie le SIREN %s déjà en échec — "
                "pas de second appel",
                anchor,
            )
            return None
        return await get_company(resolved)
    except (PappersNoResultError, PappersAmbiguousMatchError) as exc:
        # The two "Pappers worked, we just have no usable match" outcomes. The
        # dossier is poorer, but the SOURCE is fine — the web/bundle SIREN
        # fallback exists precisely for this. Not a degradation.
        logger.info("Pas de correspondance Pappers pour %r (%s) — repli web/bundle", company_name, exc)
        return None
    except Exception as exc:
        logger.warning("Pappers name search failed (continuing, web fallback may retry): %s", exc)
        # Losing the SIREN is the largest cascade in the pipeline: no registry
        # means legalSignals, registryAnnuaire and beneficialOwners are dropped
        # wholesale from the dossier. Say which step failed and why.
        _record_pappers_failure(exc, step="recherche par nom")
        return None


async def _resolve_siren_via_web(company_name: str) -> str | None:
    """Best-effort SIREN from a fresh web fetch (mentions légales). Returns None
    if the Brave / Firecrawl keys are absent or nothing is found."""
    import httpx
    from firecrawl import AsyncFirecrawl

    # Internal single-call helpers — reused here to avoid a second web stack.
    from app.services import brave_search, firecrawl
    from app.services.research.sources import SourceCategory

    brave_key = os.environ.get("BRAVE_API_KEY", "")
    fc_key = os.environ.get("FIRECRAWL_API_KEY", "")
    if not (brave_key and fc_key):
        return None

    async with httpx.AsyncClient(timeout=30.0) as bc:
        fc = AsyncFirecrawl(api_key=fc_key)

        async def search_fn(query: str) -> list[str]:
            results = await brave_search._execute_query(query, brave_key, bc)
            return [r["url"] for r in results if r.get("url")]

        async def scrape_fn(url: str) -> str | None:
            res = await firecrawl._scrape_one(
                {"url": url, "title": "", "category": SourceCategory.OFFICIAL}, fc
            )
            return res.get("markdown")

        return await find_siren_via_web(company_name, search_fn=search_fn, scrape_fn=scrape_fn)


async def resolve_pappers_via_web_or_bundle(company_name: str, bundle_sources: object) -> CompanyProfile | None:
    """SIREN fallback when the name search failed. Reuses the already-scraped
    bundle first (no extra fetch — F1), then a fresh web fetch as last resort."""
    siren = find_siren_in_bundle(bundle_sources, company_name)
    if not siren:
        try:
            siren = await _resolve_siren_via_web(company_name)
        except Exception as exc:
            logger.warning("Pappers web SIREN fallback failed (continuing): %s", exc)
            record_degradation(
                get_correlation_id(), source="pappers", reason=f"fallback SIREN web: {exc}"
            )
            siren = None
    if not siren:
        return None
    try:
        logger.info("Pappers: resolved '%s' to SIREN %s via fallback", company_name, siren)
        return await get_company(siren)
    except PappersNoResultError:
        # The SIREN we scraped off the web isn't in the registry. That says the
        # scrape was wrong, not that Pappers is down.
        logger.info("Pappers ne connaît pas le SIREN %s issu du repli web", siren)
        return None
    except Exception as exc:
        logger.warning("Pappers get_company(%s) failed (continuing): %s", siren, exc)
        _record_pappers_failure(exc, step=f"get_company {siren}")
        return None
