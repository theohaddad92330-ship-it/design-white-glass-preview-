"""#4108 palier 1 — trafilatura devant Firecrawl (réseau mocké, flag éteint par défaut)."""

from __future__ import annotations

import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services import cost_ledger, crawl_free_tier, firecrawl, scrape_cache
from app.services.research.sources import SourceCategory

RICH_HTML = (
    "<html><head><title>Actualités</title></head><body><nav>menu menu</nav><article>"
    + "".join(
        f"<p>Paragraphe {i} : l'entreprise annonce un programme de transformation numérique "
        "pluriannuel, un nouveau directeur des systèmes d'information et des partenariats "
        "avec plusieurs prestataires de services numériques.</p>"
        for i in range(12)
    )
    + "</article><footer>mentions</footer></body></html>"
)
POOR_HTML = "<html><body><div id='root'></div><script>app()</script></body></html>"
ROBOTS_ALLOW = "User-agent: *\nAllow: /\n"
ROBOTS_DENY = "User-agent: *\nDisallow: /\n"


def _hit(url: str) -> dict:
    return {"url": url, "title": "T", "category": SourceCategory.OTHER, "description": "d"}


def _transport(pages: dict[str, tuple[int, str]]) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        status, body = pages.get(str(request.url), (404, ""))
        return httpx.Response(status, text=body, headers={"content-type": "text/html"})

    return httpx.MockTransport(handler)


@pytest.fixture(autouse=True)
def _setup(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(scrape_cache, "_redis", AsyncMock(return_value=None))
    monkeypatch.setattr(crawl_free_tier, "_assert_safe", AsyncMock(return_value=None))
    crawl_free_tier._ROBOTS_CACHE.clear()
    monkeypatch.setenv("CRAWL_TIER_FREE_ENABLED", "true")


def _use_pages(monkeypatch: pytest.MonkeyPatch, pages: dict[str, tuple[int, str]]) -> None:
    transport = _transport(pages)
    monkeypatch.setattr(
        crawl_free_tier,
        "_new_client",
        lambda: httpx.AsyncClient(transport=transport, headers={"User-Agent": crawl_free_tier.USER_AGENT}),
    )


def _fc_client() -> AsyncMock:
    client = AsyncMock()
    client.scrape.return_value = SimpleNamespace(markdown="# firecrawl")
    return client


async def test_static_rich_page_served_free_without_firecrawl(monkeypatch) -> None:
    url = "https://exemple.fr/actus"
    _use_pages(monkeypatch, {"https://exemple.fr/robots.txt": (200, ROBOTS_ALLOW), url: (200, RICH_HTML)})
    client = _fc_client()
    with cost_ledger.bind_run("r1"):
        res = await firecrawl._scrape_one(_hit(url), client)
        rows = cost_ledger.snapshot()
    assert res["scrape_status"] == "ok"
    assert "transformation numérique" in (res["markdown"] or "")
    client.scrape.assert_not_called()
    assert [(r["provider"], r["operation"]) for r in rows] == [("crawl_tier", "free")]


async def test_poor_js_page_falls_back_to_firecrawl(monkeypatch) -> None:
    url = "https://exemple.fr/spa"
    _use_pages(monkeypatch, {"https://exemple.fr/robots.txt": (200, ROBOTS_ALLOW), url: (200, POOR_HTML)})
    client = _fc_client()
    with cost_ledger.bind_run("r2"):
        res = await firecrawl._scrape_one(_hit(url), client)
        rows = cost_ledger.snapshot()
    client.scrape.assert_called_once()
    assert res["markdown"] == "# firecrawl"
    assert ("crawl_tier", "firecrawl") in [(r["provider"], r["operation"]) for r in rows]


async def test_robots_disallow_means_no_crawl_at_all(monkeypatch) -> None:
    url = "https://exemple.fr/prive"
    _use_pages(monkeypatch, {"https://exemple.fr/robots.txt": (200, ROBOTS_DENY), url: (200, RICH_HTML)})
    client = _fc_client()
    res = await firecrawl._scrape_one(_hit(url), client)
    client.scrape.assert_not_called()
    assert res["scrape_status"] == "skipped"
    assert res["error_code"] == crawl_free_tier.ERROR_CODE_ROBOTS_DISALLOWED
    assert res["markdown"] is None


async def test_linkedin_refused_at_every_tier(monkeypatch) -> None:
    _use_pages(monkeypatch, {})
    client = _fc_client()
    for url in ("https://www.linkedin.com/company/x", "https://fr.linkedin.com/in/y"):
        res = await firecrawl._scrape_one(_hit(url), client)
        assert res["scrape_status"] == "skipped"
        assert res["error_code"] == crawl_free_tier.ERROR_CODE_DOMAIN_REFUSED
    client.scrape.assert_not_called()


async def test_flag_off_never_imports_trafilatura(monkeypatch) -> None:
    monkeypatch.delenv("CRAWL_TIER_FREE_ENABLED")
    monkeypatch.delitem(sys.modules, "trafilatura", raising=False)
    client = _fc_client()
    res = await firecrawl._scrape_one(_hit("https://exemple.fr/off"), client)
    client.scrape.assert_called_once()
    assert res["markdown"] == "# firecrawl"
    assert "trafilatura" not in sys.modules


def test_sufficiency_threshold_is_named_and_applied() -> None:
    assert crawl_free_tier.MIN_USEFUL_CHARS >= 300
    words = "transformation numerique " * 100
    assert crawl_free_tier.is_sufficient(words[: crawl_free_tier.MIN_USEFUL_CHARS + 1700])
    assert not crawl_free_tier.is_sufficient(words[: crawl_free_tier.MIN_USEFUL_CHARS - 1])
    # long mais sans contenu (un seul « mot ») : pas suffisant
    assert not crawl_free_tier.is_sufficient("x" * (crawl_free_tier.MIN_USEFUL_CHARS * 2))
    assert not crawl_free_tier.is_sufficient("")
    assert not crawl_free_tier.is_sufficient(None)
    # du contenu, pas un mur de ponctuation / d'espaces
    assert not crawl_free_tier.is_sufficient(" \n" * crawl_free_tier.MIN_USEFUL_CHARS)


async def test_user_agent_is_honest_and_robots_5xx_is_closed(monkeypatch) -> None:
    assert "BellumAI" in crawl_free_tier.USER_AGENT
    assert "Mozilla/5.0 (Windows" not in crawl_free_tier.USER_AGENT
    url = "https://exemple.fr/x"
    _use_pages(monkeypatch, {"https://exemple.fr/robots.txt": (503, ""), url: (200, RICH_HTML)})
    client = _fc_client()
    res = await firecrawl._scrape_one(_hit(url), client)
    client.scrape.assert_not_called()
    assert res["error_code"] == crawl_free_tier.ERROR_CODE_ROBOTS_DISALLOWED
