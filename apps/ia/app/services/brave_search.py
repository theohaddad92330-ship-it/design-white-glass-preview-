from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, TypedDict

import httpx

from app.middleware.correlation_id import get_correlation_id
from app.services.backoffice_alerts import report_provider_credits_exhausted
from app.services.company_filters import DegradeReason
from app.services import cost_ledger
from app.services.brave_snippets import extra_snippets_params, merge_description
from app.services.provider_cache import TTL_SEARCH, cached_json
from app.services.rate_limiter import back_off_provider, retry_after_header, throttle
from app.services.offer_domains.base import DEFAULT_OFFER_DOMAIN, normalize_offer_domain
from app.services.research.sources import (
    CATEGORY_RULES,
    SourceCategory,
    classify,
    infer_official_hosts,
)
from app.services.retry import retry_with_backoff
from app.services.source_health import record_degradation

logger = logging.getLogger(__name__)

BRAVE_API_URL = "https://api.search.brave.com/res/v1/web/search"
GLOBAL_TIMEOUT_S = 45.0

# Per-category caps used during selection so PRESS — which lights up the most
# Brave queries — doesn't monopolise the slot budget and starve JOBS /
# INTERVIEW. We classify each deduped hit in order and drop it once its lane
# is full. Total budget = sum(PER_CATEGORY_CAP.values()) → slight overshoot
# of the previous flat ``MAX_RESULTS = 30`` so we always have room left for
# slower-to-surface lanes (jobs, interviews).
PER_CATEGORY_CAP: dict[SourceCategory, int] = {
    SourceCategory.PRESS: 8,
    SourceCategory.INTERVIEW: 4,
    SourceCategory.OFFICIAL: 6,
    SourceCategory.PROJECT: 8,
    SourceCategory.JOBS: 4,
    SourceCategory.OTHER: 4,
}
MAX_RESULTS = sum(PER_CATEGORY_CAP.values())  # 34


class BraveHit(TypedDict):
    """Single typed Brave search result.

    The ``category`` field is filled by ``classify`` after the network call —
    the Brave API itself doesn't return a category, we tag it ourselves so
    downstream consumers (Firecrawl, prompts) can route by intent.
    """

    title: str
    description: str
    url: str
    query: str
    category: SourceCategory


def _build_queries(
    company_name: str,
    profile_data: dict[str, Any],
) -> dict[SourceCategory, list[str]]:
    """Build targeted queries grouped by source category.

    Each category has its own lane so we can:
    - reason about coverage in ``_api_metrics.brave_per_category``,
    - decide later (post-MVP) to skip a category by config,
    - feed Claude a sectioned prompt where every line of evidence is
      pre-tagged with its provenance.

    The OTHER lane carries the LinkedIn people-discovery + profile-driven
    queries — they don't fit one of the typology slots but are still useful
    for ``peopleMentioned`` on the Claude side.
    """
    c = company_name
    # #2289.7 — "transformation digitale" n'est un DÉFAUT pertinent que pour un
    # vendeur IT (``DEFAULT_OFFER_DOMAIN``) : un vendeur qui vend du bureau
    # d'études, de la finance ou de la supply chain ne cherche pas ce mot-clé
    # chez SES comptes. Seul un domaine d'offre CONNU et NON-IT retire la
    # requête (même prudence que ``collection_focus.plan_collection`` :
    # domaine absent/inconnu ⇒ comportement historique inchangé).
    domain = normalize_offer_domain(profile_data.get("offerDomain"))
    it_seller = domain == DEFAULT_OFFER_DOMAIN
    queries: dict[SourceCategory, list[str]] = {
        SourceCategory.PRESS: [
            f"{c} communiqué presse innovation technologie",
            *([f"{c} actualité transformation digitale"] if it_seller else [f"{c} actualité"]),
            f"{c} news IT digital",
            f"{c} incident panne informatique cybersécurité",
        ],
        SourceCategory.INTERVIEW: [
            f"{c} DSI CTO interview nomination",
            f"{c} CIO podcast directeur numérique",
        ],
        SourceCategory.OFFICIAL: [
            # We don't need many "official" queries — once `infer_official_hosts`
            # has spotted the corporate domain from the other lanes, the hits
            # land in OFFICIAL automatically. One generic anchor query is
            # enough to surface the home page if Brave hasn't already.
            f"{c} site officiel direction stratégie",
        ],
        SourceCategory.PROJECT: [
            f"{c} rapport annuel document référence",
            f"{c} plan stratégique",
            *([f"{c} programme transformation digitale"] if it_seller else []),
            f"{c} budget IT numérique investissement",
            f"{c} appels d'offres marché informatique",
            f"{c} organigramme direction filiales entités",
        ],
        SourceCategory.JOBS: [
            f"site:welcometothejungle.com {c}",
            f"{c} carrières IT recrutement DSI",
            f"{c} offres emploi data engineer",
        ],
        SourceCategory.OTHER: [
            f"site:linkedin.com/in {c} directeur systèmes information",
            f"site:linkedin.com/in {c} chief technology officer CTO",
            f"site:linkedin.com/in {c} directeur data CDO",
            f"{c} prestataires ESN SSII conseil informatique contrat",
            f"{c} partenaire technologique intégrateur",
            f"{c} dette technique legacy modernisation migration cloud",
        ],
    }

    # Dynamic queries from the ESN profile — these are intent-shaped (offers /
    # personas / sectors) so they go into OTHER and rely on classification
    # to land in the right lane once the URL is known.
    personas: list[str] = profile_data.get("personas") or []
    for persona in personas[:3]:
        queries[SourceCategory.OTHER].append(f"site:linkedin.com/in {c} {persona}")

    sectors: list[str] = profile_data.get("sectors") or []
    for sector in sectors[:2]:
        queries[SourceCategory.PROJECT].append(f"{c} {sector} digital transformation projet")

    offers: list[str] = profile_data.get("offers") or []
    for offer in offers[:3]:
        queries[SourceCategory.PROJECT].append(f"{c} {offer} projet déploiement migration")

    return queries


# LOT (15/10) DATA-A point 7 — la FRAÎCHEUR se demande à Brave (`freshness=py` : 12 derniers mois)
# au lieu d'années écrites en dur dans le texte de la requête, qui périmaient chaque 1er janvier.
_FRESH_LANES = (SourceCategory.PRESS, SourceCategory.INTERVIEW)
_FRESH_QUERY_MARKERS = ("plan stratégique", "appels d'offres")


def _freshness_for(category: SourceCategory, query: str) -> str | None:
    if category in _FRESH_LANES or any(marker in query for marker in _FRESH_QUERY_MARKERS):
        return "py"
    return None


async def _execute_query_uncached(
    query: str,
    api_key: str,
    http_client: httpx.AsyncClient,
    freshness: str | None = None,
) -> list[dict[str, str]]:
    """Execute a single Brave Search query and return parsed results.

    402 Payment Required short-circuits to ``[]`` without retries — the quota
    is exhausted for the whole session so retrying just burns ~6 s per query
    × N queries × 3 retries = wasted minutes.
    """

    async def _call() -> list[dict[str, str]]:
        async with throttle("brave"):
            res = await http_client.get(
                BRAVE_API_URL,
                params={
                    "q": query,
                    "count": 20,
                    # LOT (15/10) DATA-A point 7 — marché français, extraits en plus (même texte analysé).
                    "country": "FR",
                    "search_lang": "fr",
                    **extra_snippets_params(),
                    **({"freshness": freshness} if freshness else {}),
                },
                headers={"X-Subscription-Token": api_key},
            )
        if res.status_code == 402:
            logger.warning("Brave quota exhausted (402) — skipping query: %s", query)
            # #2528/#2529 — a quota exhaustion is NOT "cette entreprise n'a
            # rien" : it must be classed apart (DegradeReason.QUOTA_EXCEEDED,
            # same vocabulary Pappers already uses for its own 402) so the
            # dossier can say why, instead of reading as "0 résultat" like a
            # company nobody writes about. The constant reason string collapses
            # every query's 402 into ONE entry per run (record_degradation
            # dedupes on (source, reason, code)) — not one line per query.
            record_degradation(
                get_correlation_id(),
                source="brave",
                reason="Quota de recherche web épuisé (402)",
                code=DegradeReason.QUOTA_EXCEEDED,
            )
            # #2528.3 — côté opérateur, un quota épuisé doit se VOIR : un
            # e-mail URGENT aux owners (une fois par fenêtre, jamais à chaque
            # requête — voir backoffice_alerts.py). Best-effort : ne peut
            # jamais faire échouer cette recherche.
            await report_provider_credits_exhausted(
                "BRAVE_API_KEY",
                "La recherche web est dégradée pour tous les espaces tant que le quota n'est pas rechargé.",
            )
            return []
        if res.status_code == 429:
            # Le jeton acquis ne dit rien du débit RÉEL que Brave accepte. Sans
            # ça, phase 1 tire jusqu'à 29 requêtes qui retentent toutes au même
            # instant (recul déterministe, voir retry.py) — un pic qui retombe
            # exactement quand le fournisseur demande de respirer.
            back_off_provider("brave", retry_after_header(res))
        if not res.is_success:
            raise ValueError(f"Brave Search query failed (status {res.status_code}): {query}")

        # LOT (15/10) DATA-A point 7 — l'appel payant a répondu : une ligne au registre de coûts
        # (comptée même si la réponse est vide, c'est ce que le fournisseur décompte).
        cost_ledger.record("brave_search", "search", units=1)
        data = res.json()
        web_results: list[dict[str, Any]] = data.get("web", {}).get("results") or []

        return [
            {
                "title": r.get("title", ""),
                "description": merge_description(r.get("description", ""), r.get("extra_snippets")),
                "url": r.get("url", ""),
                "query": query,
            }
            for r in web_results
            if r.get("url")
        ]

    try:
        return await retry_with_backoff(
            _call,
            max_retries=3,
            base_delay=1.0,
            exceptions=(ValueError, httpx.HTTPError),
        )
    except Exception as exc:
        logger.exception("Error executing Brave Search query: %s", query)
        # Partial loss: this query's lane silently loses its hits while the
        # others survive, so brave_results_count stays > 0 and the count-based
        # health check still reports "ok". Record it or the corpus shrinks with
        # nothing anywhere saying why.
        record_degradation(get_correlation_id(), source="brave", reason=f"requête « {query} »: {exc}")
        return []


async def _execute_query(
    query: str,
    api_key: str,
    http_client: httpx.AsyncClient,
    freshness: str | None = None,
) -> list[dict[str, str]]:
    """Cached wrapper around one Brave query.

    Brave was the last uncached provider: every other source goes through
    ``provider_cache`` (see that module for the per-tier durations — never
    restated here, a copied number drifts) and ``TTL_SEARCH`` was declared for
    exactly this and never wired. Phase 1 fires 21 static queries
    plus up to 8 profile-driven ones — each a billed call ($5/1000) queued
    behind a 60 rpm limiter and a semaphore of 5, sitting on the critical path
    in front of Firecrawl, which cannot start until the URLs land.

    Keyed on the query text alone: the API key is a credential, not part of the
    identity of a result, so rotating it must not throw the window away. Empty
    results are not cached (``cached_json`` only stores truthy values) so a
    rate-limited miss cannot poison the window with "this company has nothing".

    Cache failures degrade to a live call — a cold Redis must never break
    research.
    """
    try:
        # La fraîcheur change le corpus rendu : elle entre dans la clé (jamais l'espace ni la clé API).
        cache_key = query.strip().lower() + (f"|{freshness}" if freshness else "")
        return await cached_json(
            "search:brave",
            cache_key,
            lambda: _execute_query_uncached(query, api_key, http_client, freshness)
            if freshness
            else _execute_query_uncached(query, api_key, http_client),
            ttl=TTL_SEARCH,
        )
    except Exception as exc:  # noqa: BLE001 — caching is an optimisation, never a dependency
        logger.warning("Brave cache unavailable, querying live: %s", exc)
        if freshness:
            return await _execute_query_uncached(query, api_key, http_client, freshness)
        return await _execute_query_uncached(query, api_key, http_client)


async def search(
    company_name: str,
    profile_data: dict[str, Any],
    http_client: httpx.AsyncClient | None = None,
) -> list[BraveHit]:
    """Run targeted Brave searches in parallel and return deduplicated, typed hits.

    Each hit carries a ``category`` tag computed by ``sources.classify``
    against the URL + title (with the corporate domain inferred from the
    full hit list before classification, so the OFFICIAL lane is populated
    even when no query explicitly mentioned the corporate domain).

    Wraps the parallel gather in ``asyncio.timeout`` so a Brave outage
    doesn't park the whole pipeline — we surface whatever hits did come
    back, or an empty list if nothing did.
    """
    api_key = os.environ.get("BRAVE_API_KEY", "")
    if not api_key:
        raise ValueError(
            "BRAVE_API_KEY environment variable is not set. "
            "Cannot execute Brave Search queries."
        )

    queries_by_category = _build_queries(company_name, profile_data)

    owns_client = http_client is None
    client = http_client or httpx.AsyncClient(timeout=60.0)
    sem = asyncio.Semaphore(5)

    async def _throttled(q: str, freshness: str | None) -> list[dict[str, str]]:
        async with sem:
            if freshness:
                return await _execute_query(q, api_key, client, freshness)
            return await _execute_query(q, api_key, client)

    # Flat list of (query, category) so we can fan out via gather and still
    # know each query's intent for the OTHER → category-by-host reclassification.
    flat: list[tuple[SourceCategory, str]] = [
        (cat, q) for cat, qs in queries_by_category.items() for q in qs
    ]

    try:
        try:
            async with asyncio.timeout(GLOBAL_TIMEOUT_S):
                all_results = await asyncio.gather(*[_throttled(q, _freshness_for(cat, q)) for cat, q in flat])
        except TimeoutError:
            logger.warning(
                "Brave global timeout (%.0fs) hit — returning whatever finished",
                GLOBAL_TIMEOUT_S,
            )
            all_results = []
    finally:
        if owns_client:
            await client.aclose()

    # First pass: flatten + dedup by URL (first occurrence wins), preserving
    # the *query-intent category* as the initial guess. This pass needs to
    # happen before classify() so we can infer official_hosts from the
    # complete hit list.
    seen_urls: set[str] = set()
    flat_hits: list[dict[str, Any]] = []
    for (cat, query), results in zip(flat, all_results, strict=False):
        for item in results:
            url = item["url"]
            if url in seen_urls:
                continue
            seen_urls.add(url)
            flat_hits.append(
                {
                    "title": item["title"],
                    "description": item["description"],
                    "url": url,
                    "query": query,
                    "intent_category": cat,
                }
            )

    official_hosts = infer_official_hosts(flat_hits, company_name)

    # Second pass: classify each hit and enforce per-category caps so PRESS
    # doesn't burn the whole slot budget. The query intent is a hint, but
    # the URL + title pattern wins — a press release surfaced by a "rapport
    # annuel" query should still land in PRESS.
    counter: dict[SourceCategory, int] = {c: 0 for c in SourceCategory}
    typed: list[BraveHit] = []
    for hit in flat_hits:
        if all(counter[c] >= PER_CATEGORY_CAP[c] for c in SourceCategory):
            break  # all lanes full
        url_category = classify(hit["url"], hit["title"], official_hosts=official_hosts)
        # If URL classification fell to OTHER but the originating query was
        # in a specific lane (e.g. the PRESS query returned a corporate-blog
        # post with no /press/ slug), respect the query intent.
        category: SourceCategory = (
            url_category
            if url_category is not SourceCategory.OTHER
            else hit["intent_category"]
        )
        if counter[category] >= PER_CATEGORY_CAP[category]:
            continue  # lane full — drop this hit, keep scanning for under-served lanes
        counter[category] += 1
        typed.append(
            BraveHit(
                title=hit["title"],
                description=hit["description"],
                url=hit["url"],
                query=hit["query"],
                category=category,
            )
        )

    logger.info(
        "Brave search for '%s': %d hits, per_category=%s",
        company_name,
        len(typed),
        {c.value: sum(1 for h in typed if h["category"] is c) for c in SourceCategory},
    )
    return typed


async def search_web(
    query: str,
    count: int = 10,
    http_client: httpx.AsyncClient | None = None,
) -> list[dict[str, str]]:
    """#2721 — ONE free-text Brave query, verbatim, no company-research templating.

    ``search()`` above fans a company name out into ~21 targeted queries
    (press/interview/official/project/jobs); that shape only fits Phase 1's
    "research this company" job. The chat's `web_search` tool (Laura's copilot
    grief, #2721 — « elle explique au lieu d'exécuter ») needs the primitive
    underneath: exactly the query the model wrote, exactly once. Reuses
    ``_execute_query`` (cache + retry + 402/429 handling already correct) so
    this isn't a second implementation of any of that.

    Raises ``ValueError`` when ``BRAVE_API_KEY`` is unset — same contract as
    ``search()``, checked BEFORE any network attempt (sans clé = no-op
    STRICT, `agent_docs/env-reference.md`).
    """
    api_key = os.environ.get("BRAVE_API_KEY", "")
    if not api_key:
        raise ValueError(
            "BRAVE_API_KEY environment variable is not set. "
            "Cannot execute Brave Search queries."
        )

    owns_client = http_client is None
    client = http_client or httpx.AsyncClient(timeout=60.0)
    try:
        results = await _execute_query(query, api_key, client)
    finally:
        if owns_client:
            await client.aclose()
    return results[:count]


__all__ = ["BraveHit", "search", "search_web", "SourceCategory", "CATEGORY_RULES"]
