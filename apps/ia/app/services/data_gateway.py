"""IA v2 Data Gateway — one search + enrich abstraction over many providers.

Two responsibilities, both opt-in and NO FAKE (a provider without its key makes
no network call and contributes nothing — we never fabricate data):

1. ``search(query)`` — a **waterfall** over web-search providers:

       Serper (Google SERP) → Tavily → Brave

   The first provider WITH A KEY is tried; on an **empty result or an error** we
   fall through to the next keyed provider; a provider with no key is skipped
   entirely (no network). Whichever keyed provider returns hits first wins.

2. ``collect_fr_signals(company)`` — consolidates the existing free FR public
   sources (recherche-entreprises registry, BOAMP public tenders, IT jobs
   France-Travail + APEC (opt-in) + WTTJ (no-op documenté) merged/URL-deduped,
   BODACC legal events) behind ONE interface with **graceful per-source
   failure**: any single source that errors degrades to empty without sinking the
   others. France-Travail already no-ops without its OAuth creds; BODACC needs a
   SIREN (taken from the arg or derived from the registry lookup).

This module is **additive**: it only ever ADDS deduped web-search hits to the web
block. With no search-provider key every provider no-ops (no network call), so it
contributes nothing and the pipeline behaves exactly as before.
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import TypedDict

import httpx

from app.middleware.correlation_id import get_correlation_id
from app.services.brave_search import BRAVE_API_URL
from app.services.company_filters import reason_for_status
from app.services.data_sources.apec import it_job_signals_apec
from app.services.data_sources.bodacc import legal_signals
from app.services.data_sources.france_travail import it_job_signals
from app.services.data_sources.public_tenders import public_tenders
from app.services.data_sources.recherche_entreprises import fetch_company
from app.services.data_sources.serper import serper_search
from app.services.data_sources.tavily import tavily_search
from app.services.data_sources.wttj import it_job_signals_wttj
from app.services.dated_signals import merge_job_signals
from app.services.kill_switch import DATA_GATEWAY_KILL_SWITCH, disabled
from app.services.provider_cache import TTL_SEARCH, cached_json
from app.services.rate_limiter import throttle
from app.services.source_health import record_degradation

from app.services import cost_ledger

logger = logging.getLogger(__name__)

# Human label used in logs → the canonical source name the warning templates and
# source_health registry key on. Kept next to the labels so the two never drift.
_FR_SIGNAL_SOURCES: dict[str, str] = {
    "recherche-entreprises": "recherche_entreprises",
    "BOAMP": "boamp",
    "France-Travail": "france_travail",
    "APEC": "apec",
    "WTTJ": "welcome_to_the_jungle",
}

_BRAVE_TIMEOUT_S = 10.0

# Waterfall order: (provider name, gating env var). The matching search callable
# is resolved from the module globals at call time inside ``DataGateway.search``
# so tests can monkeypatch a provider in place.
_WATERFALL: tuple[tuple[str, str], ...] = (
    ("serper", "SERPER_API_KEY"),
    ("tavily", "TAVILY_API_KEY"),
    ("brave", "BRAVE_API_KEY"),
)

# provider_cache / source_cache namespace for the whole waterfall's cached
# result (C6, correctif C) — declared in source_cache._NAMESPACES so hit/miss
# counters see it under the "data_gateway" source, not the generic bucket.
_SEARCH_CACHE_NAMESPACE = "search:gateway"
_BASE_FETCH_LIMIT = 10
_MAX_FETCH_LIMIT = 20


class GatewayHit(TypedDict):
    """A single normalized web-search hit from any waterfall provider."""

    title: str
    url: str
    description: str
    source: str
    #: #2616.1 — la date RÉELLE que le fournisseur rend pour ce résultat, quand il
    #: en rend une (Brave ``page_age``/``age``, Serper ``date``, Tavily
    #: ``published_date``) — jamais devinée, ``""`` sinon. Sans ce champ, un
    #: appelant qui juge la fraîcheur d'un hit (``source_judge.judge_source``) ne
    #: peut compter QUE sur une date embarquée dans l'URL — or une offre d'emploi
    #: réelle (Lever/Greenhouse/Teamtailor/SmartRecruiters/Welcomekit) n'en porte
    #: JAMAIS : c'était la cause du 23/23 France Travail en recette du 23/09/2026
    #: malgré un waterfall déjà branché (`job_search.py`) — chaque ligne était
    #: droppée en silence, pas absente de code.
    date: str


def _has_key(env: str) -> bool:
    return bool(os.environ.get(env, "").strip())


async def brave_search_single(query: str, *, limit: int = 10, client: httpx.AsyncClient | None = None) -> list[dict]:
    """Single-query Brave web search — the waterfall's last resort, reusing the
    existing ``BRAVE_API_KEY`` + endpoint + ``brave`` throttle (a light-weight
    counterpart to the multi-query ``brave_search.search``). Empty without a key
    (no network call) or on any error."""
    key = os.environ.get("BRAVE_API_KEY", "").strip()
    cleaned = (query or "").strip()
    if not key or not cleaned:
        return []

    limit = max(1, min(limit, 20))
    owns = client is None
    http = client or httpx.AsyncClient(timeout=_BRAVE_TIMEOUT_S)
    try:
        async with throttle("brave"):
            resp = await http.get(
                BRAVE_API_URL,
                params={"q": cleaned, "count": limit},
                headers={"X-Subscription-Token": key},
            )
        if not resp.is_success:
            logger.warning("Brave gateway search failed (status %s) for %r", resp.status_code, cleaned)
            # Was log-only while the transport branch below recorded: a Brave
            # NETWORK blip was visible in the source health and a Brave 401/429
            # was not — the more actionable of the two being the invisible one.
            record_degradation(
                get_correlation_id(),
                source="data_gateway",
                reason=f"brave: HTTP {resp.status_code}",
                code=reason_for_status(resp.status_code),
            )
            return []
        payload = resp.json()
    except Exception as exc:  # noqa: BLE001 — a search source must never break research
        logger.warning("Brave gateway search failed for %r: %s", cleaned, exc)
        record_degradation(get_correlation_id(), source="data_gateway", reason=f"brave: {exc}")
        return []
    finally:
        if owns:
            await http.aclose()

    web = payload.get("web") if isinstance(payload, dict) else None
    results = web.get("results") if isinstance(web, dict) else None
    out: list[dict] = []
    for r in results or []:
        if not isinstance(r, dict) or not r.get("url"):
            continue
        out.append(
            {
                "title": str(r.get("title") or "").strip(),
                "url": r["url"],
                "description": str(r.get("description") or "").strip()[:500],
                "source": "brave",
                # #2616.1 — même champ, même ordre que `brave_news.py:75`
                # (« age » avant « page_age ») : deux noms pour la même donnée
                # Brave, un réglage qui vivait déjà ailleurs (GA-26).
                "date": str(r.get("age") or r.get("page_age") or "").strip(),
            }
        )
        if len(out) >= limit:
            break
    return out


class DataGateway:
    """Search + FR-signal abstraction with a keyed-provider waterfall.

    An optional shared ``httpx.AsyncClient`` is threaded through every provider so
    a caller can reuse one connection pool (and so tests can inject a mock).
    """

    def __init__(self, *, client: httpx.AsyncClient | None = None) -> None:
        self._client = client

    async def search(self, query: str, *, limit: int = 10) -> list[GatewayHit]:
        """Waterfall web search. Returns the first keyed provider's non-empty
        hits (Serper → Tavily → Brave), or ``[]`` when no provider has a key /
        every keyed provider came back empty or errored. Break-glass
        ``DATA_GATEWAY_DISABLED=true`` (kill_switch.py) short-circuits to ``[]``
        with zero network — the caller already tolerates an empty result.

        The waterfall's RESULT is cached (C6, correctif C) — ``data_gateway``
        was the last uncached provider path, unlike its jumeau
        ``brave_search.py`` (« Brave was the last uncached provider », already
        fixed there). ONE cache point for the whole waterfall, regardless of
        which keyed provider actually answered: a repeat of the exact same
        query within the window skips Serper/Tavily/Brave entirely. Empty
        results are never cached (``cached_json`` only stores truthy values),
        and a cache failure degrades to a live call — caching is an
        optimisation here, never a dependency.
        """
        cleaned = (query or "").strip()
        if not cleaned or disabled(DATA_GATEWAY_KILL_SWITCH):
            return []

        # CACHE-API (15/10) — la clé est le TEXTE de la requête, jamais ``limit`` (paramètre
        # d'affichage) : on paie une fois la page de 10 (même prix chez Serper/Brave que 3),
        # et ``limit`` se filtre à la lecture. Au-delà de 10, une seconde clé « max ».
        fetch_limit = _BASE_FETCH_LIMIT if limit <= _BASE_FETCH_LIMIT else _MAX_FETCH_LIMIT
        cache_key = cleaned.lower() if fetch_limit == _BASE_FETCH_LIMIT else f"{cleaned.lower()}:max"
        try:
            hits = await cached_json(
                _SEARCH_CACHE_NAMESPACE,
                cache_key,
                lambda: self._search_uncached(cleaned, limit=fetch_limit),
                ttl=TTL_SEARCH,
            )
            return hits[:limit]
        except Exception as exc:  # noqa: BLE001 — caching is an optimisation, never a dependency
            logger.warning("data gateway: search cache unavailable, querying live: %s", exc)
            return await self._search_uncached(cleaned, limit=limit)

    async def _search_uncached(self, cleaned: str, *, limit: int) -> list[GatewayHit]:
        """The waterfall itself, with no cache layer — ``cleaned`` is already
        stripped/non-empty (the public ``search`` did that gate)."""
        # Resolve the callables at call time so monkeypatching the module globals
        # (tests) is honoured.
        callables = {
            "serper": serper_search,
            "tavily": tavily_search,
            "brave": brave_search_single,
        }
        for name, env in _WATERFALL:
            if not _has_key(env):
                continue  # no key → skip; NO network, NO fabricated data
            try:
                hits = await callables[name](cleaned, limit=limit, client=self._client)
                # Une requête partie = une requête facturée, même si elle revient
                # vide : c'est ce que le fournisseur décompte, pas ce qu'il trouve.
                cost_ledger.record(name, "search", units=1)
            except Exception as exc:  # noqa: BLE001 — fall through to the next provider
                logger.warning("data gateway: %s search errored, falling back: %s", name, exc)
                # Name the provider that failed: the waterfall swallows the error
                # and returns [], so the caller could never tell whether Serper
                # died or simply had no hits, nor which tier answered.
                record_degradation(get_correlation_id(), source="data_gateway", reason=f"{name}: {exc}")
                continue
            if hits:
                logger.info("data gateway search: %s won with %d hits for %r", name, len(hits), cleaned)
                return list(hits)
            # Empty → fall through to the next keyed provider.
            logger.info("data gateway search: %s empty for %r, falling back", name, cleaned)
        return []

    async def collect_fr_signals(self, company: str, *, siren: str | None = None) -> dict:
        """Consolidated FR public signals for ``company`` with graceful per-source
        failure. Returns ``{registry, tenders, jobs, legalSignals}`` — each key
        degrades to its empty value (``None`` / ``[]``) if that source errors or
        no-ops (missing key)."""
        cleaned = (company or "").strip()
        out: dict = {"registry": None, "tenders": [], "jobs": [], "legalSignals": []}
        if not cleaned:
            return out

        reg, tenders, jobs, apec_jobs, wttj_jobs = await asyncio.gather(
            fetch_company(cleaned, client=self._client),
            public_tenders(cleaned, client=self._client),
            # ⚠️ #1124 — ces deux appels gardent le tri IT. Ce n'est pas un
            # oubli : `collect_fr_signals` n'a aujourd'hui AUCUN appelant, donc
            # aucun profil de vendeur à lire. Qui la branchera devra lui passer
            # le profil et threader `all_roles=recruits_for_clients(profile)`,
            # comme le fait `phase1_research` — sans quoi une ESN qui place des
            # profils verra ses offres filtrées ici et pas là.
            it_job_signals(cleaned, client=self._client),
            it_job_signals_apec(cleaned, client=self._client),
            it_job_signals_wttj(cleaned, client=self._client),
            return_exceptions=True,
        )
        for label, res in (
            ("recherche-entreprises", reg),
            ("BOAMP", tenders),
            ("France-Travail", jobs),
            ("APEC", apec_jobs),
            ("WTTJ", wttj_jobs),
        ):
            if isinstance(res, BaseException):
                logger.warning("data gateway: %s failed for %r: %s", label, cleaned, res)
                # Name the source, not just "the FR consolidation degraded" — each
                # of these is a different missing block in the dossier.
                record_degradation(get_correlation_id(), source=_FR_SIGNAL_SOURCES[label], reason=str(res))
        out["registry"] = reg if isinstance(reg, dict) else None
        out["tenders"] = tenders if isinstance(tenders, list) else []
        # Fusion ADDITIVE des sources emploi (dédup URL) — APEC (opt-in) et WTTJ
        # (no-op documenté) dégradent en [] sans toucher France Travail.
        out["jobs"] = merge_job_signals(
            jobs if isinstance(jobs, list) else [],
            apec_jobs if isinstance(apec_jobs, list) else [],
            wttj_jobs if isinstance(wttj_jobs, list) else [],
        )

        # BODACC needs a SIREN — use the arg, else the one the registry resolved.
        eff_siren = str(siren or (out["registry"] or {}).get("siren") or "").strip()
        if eff_siren:
            try:
                legal = await legal_signals(eff_siren, client=self._client)
                out["legalSignals"] = legal if isinstance(legal, list) else []
            except Exception as exc:  # noqa: BLE001 — a source must never break the rest
                logger.warning("data gateway: BODACC failed for siren %r: %s", eff_siren, exc)
                record_degradation(get_correlation_id(), source="bodacc", reason=str(exc))
        return out


def get_data_gateway(*, client: httpx.AsyncClient | None = None) -> DataGateway:
    """Convenience factory — a fresh :class:`DataGateway` (optionally sharing an
    ``httpx.AsyncClient``)."""
    return DataGateway(client=client)


__all__ = [
    "DataGateway",
    "GatewayHit",
    "brave_search_single",
    "get_data_gateway",
]
