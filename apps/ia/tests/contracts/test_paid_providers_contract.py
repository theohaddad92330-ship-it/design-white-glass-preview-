"""Paid providers — Pappers, Brave, Firecrawl, Apollo.

These calls cost money, so each provider gets exactly ONE minimal request that
still exercises the production path (see the per-test docstrings for the unit
cost). Request parameters come from the production modules — Pappers' params in
particular are built by the production ``_merge_defaults(...).to_query(...)``
rather than retyped, so a change to the production request shape is covered
automatically.

NOTE ON PAPPERS: the key is currently returning 401 (quota exhausted, being
resolved with their support). The harness reports that as CREDENTIALS_REJECTED
— "quota exhausted, contract UNVERIFIED" — and explicitly NOT as a contract
break. That distinction is the whole point: a dry key and a changed API must
never produce the same signal.
"""

from __future__ import annotations

import httpx

from app.services import brave_search, firecrawl
from app.services.pappers import detail as pappers_detail
from app.services.pappers import search as pappers_search
from app.services.pappers.models import CompanySearchHit
from tests.contracts import harness

_COMPANY = "DECATHLON"
_SIREN = "500569405"


# ── Pappers (~$0.022 / call) ──────────────────────────────────────────────────


async def test_pappers_search_contract():
    """1 search call. Params built by the production `_merge_defaults`."""
    provider = "pappers"
    endpoint = "GET /v2/recherche"
    (key,) = harness.require_env(provider, endpoint, "PAPPERS_API_KEY")

    # The production request builder — not a hand-written dict.
    params = pappers_search._merge_defaults(_COMPANY, None, per_page=1).to_query(key)
    redacted = {k: v for k, v in params.items() if k != "api_token"}

    p = await harness.probe(
        provider=provider,
        endpoint=endpoint,
        url=pappers_search.PAPPERS_SEARCH_URL,
        params=params,
        request_detail=f"{redacted} + api_token (from _merge_defaults().to_query())",
    )

    harness.expect_nonempty(p, "resultats", why="pappers/search.py reads data['resultats']")
    harness.expect_field(p, "resultats.0.siren", str, why="CompanySearchHit.siren is required")

    # Parser contract: the real pydantic model production validates against.
    hit = CompanySearchHit.model_validate(harness.dig(p.payload, "resultats.0"))
    harness.expect_parses(
        p,
        parser="pappers.models.CompanySearchHit",
        result=hit,
        predicate=bool(hit.siren),
        expected="a CompanySearchHit carrying a siren",
    )
    harness.ok(provider, endpoint, f"siren={hit.siren}")


async def test_pappers_company_detail_contract():
    """1 detail call — the expensive one that drives the whole firmographic block."""
    provider = "pappers"
    endpoint = "GET /v2/entreprise"
    (key,) = harness.require_env(provider, endpoint, "PAPPERS_API_KEY")

    # Exactly the params production sends (detail.py:163-169).
    params = {
        "siren": _SIREN,
        "api_token": key,
        "entreprise_cessee": "false",
        "extrait_rcs": "true",
        "champs_supplementaires": pappers_detail.CHAMPS_SUPPLEMENTAIRES_DEFAULT,
    }
    redacted = {k: v for k, v in params.items() if k != "api_token"}

    p = await harness.probe(
        provider=provider,
        endpoint=endpoint,
        url=pappers_detail.PAPPERS_DETAIL_URL,
        params=params,
        request_detail=f"{redacted} + api_token",
    )

    harness.expect_field(p, "siren", str, why="CompanyProfile.siren is required")
    harness.expect_field(p, "nom_entreprise", str, why="→ profile name")
    harness.expect_field(p, "siege", dict, why="CompanySiege — address, city, NAF")
    # `representants` OR `representants_legaux` — production copies one onto the
    # other (models.py:182-191), so the contract is "at least one is present".
    has_reps = any(
        harness.dig(p.payload, k) is not harness._MISSING
        for k in ("representants", "representants_legaux")
    )
    harness.expect_parses(
        p,
        parser="pappers.models.CompanyProfile representants fallback",
        result=has_reps,
        predicate=has_reps,
        expected="`representants` or `representants_legaux` present "
        "(champs_supplementaires must still deliver the legal reps)",
    )
    harness.ok(provider, endpoint, f"siren={harness.dig(p.payload, 'siren')}")


# ── Brave Search ($0.005 / call) ──────────────────────────────────────────────


async def test_brave_search_contract():
    """1 web search. Brave is the backbone of the Phase-1 web corpus."""
    provider = "brave"
    endpoint = "GET /res/v1/web/search"
    (key,) = harness.require_env(provider, endpoint, "BRAVE_API_KEY")

    params = {"q": _COMPANY, "count": 20}  # brave_search.py:151
    p = await harness.probe(
        provider=provider,
        endpoint=endpoint,
        url=brave_search.BRAVE_API_URL,
        params=params,
        headers={"X-Subscription-Token": key},
        request_detail=f"{params}, header X-Subscription-Token",
    )

    # Envelope `data["web"]["results"]` — production reads nothing else.
    harness.expect_nonempty(p, "web.results", why="brave_search.py reads data['web']['results']")
    harness.expect_field(p, "web.results.0.url", str, why="hits without a url are dropped")
    harness.expect_field(p, "web.results.0.title", str, why="→ hit title")
    harness.expect_field(p, "web.results.0.description", str, why="→ hit description")
    harness.ok(provider, endpoint, f"{len(harness.dig(p.payload, 'web.results'))} results")


# ── Firecrawl (~$0.001 / call) ────────────────────────────────────────────────


async def test_firecrawl_scrape_contract():
    """1 scrape, via the production SDK kwargs.

    Firecrawl is reached through the `firecrawl-py` SDK, so the contract that
    matters is the SDK envelope: `{"success": true, "data": {"markdown": ...}}`.
    We assert against the wire so an SDK-version bump can't hide a server change.
    """
    provider = "firecrawl"
    endpoint = "POST /v2/scrape"
    (key,) = harness.require_env(provider, endpoint, "FIRECRAWL_API_KEY")

    # The camelCase wire body the SDK builds from production's snake_case kwargs
    # (firecrawl.py:294-305).
    body: dict = {
        "url": "https://example.com",
        "formats": ["markdown"],
        "onlyMainContent": True,
        "removeBase64Images": True,
        "excludeTags": ["nav", "footer", "aside", "header", "script", "style", "noscript", "form"],
    }
    if firecrawl._SCRAPE_MAX_AGE_MS > 0:
        body["maxAge"] = firecrawl._SCRAPE_MAX_AGE_MS

    p = await harness.probe(
        provider=provider,
        endpoint=endpoint,
        method="POST",
        url="https://api.firecrawl.dev/v2/scrape",
        json=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        timeout=60.0,
        request_detail=f"formats={body['formats']} onlyMainContent={body['onlyMainContent']} "
        f"maxAge={body.get('maxAge')}",
    )

    harness.expect_field(p, "success", bool, why="SDK raises when success is falsy")
    harness.expect_field(p, "data", dict, why="SDK returns body['data'] as the Document")
    markdown = harness.expect_field(
        p, "data.markdown", str, why="firecrawl.py reads ONLY scrape_result.markdown"
    )
    harness.expect_parses(
        p,
        parser="firecrawl.scrape_hits markdown extraction",
        result=f"{len(markdown)} chars",
        predicate=len(markdown.strip()) > 0,
        expected="non-empty markdown for a trivially scrapable page",
    )
    harness.ok(provider, endpoint, f"{len(markdown)} chars of markdown")


# ── Apollo (~$0.020 / call) ───────────────────────────────────────────────────


async def test_apollo_org_enrich_contract():
    """1 org-enrich call — the cheapest Apollo endpoint that proves auth + shape.

    Deliberately NOT people/match: that burns a reveal credit per call. Org
    enrich exercises the same `x-api-key` auth and the same JSON envelope
    convention, at a known unit cost.
    """
    provider = "apollo"
    endpoint = "GET /api/v1/organizations/enrich"
    (key,) = harness.require_env(provider, endpoint, "APOLLO_API_KEY")

    params = {"domain": "decathlon.com"}  # apollo_org.py:320
    p = await harness.probe(
        provider=provider,
        endpoint=endpoint,
        url="https://api.apollo.io/api/v1/organizations/enrich",
        params=params,
        headers={"x-api-key": key, "Content-Type": "application/json"},
        request_detail=f"{params}, header x-api-key",
    )

    org = harness.expect_field(
        p, "organization", dict, why="apollo_org.py reads body['organization']"
    )
    harness.expect_field(
        p, "organization.primary_domain", str, why="_to_org_enrichment → primaryDomain"
    )
    harness.expect_parses(
        p,
        parser="apollo_org._to_org_enrichment",
        result=sorted(org)[:8],
        predicate=any(k in org for k in ("estimated_num_employees", "industry", "logo_url")),
        expected="at least one of estimated_num_employees / industry / logo_url "
        "(the fields the account panel renders)",
    )
    harness.ok(provider, endpoint, f"domain={org.get('primary_domain')}")


# ── Apollo people search — plan-gated, distinct from a contract break ─────────


async def test_apollo_people_search_contract():
    """1 people-search call. Apollo returns 403 API_INACCESSIBLE on a plan
    downgrade — production treats that as PLAN_BLOCKED, and so must we: it is a
    commercial state, not an API change."""
    provider = "apollo"
    endpoint = "POST /api/v1/mixed_people/api_search"
    (key,) = harness.require_env(provider, endpoint, "APOLLO_API_KEY")

    body = {
        "person_titles": ["CTO"],
        "q_organization_domains_list": ["decathlon.com"],
        "page": 1,
        "per_page": 1,
    }
    try:
        p = await harness.probe(
            provider=provider,
            endpoint=endpoint,
            method="POST",
            url="https://api.apollo.io/api/v1/mixed_people/api_search",
            json=body,
            headers={"x-api-key": key, "Content-Type": "application/json"},
            request_detail=f"{body}",
        )
    except httpx.HTTPError as exc:  # pragma: no cover — probe already classifies
        harness.upstream_outage(provider, endpoint, str(exc))
        return

    harness.expect_field(p, "people", list, why="apollo.py breaks pagination on data['people']")
    # Pagination is dual-shape and load-bearing (apollo.py:648-658): a None here
    # used to TypeError and 500 the pipeline.
    total = harness.dig(p.payload, "total_entries")
    if total is harness._MISSING:
        total = harness.dig(p.payload, "pagination.total_entries")
    harness.expect_parses(
        p,
        parser="apollo.py total_entries pagination guard",
        result=total,
        predicate=isinstance(total, int),
        expected="`total_entries` or `pagination.total_entries` as an int "
        "(drives the search pagination loop)",
    )
    harness.ok(provider, endpoint, f"total_entries={total}")
