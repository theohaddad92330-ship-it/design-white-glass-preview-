from __future__ import annotations

import asyncio
import os
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from firecrawl.v2.utils.error_handler import (
    InternalServerError,
    PaymentRequiredError,
    RateLimitError,
    UnauthorizedError,
    WebsiteNotSupportedError,
)

from app.services.firecrawl import (
    ERROR_CODE_AUTH_FAILED,
    ERROR_CODE_FIRECRAWL_INTERNAL,
    ERROR_CODE_INSUFFICIENT_CREDITS,
    ERROR_CODE_RATE_LIMITED,
    FirecrawlScrapeError,
    _hit_content_score,
    _url_priority,
    scrape_hits,
)
from app.services.research.firecrawl import (
    ResearchBundle,
    ResearchSource,
)
from app.services.research.sources import SourceCategory


def _make_scrape_result(markdown: str = "# Hello") -> SimpleNamespace:
    return SimpleNamespace(markdown=markdown)


def _make_client(side_effect=None, return_value=None):
    """Mock that quacks like AsyncFirecrawl — only `.scrape` is used."""
    client = AsyncMock()
    if side_effect is not None:
        client.scrape.side_effect = side_effect
    else:
        client.scrape.return_value = return_value if return_value is not None else _make_scrape_result()
    return client


def _hit(url: str, *, title: str = "Title", category: SourceCategory = SourceCategory.OTHER,
         description: str | None = "desc") -> dict:
    return {"url": url, "title": title, "category": category, "description": description}


# ── Filtering / ordering / parallelism ───────────────────────────────────────


async def test_filters_excluded_domains():
    hits = [
        _hit("https://example.com/page", category=SourceCategory.OFFICIAL),
        _hit("https://www.linkedin.com/company/acme"),
        _hit("https://facebook.com/acme"),
        _hit("https://youtube.com/watch?v=abc"),
        _hit("https://other-site.com/info", category=SourceCategory.OFFICIAL),
    ]

    client = _make_client()

    with patch.dict(os.environ, {"FIRECRAWL_API_KEY": "test-key"}):
        results = await scrape_hits(hits, http_client=client)

    scraped_urls = [call.kwargs["url"] for call in client.scrape.call_args_list]
    assert "https://example.com/page" in scraped_urls
    assert "https://other-site.com/info" in scraped_urls
    assert all("linkedin" not in u and "facebook" not in u for u in scraped_urls)
    # Filtered hits are dropped, not surfaced as "skipped"
    assert all("linkedin" not in r["url"] for r in results)


async def test_respects_max_pages():
    hits = [_hit(f"https://example.com/page{i}") for i in range(20)]
    client = _make_client()

    with patch.dict(os.environ, {"FIRECRAWL_API_KEY": "test-key"}):
        results = await scrape_hits(hits, max_pages=5, http_client=client)

    assert client.scrape.call_count == 5
    # Pages beyond max_pages are still reported with scrape_status="skipped"
    skipped = [r for r in results if r["scrape_status"] == "skipped"]
    assert len(skipped) == 15


async def test_scrapes_in_parallel():
    import time

    call_times: list[float] = []

    async def mock_scrape(*args, **kwargs):
        call_times.append(time.monotonic())
        await asyncio.sleep(0.05)
        return _make_scrape_result()

    client = _make_client(side_effect=mock_scrape)
    hits = [_hit(f"https://example.com/page{i}") for i in range(5)]

    with patch.dict(os.environ, {"FIRECRAWL_API_KEY": "test-key"}):
        results = await scrape_hits(hits, http_client=client)

    assert sum(1 for r in results if r["scrape_status"] == "ok") == 5
    # Concurrency ≥ 5 — the first several calls fire near-simultaneously.
    if len(call_times) >= 3:
        assert call_times[2] - call_times[0] < 0.1


# ── Firecrawl server-side speedups (max_age cache + concurrency) ──────────────


async def test_scrape_passes_max_age_for_server_cache(monkeypatch):
    """``max_age`` lets Firecrawl serve a recently-scraped page from ITS OWN
    cache (server-side, near-instant) — the #1 Firecrawl latency lever."""
    monkeypatch.setattr("app.services.firecrawl._SCRAPE_MAX_AGE_MS", 172_800_000)
    client = _make_client()
    with patch.dict(os.environ, {"FIRECRAWL_API_KEY": "test-key"}):
        await scrape_hits([_hit("https://example.com/p")], http_client=client)
    assert client.scrape.call_args.kwargs.get("max_age") == 172_800_000


async def test_scrape_max_age_zero_omits_param(monkeypatch):
    """``max_age=0`` disables the server cache (always fresh) — param NOT sent."""
    monkeypatch.setattr("app.services.firecrawl._SCRAPE_MAX_AGE_MS", 0)
    client = _make_client()
    with patch.dict(os.environ, {"FIRECRAWL_API_KEY": "test-key"}):
        await scrape_hits([_hit("https://example.com/p")], http_client=client)
    assert "max_age" not in client.scrape.call_args.kwargs


# ── Per-URL outcomes ────────────────────────────────────────────────────────


async def test_continues_on_per_url_failure():
    """WebsiteNotSupportedError is per-URL; the rest of the batch keeps going."""

    async def mock_scrape(*args, **kwargs):
        url = kwargs.get("url", "")
        if "blocked" in url:
            raise WebsiteNotSupportedError("Site blocks scraping")
        return _make_scrape_result(f"# Content for {url}")

    client = _make_client(side_effect=mock_scrape)

    hits = [
        _hit("https://example.com/good1"),
        _hit("https://example.com/blocked"),
        _hit("https://example.com/good2"),
    ]

    with patch.dict(os.environ, {"FIRECRAWL_API_KEY": "test-key"}):
        results = await scrape_hits(hits, http_client=client)

    by_url = {r["url"]: r for r in results}
    assert by_url["https://example.com/good1"]["scrape_status"] == "ok"
    assert by_url["https://example.com/good2"]["scrape_status"] == "ok"
    assert by_url["https://example.com/blocked"]["scrape_status"] == "error"


async def test_scrape_timeout_falls_back_to_timeout_status(monkeypatch):
    """A page that hangs longer than ``PER_URL_TIMEOUT_S`` returns a
    ``scrape_status="timeout"`` row instead of parking the whole batch.
    """
    # Shrink the per-URL timeout so the test runs fast.
    monkeypatch.setattr("app.services.firecrawl.PER_URL_TIMEOUT_S", 0.05)

    async def slow_scrape(*args, **kwargs):
        await asyncio.sleep(1.0)
        return _make_scrape_result()

    client = _make_client(side_effect=slow_scrape)

    with patch.dict(os.environ, {"FIRECRAWL_API_KEY": "test-key"}):
        results = await scrape_hits([_hit("https://example.com/slow")], http_client=client)

    assert len(results) == 1
    assert results[0]["scrape_status"] == "timeout"
    assert results[0]["error_code"] == "TIMEOUT"


async def test_scrape_preserves_category_on_result():
    hits = [
        _hit("https://example.com/press", category=SourceCategory.PRESS),
        _hit("https://example.com/jobs", category=SourceCategory.JOBS),
    ]
    client = _make_client()

    with patch.dict(os.environ, {"FIRECRAWL_API_KEY": "test-key"}):
        results = await scrape_hits(hits, http_client=client)

    by_url = {r["url"]: r for r in results}
    assert by_url["https://example.com/press"]["category"] is SourceCategory.PRESS
    assert by_url["https://example.com/jobs"]["category"] is SourceCategory.JOBS


async def test_empty_markdown_is_reported_as_empty():
    """A successful scrape with no markdown content gets ``scrape_status="empty"``."""

    async def mock_scrape(*args, **kwargs):
        return SimpleNamespace(markdown="")

    client = _make_client(side_effect=mock_scrape)

    with patch.dict(os.environ, {"FIRECRAWL_API_KEY": "test-key"}):
        results = await scrape_hits([_hit("https://example.com/empty")], http_client=client)

    assert results[0]["scrape_status"] == "empty"


async def test_truncates_at_max_chars():
    async def mock_scrape(*args, **kwargs):
        return _make_scrape_result("x" * 600)

    client = _make_client(side_effect=mock_scrape)
    hits = [_hit(f"https://example.com/page{i}") for i in range(10)]

    with patch.dict(os.environ, {"FIRECRAWL_API_KEY": "test-key"}):
        results = await scrape_hits(hits, max_chars=1500, http_client=client)

    ok = [r for r in results if r["scrape_status"] == "ok"]
    # 1500 / 600 = 2 full pages, then the 3rd is over budget → skipped.
    assert sum(r["char_count"] for r in ok) <= 1800
    over_budget = [r for r in results if r["scrape_status"] == "skipped"]
    assert over_budget  # the rest are reported as skipped


async def test_raises_without_api_key():
    with patch.dict(os.environ, {}, clear=True):
        with pytest.raises(ValueError, match="FIRECRAWL_API_KEY"):
            await scrape_hits([_hit("https://example.com")])


# ── Terminal Firecrawl errors (credits / rate limit / auth) ──────────────────


async def test_raises_on_payment_required():
    client = _make_client(side_effect=PaymentRequiredError("Insufficient credits"))

    with patch.dict(os.environ, {"FIRECRAWL_API_KEY": "test-key"}):
        with pytest.raises(FirecrawlScrapeError) as excinfo:
            await scrape_hits([_hit("https://example.com/page")], http_client=client)

    assert excinfo.value.code == ERROR_CODE_INSUFFICIENT_CREDITS
    assert excinfo.value.service == "firecrawl"
    assert "Crédits" in excinfo.value.user_message


async def test_raises_on_rate_limit():
    client = _make_client(side_effect=RateLimitError("Too many requests"))

    with patch.dict(os.environ, {"FIRECRAWL_API_KEY": "test-key"}):
        with pytest.raises(FirecrawlScrapeError) as excinfo:
            await scrape_hits([_hit("https://example.com/page")], http_client=client)

    assert excinfo.value.code == ERROR_CODE_RATE_LIMITED


async def test_raises_on_unauthorized():
    client = _make_client(side_effect=UnauthorizedError("Invalid API key"))

    with patch.dict(os.environ, {"FIRECRAWL_API_KEY": "test-key"}):
        with pytest.raises(FirecrawlScrapeError) as excinfo:
            await scrape_hits([_hit("https://example.com/page")], http_client=client)

    assert excinfo.value.code == ERROR_CODE_AUTH_FAILED


async def test_internal_server_error_is_per_url_not_terminal():
    async def mock_scrape(*args, **kwargs):
        url = kwargs.get("url", "")
        if "boom" in url:
            raise InternalServerError("Server error")
        return _make_scrape_result(f"# Content for {url}")

    client = _make_client(side_effect=mock_scrape)

    with patch.dict(os.environ, {"FIRECRAWL_API_KEY": "test-key"}):
        results = await scrape_hits(
            [_hit("https://example.com/good"), _hit("https://example.com/boom")],
            http_client=client,
        )

    ok = [r for r in results if r["scrape_status"] == "ok"]
    errors = [r for r in results if r["scrape_status"] == "error"]
    assert len(ok) == 1
    assert ok[0]["url"] == "https://example.com/good"
    assert len(errors) == 1
    assert errors[0]["error_code"] == ERROR_CODE_FIRECRAWL_INTERNAL


async def test_terminal_error_short_circuits_remaining_urls():
    """25 hits, concurrency 10 (default): the first wave of 10 fires before the
    abort can propagate (each URL's fetch runs on its OWN single-flight task,
    lot 16 / GA-321 — a real network call always has a genuine await before it
    can raise, so the "concurrency-window" hits are the ones actually racing).
    The 15 still queued behind the semaphore must NEVER reach Firecrawl once
    ``aborted`` is set — that's the property this test protects."""
    call_count = 0

    async def mock_scrape(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise PaymentRequiredError("Insufficient credits")
        await asyncio.sleep(0.05)
        return _make_scrape_result()

    client = _make_client(side_effect=mock_scrape)
    hits = [_hit(f"https://example.com/page{i}") for i in range(25)]

    with patch.dict(os.environ, {"FIRECRAWL_API_KEY": "test-key"}):
        with pytest.raises(FirecrawlScrapeError):
            await scrape_hits(hits, max_pages=25, http_client=client)

    from app.services.firecrawl import _SCRAPE_CONCURRENCY

    assert call_count <= _SCRAPE_CONCURRENCY
    assert call_count < len(hits)


# ── ResearchBundle.render_for_prompt ─────────────────────────────────────────


def test_research_bundle_render_for_prompt_groups_by_category():
    bundle = ResearchBundle(
        sources=[
            ResearchSource(
                url="https://lesechos.fr/article-1",
                title="Press 1",
                category=SourceCategory.PRESS,
                snippet="A press release",
                scraped_markdown="# Press 1 body",
                scrape_status="ok",
            ),
            ResearchSource(
                url="https://capgemini.com/about",
                title="About us",
                category=SourceCategory.OFFICIAL,
                snippet=None,
                scraped_markdown="# About us body",
                scrape_status="ok",
            ),
            ResearchSource(
                url="https://capgemini.com/jobs/data",
                title="Data engineer",
                category=SourceCategory.JOBS,
                snippet=None,
                scraped_markdown=None,
                scrape_status="error",
                error_code="WEBSITE_BLOCKED",
            ),
        ]
    )

    rendered = bundle.render_for_prompt(max_chars_per_category=1000)

    assert "--- PRESSE (1 sources, 1 scrapée) ---" in rendered
    assert "--- SITE OFFICIEL (1 sources, 1 scrapée) ---" in rendered
    assert "--- OFFRES D'EMPLOI (1 sources, 0 scrapée) ---" in rendered
    # Reference tokens for citations
    assert "[P1]" in rendered
    assert "[O1]" in rendered
    assert "[J1]" in rendered
    # Scrape body present for OK sources
    assert "# Press 1 body" in rendered
    # Non-OK sources still show up with explicit status
    assert "scrape_status=error" in rendered


def test_research_bundle_render_dedups_mirror_content():
    # #7 : same press release mirrored across two URLs (URL-dedup misses it) →
    # the second body is NOT re-injected, it points to the first.
    body = "MARQUEURUNIQUEXYZ " + " ".join(
        f"le groupe investit dans le cloud et la data phrase {i}" for i in range(30)
    )
    bundle = ResearchBundle(
        sources=[
            ResearchSource(
                url="https://lesechos.fr/article",
                title="Press original",
                category=SourceCategory.PRESS,
                snippet=None,
                scraped_markdown=body,
                scrape_status="ok",
            ),
            ResearchSource(
                url="https://mirror.example.com/amp/article",  # different URL, same content
                title="Press mirror",
                category=SourceCategory.PRESS,
                snippet=None,
                scraped_markdown=body,
                scrape_status="ok",
            ),
        ]
    )
    rendered = bundle.render_for_prompt(max_chars_per_category=4000)
    assert rendered.count("MARQUEURUNIQUEXYZ") == 1  # body injected once, not twice
    assert "quasi-identique à [P1]" in rendered  # mirror points to the original


def test_research_bundle_status_counts():
    bundle = ResearchBundle(
        sources=[
            ResearchSource(
                url="u1", title="t1", category=SourceCategory.PRESS,
                snippet=None, scraped_markdown="x", scrape_status="ok",
            ),
            ResearchSource(
                url="u2", title="t2", category=SourceCategory.PRESS,
                snippet=None, scraped_markdown=None, scrape_status="timeout",
                error_code="TIMEOUT",
            ),
        ]
    )

    counts = bundle.status_counts()
    assert counts[SourceCategory.PRESS]["ok"] == 1
    assert counts[SourceCategory.PRESS]["timeout"] == 1
    assert counts[SourceCategory.PRESS]["error"] == 0
    # Empty category still has the zero-filled histogram
    assert counts[SourceCategory.JOBS]["ok"] == 0


# ── #9 : tie-break scrape par titre/snippet + récence (pas l'ordre Brave) ─────
def test_hit_content_score_rewards_relevance_and_recency():
    from app.services.research.sources import SourceCategory as _Cat

    rich = {
        "title": "Transformation digitale 2026",
        "description": "vaste chantier de recrutement et innovation cloud",
        "category": _Cat.PRESS,
    }
    poor = {"title": "Mentions légales", "description": "cookies et privacy", "category": _Cat.OTHER}
    assert _hit_content_score(rich) > _hit_content_score(poor)
    # même contenu mais sans année récente → score plus faible (récence = signal)
    no_year = {**rich, "title": "Transformation digitale"}
    assert _hit_content_score(rich) > _hit_content_score(no_year)


# ── #4738 : une page du site qui énonce un signal n'est pas écartée par son URL ──
@pytest.mark.parametrize(
    "path",
    [
        "nos-projets/campus-lyon",
        "groupe/chantiers-en-cours",
        "blog/ouverture-du-site-de-nantes",
        "evenements/convention-2026",
        "agenda",
        "actus/partenariat-avec-acme",
        "emploi/nous-rejoindre",
        "programme-transformation",
        "implantations/nouveau-site",
        "investissements",
        "acquisitions",
    ],
)
def test_url_priority_ne_laisse_pas_une_page_de_signal_au_niveau_du_bruit(path):
    from app.services.research.sources import SourceCategory as _Cat

    bruit = _url_priority("https://www.acme.fr/a-propos/qui-sommes-nous", _Cat.OFFICIAL)
    assert _url_priority(f"https://www.acme.fr/{path}", _Cat.OFFICIAL) > bruit


def test_url_priority_garde_les_pages_de_faible_valeur_en_bas():
    from app.services.research.sources import SourceCategory as _Cat

    assert _url_priority("https://www.acme.fr/cgu", _Cat.OFFICIAL) < _url_priority(
        "https://www.acme.fr/a-propos", _Cat.OFFICIAL
    )
