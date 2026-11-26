"""#4108 palier 2 — crawl4ai devant Firecrawl (réseau et navigateur mockés, flag éteint par défaut)."""

from __future__ import annotations

import sys
import types
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services import cost_ledger, crawl_free_tier, firecrawl, scrape_cache
from app.services.research.sources import SourceCategory

RICH_MARKDOWN = (
    "# Actualités\n\n"
    + "\n\n".join(
        f"Paragraphe {i} : l'entreprise annonce un programme de transformation numérique "
        "pluriannuel, un nouveau directeur des systèmes d'information et des partenariats "
        "avec plusieurs prestataires de services numériques."
        for i in range(12)
    )
)
POOR_MARKDOWN = "menu"
ROBOTS_ALLOW = "User-agent: *\nAllow: /\n"
ROBOTS_DENY = "User-agent: *\nDisallow: /\n"


def _hit(url: str) -> dict:
    return {"url": url, "title": "T", "category": SourceCategory.OTHER, "description": "d"}


def _robots_transport(pages: dict[str, tuple[int, str]]) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        status, body = pages.get(str(request.url), (404, ""))
        return httpx.Response(status, text=body, headers={"content-type": "text/plain"})

    return httpx.MockTransport(handler)


def _use_robots(monkeypatch: pytest.MonkeyPatch, pages: dict[str, tuple[int, str]]) -> None:
    transport = _robots_transport(pages)
    monkeypatch.setattr(
        crawl_free_tier,
        "_new_client",
        lambda: httpx.AsyncClient(transport=transport, headers={"User-Agent": crawl_free_tier.USER_AGENT}),
    )


def _fc_client() -> AsyncMock:
    client = AsyncMock()
    client.scrape.return_value = SimpleNamespace(markdown="# firecrawl")
    return client


class _FakeResult:
    def __init__(self, success: bool, markdown: str | None) -> None:
        self.success = success
        self.markdown = markdown


class _FakeCrawler:
    last_browser_config: object | None = None
    last_run_config: object | None = None

    def __init__(self, config=None, **kwargs) -> None:
        _FakeCrawler.last_browser_config = config

    async def __aenter__(self) -> _FakeCrawler:
        return self

    async def __aexit__(self, *exc_info) -> bool:
        return False

    async def arun(self, url: str, config=None):
        _FakeCrawler.last_run_config = config
        outcome = _FakeCrawler.outcome
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def _install_fake_crawl4ai(monkeypatch: pytest.MonkeyPatch, outcome) -> None:
    _FakeCrawler.outcome = outcome
    module = types.ModuleType("crawl4ai")
    module.AsyncWebCrawler = _FakeCrawler
    module.BrowserConfig = lambda **kwargs: SimpleNamespace(**kwargs)
    module.CrawlerRunConfig = lambda **kwargs: SimpleNamespace(**kwargs)
    monkeypatch.setitem(sys.modules, "crawl4ai", module)


@pytest.fixture(autouse=True)
def _setup(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(scrape_cache, "_redis", AsyncMock(return_value=None))
    crawl_free_tier._ROBOTS_CACHE.clear()
    monkeypatch.delenv("CRAWL_TIER_FREE_ENABLED", raising=False)
    monkeypatch.setenv("CRAWL_TIER_BROWSER_ENABLED", "true")


async def test_rendered_page_served_by_browser_without_firecrawl(monkeypatch) -> None:
    url = "https://exemple.fr/spa"
    _use_robots(monkeypatch, {"https://exemple.fr/robots.txt": (200, ROBOTS_ALLOW)})
    _install_fake_crawl4ai(monkeypatch, _FakeResult(True, RICH_MARKDOWN))
    client = _fc_client()
    with cost_ledger.bind_run("r1"):
        res = await firecrawl._scrape_one(_hit(url), client)
        rows = cost_ledger.snapshot()
    assert res["scrape_status"] == "ok"
    assert "transformation numérique" in (res["markdown"] or "")
    client.scrape.assert_not_called()
    assert [(r["provider"], r["operation"]) for r in rows] == [("crawl_tier", "browser")]


async def test_poor_rendered_page_falls_back_to_firecrawl(monkeypatch) -> None:
    url = "https://exemple.fr/vide"
    _use_robots(monkeypatch, {"https://exemple.fr/robots.txt": (200, ROBOTS_ALLOW)})
    _install_fake_crawl4ai(monkeypatch, _FakeResult(True, POOR_MARKDOWN))
    client = _fc_client()
    with cost_ledger.bind_run("r2"):
        res = await firecrawl._scrape_one(_hit(url), client)
        rows = cost_ledger.snapshot()
    client.scrape.assert_called_once()
    assert res["markdown"] == "# firecrawl"
    assert [(r["provider"], r["operation"]) for r in rows] == [("crawl_tier", "firecrawl")]


async def test_browser_crash_falls_back_to_firecrawl(monkeypatch) -> None:
    url = "https://exemple.fr/crash"
    _use_robots(monkeypatch, {"https://exemple.fr/robots.txt": (200, ROBOTS_ALLOW)})
    _install_fake_crawl4ai(monkeypatch, RuntimeError("navigateur hors service"))
    client = _fc_client()
    res = await firecrawl._scrape_one(_hit(url), client)
    client.scrape.assert_called_once()
    assert res["markdown"] == "# firecrawl"


async def test_robots_disallow_means_no_browser_crawl_either(monkeypatch) -> None:
    url = "https://exemple.fr/prive"
    _use_robots(monkeypatch, {"https://exemple.fr/robots.txt": (200, ROBOTS_DENY)})
    monkeypatch.delitem(sys.modules, "crawl4ai", raising=False)
    client = _fc_client()
    res = await firecrawl._scrape_one(_hit(url), client)
    client.scrape.assert_not_called()
    assert res["scrape_status"] == "skipped"
    assert res["error_code"] == crawl_free_tier.ERROR_CODE_ROBOTS_DISALLOWED
    assert "crawl4ai" not in sys.modules


async def test_linkedin_refused_for_browser_tier_too(monkeypatch) -> None:
    monkeypatch.delitem(sys.modules, "crawl4ai", raising=False)
    client = _fc_client()
    for url in ("https://www.linkedin.com/company/x", "https://fr.linkedin.com/in/y"):
        res = await firecrawl._scrape_one(_hit(url), client)
        assert res["scrape_status"] == "skipped"
        assert res["error_code"] == crawl_free_tier.ERROR_CODE_DOMAIN_REFUSED
    client.scrape.assert_not_called()
    assert "crawl4ai" not in sys.modules


async def test_flag_off_never_imports_crawl4ai(monkeypatch) -> None:
    monkeypatch.delenv("CRAWL_TIER_BROWSER_ENABLED")
    monkeypatch.delitem(sys.modules, "crawl4ai", raising=False)
    client = _fc_client()
    res = await firecrawl._scrape_one(_hit("https://exemple.fr/off"), client)
    client.scrape.assert_called_once()
    assert res["markdown"] == "# firecrawl"
    assert "crawl4ai" not in sys.modules


async def test_free_tier_insufficient_then_browser_tier_served(monkeypatch) -> None:
    """Les deux paliers allumés : l'échec du palier 1 retombe sur le palier 2, pas directement Firecrawl."""
    url = "https://exemple.fr/js"
    monkeypatch.setenv("CRAWL_TIER_FREE_ENABLED", "true")
    monkeypatch.setattr(crawl_free_tier, "_assert_safe", AsyncMock(return_value=None))
    poor_html = "<html><body><div id='root'></div><script>app()</script></body></html>"

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text=ROBOTS_ALLOW, headers={"content-type": "text/plain"})
        return httpx.Response(200, text=poor_html, headers={"content-type": "text/html"})

    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(
        crawl_free_tier,
        "_new_client",
        lambda: httpx.AsyncClient(transport=transport, headers={"User-Agent": crawl_free_tier.USER_AGENT}),
    )
    _install_fake_crawl4ai(monkeypatch, _FakeResult(True, RICH_MARKDOWN))
    client = _fc_client()
    with cost_ledger.bind_run("r3"):
        res = await firecrawl._scrape_one(_hit(url), client)
        rows = cost_ledger.snapshot()
    client.scrape.assert_not_called()
    assert res["scrape_status"] == "ok"
    assert [(r["provider"], r["operation"]) for r in rows] == [("crawl_tier", "browser")]


def test_user_agent_passed_to_browser_config(monkeypatch) -> None:
    assert "BellumAI" in crawl_free_tier.USER_AGENT
