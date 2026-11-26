"""Open-data sources — France Travail, BODACC, BOAMP, DECP, GitHub.

These feed the signals block of every dossier. All of them degrade to ``[]`` in
production, so a schema change here silently thins the dossier rather than
failing anything — the slowest possible way to find out.

The ODSQL query dialects (BOAMP / DECP) get particular attention: the DECP
client carries a hard-won comment that ``codecpv like '72%'`` returns **0 rows
without erroring** while ``startswith(codecpv,'72')`` returns 13653. A filter
that silently stops matching is invisible to a status-code check, so those
tests assert on row counts, not just on HTTP 200.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.services.data_sources import bodacc, decp, france_travail, github_org
from app.services.data_sources import public_tenders as boamp
from tests.contracts import harness

_SIREN = "500569405"  # Decathlon SE


# ── France Travail (OAuth client-credentials + offers search) ─────────────────


async def test_france_travail_token_and_search_contract():
    """Two calls: mint a token, then run the production IT-offers query.

    The token endpoint takes ``realm`` as a QUERY param while the grant lives in
    the FORM body — an easy thing for a provider to tighten, and it would take
    the whole hiring-signal block down silently.
    """
    provider = "france-travail"
    token_endpoint = "POST /connexion/oauth2/access_token"
    client_id, client_secret = harness.require_env(
        provider,
        token_endpoint,
        "FRANCE_TRAVAIL_CLIENT_ID",
        "FRANCE_TRAVAIL_CLIENT_SECRET",
    )

    tok = await harness.probe(
        provider=provider,
        endpoint=token_endpoint,
        method="POST",
        url=france_travail._TOKEN_URL,
        params={"realm": "/partenaire"},
        data={
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": france_travail._SCOPE,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=france_travail._TIMEOUT_S,
        request_detail=f"realm=/partenaire (query), grant_type=client_credentials, "
        f"scope={france_travail._SCOPE!r} (form)",
    )
    access_token = harness.expect_nonempty(
        tok, "access_token", why="_token() reads ONLY payload['access_token']"
    )
    harness.ok(provider, token_endpoint, "token minted")

    # Now the search production actually runs (france_travail.py:329).
    search_endpoint = "GET /partenaire/offresdemploi/v2/offres/search"
    params = {"motsCles": "Decathlon", "domaine": "M18", "range": "0-23"}
    p = await harness.probe(
        provider=provider,
        endpoint=search_endpoint,
        url=france_travail._SEARCH_URL,
        params=params,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=france_travail._TIMEOUT_S,
        request_detail=f"{params} (domaine M18 = informatique; range caps at 0-149)",
    )

    # 204/206 are legitimate successes here (206 = partial content paging).
    if p.status in (204, 206) and not p.payload:
        harness.ok(provider, search_endpoint, f"HTTP {p.status}, no offers today")
        return

    offers = harness.expect_field(
        p, "resultats", list, why="_search reads payload['resultats']"
    )
    if not offers:
        harness.ok(provider, search_endpoint, "0 offers today (a finding, not a break)")
        return

    harness.expect_field(p, "resultats.0.intitule", str, why="→ offer title")
    harness.expect_field(p, "resultats.0.dateCreation", str, why="→ date, ISO with Z")
    harness.expect_field(
        p, "resultats.0.lieuTravail", dict, why="_parse reads lieuTravail.libelle '75 - PARIS 01'"
    )
    harness.ok(provider, search_endpoint, f"{len(offers)} offers")


# ── BODACC (Opendatasoft Search v1 — the LEGACY dialect) ──────────────────────


async def test_bodacc_contract():
    """BODACC still uses the v1 `/api/records/1.0/search/` API, unlike the v2.1
    used by BOAMP and DECP. Its `records[].fields` nesting has no flat fallback
    in our client, so the envelope shape is load-bearing."""
    provider = "bodacc"
    endpoint = "GET /api/records/1.0/search/"

    params = {
        "dataset": "annonces-commerciales",
        "q": _SIREN,
        "rows": "8",
        "sort": "dateparution",
    }
    p = await harness.probe(
        provider=provider,
        endpoint=endpoint,
        url=bodacc._BASE,
        params=params,
        timeout=bodacc._TIMEOUT_S,
        request_detail=f"{params} (v1 Search API)",
    )

    records = harness.expect_field(p, "records", list, why="bodacc.py reads payload['records']")
    if not records:
        harness.ok(provider, endpoint, "0 annonces for this SIREN (a finding, not a break)")
        return
    harness.expect_field(
        p, "records.0.fields", dict, why="v1 nesting — records without a dict `fields` are skipped"
    )
    harness.expect_field(
        p, "records.0.fields.dateparution", str, why="→ signal date"
    )
    harness.ok(provider, endpoint, f"{len(records)} annonces")


# ── BOAMP (Opendatasoft Explore v2.1 + ODSQL) ────────────────────────────────


async def test_boamp_contract():
    """`order_by: "dateparution desc"` is a hard field-name dependency: an
    unknown sort field 400s the whole query."""
    provider = "boamp"
    endpoint = "GET /explore/v2.1/.../boamp/records"

    # Production's own ODSQL builder (public_tenders.build_tender_where).
    where = boamp.build_tender_where("59", 180)
    params = {"where": where, "order_by": "dateparution desc", "limit": "5"}
    p = await harness.probe(
        provider=provider,
        endpoint=endpoint,
        url=boamp._BASE,
        params=params,
        timeout=boamp._TIMEOUT_S,
        request_detail=f"where={where!r} order_by='dateparution desc' (build_tender_where)",
    )

    # `_fields()` accepts either the v2.1 `results` key or the legacy `records`.
    envelope = "results" if harness.dig(p.payload, "results") is not harness._MISSING else "records"
    rows = harness.dig(p.payload, envelope)
    harness.expect_parses(
        p,
        parser="public_tenders results/records envelope",
        result=type(rows).__name__,
        predicate=isinstance(rows, list),
        expected="`results` (v2.1) or `records` (legacy) as a list",
    )
    harness.expect_parses(
        p,
        parser="build_tender_where ODSQL filter",
        result=f"{len(rows)} rows",
        predicate=len(rows) > 0,
        expected="the dateparution+departement ODSQL filter still matches rows "
        "(a silently non-matching filter empties the tenders block without erroring)",
    )
    harness.expect_field(p, f"{envelope}.0", dict, why="each record is parsed as a dict")
    harness.ok(provider, endpoint, f"{len(rows)} tenders via `{envelope}` (dept 59, 180d)")


# ── DECP (awarded public contracts) ──────────────────────────────────────────


async def test_decp_awarded_contracts_contract():
    """The all-lowercase schema and `startswith(...)` are both pinned in code.

    `dateNotification` (camelCase) is a documented HTTP 400 on this dataset, and
    `like 'x%'` silently returns zero rows. Both are asserted here because both
    have already bitten us.
    """
    provider = "decp"
    endpoint = "GET /explore/v2.1/.../decp-2022-marches-valides/records"

    since = (datetime.now(UTC) - timedelta(days=365)).strftime("%Y-%m-%d")
    where = (
        f"{decp._LIST_DATE_FIELD} >= date'{since}' and "
        f"(startswith({decp._LIST_CPV_FIELD},'48') or startswith({decp._LIST_CPV_FIELD},'72'))"
    )
    params = {"where": where, "order_by": f"{decp._LIST_DATE_FIELD} desc", "limit": "5"}
    p = await harness.probe(
        provider=provider,
        endpoint=endpoint,
        url=decp._LIST_BASE,
        params=params,
        timeout=decp._TIMEOUT_S,
        request_detail=f"where={where!r} (lowercase fields + startswith, both load-bearing)",
    )

    rows = harness.dig(p.payload, "results")
    if rows is harness._MISSING:
        rows = harness.dig(p.payload, "records")
    harness.expect_parses(
        p,
        parser="decp.list_award_buyers ODSQL",
        result=f"{len(rows) if isinstance(rows, list) else rows!r}",
        predicate=isinstance(rows, list) and len(rows) > 0,
        expected="the lowercase-field + startswith CPV filter still matches IT "
        "contracts (camelCase 400s; `like` returns 0 rows silently)",
    )
    harness.ok(provider, endpoint, f"{len(rows)} awarded IT contracts")


# ── GitHub (anonymous — token optional) ──────────────────────────────────────


async def test_github_org_contract():
    """Anonymous org lookup: 60 req/h without a token, which is plenty for a
    daily contract check. Production reads only login / html_url / public_repos
    and, on repos, language + pushed_at."""
    provider = "github"
    endpoint = "GET /orgs/{org}"

    p = await harness.probe(
        provider=provider,
        endpoint=endpoint,
        url=f"{github_org._API}/orgs/decathlon",
        headers=github_org._headers(),
        timeout=github_org._TIMEOUT_S,
        request_detail="org=decathlon, headers from github_org._headers()",
    )
    harness.expect_field(p, "login", str, why="_matches() resolves the org by login")
    harness.expect_field(p, "html_url", str, why="→ org url")
    harness.expect_field(p, "public_repos", int, why="→ publicRepos (passed through untyped)")

    repos_endpoint = "GET /orgs/{org}/repos"
    r = await harness.probe(
        provider=provider,
        endpoint=repos_endpoint,
        url=f"{github_org._API}/orgs/decathlon/repos",
        params={"sort": "pushed", "per_page": "10"},
        headers=github_org._headers(),
        timeout=github_org._TIMEOUT_S,
        request_detail="sort=pushed per_page=10",
    )
    harness.expect_parses(
        r,
        parser="github_org.org_tech_signals repos envelope",
        result=type(r.payload).__name__,
        predicate=isinstance(r.payload, list) and bool(r.payload),
        expected="a BARE top-level list (asserted via isinstance(repos, list))",
    )
    # `pushed_at` has no [:10] fallback in _parse_dt — a format change silently
    # zeroes activeRecentRepos, so pin the exact ISO-Z shape.
    pushed = harness.expect_field(r, "0.pushed_at", str, why="_parse_dt has NO fallback parser")
    harness.expect_parses(
        r,
        parser="github_org._parse_dt",
        result=pushed,
        predicate=github_org._parse_dt(pushed) is not None,
        expected="an ISO-8601 timestamp _parse_dt can read (else lastActivity "
        "silently becomes None and activeRecentRepos drops to 0)",
    )
    harness.ok(provider, repos_endpoint, f"{len(r.payload)} repos, latest push {pushed}")
