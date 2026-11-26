"""#3205.1 (épopée #3239) — « crédits de site AU-DELÀ de #3095 » : un fetch
CIBLÉ des pages mentions légales / crédits / partenaires du site officiel, que
la recherche Brave n'a pas rendues.

Sans clé Firecrawl = no-op STRICT (aucun appel réseau). Le fetch reste sous le
MÊME plafond de pages que le run (`MAX_PAGES_PER_RUN`) : jamais un budget de
plus. Même hôte que le site officiel seulement. Un échec ne fait pas tomber le
run.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services.provider_footprint_crawl import candidate_urls, crawl_footprint_pages


# LOT (15/10) DATA-A point 4 — les pages viennent de `/map` (elles EXISTENT), jamais de chemins devinés.
_LINKS = [
    "https://www.acme.fr/",
    "https://www.acme.fr/mentions-legales",
    "https://www.acme.fr/credits",
    "https://www.acme.fr/blog/article",
    "https://autre-site.com/mentions-legales",
]


def test_candidates_are_real_pages_on_the_official_host_minus_those_already_scraped() -> None:
    urls = candidate_urls("https://www.acme.fr/", {"https://www.acme.fr/mentions-legales"}, _LINKS)
    assert urls == ["https://www.acme.fr/credits"]


def test_without_a_mapped_link_no_path_is_guessed() -> None:
    assert candidate_urls("https://acme.fr", set(), []) == []


def test_a_trailing_slash_does_not_hide_an_already_scraped_page() -> None:
    urls = candidate_urls("https://www.acme.fr", {"https://www.acme.fr/credits/"}, _LINKS)
    assert urls == ["https://www.acme.fr/mentions-legales"]


@pytest.mark.parametrize("site", [None, "", "not a url", "ftp://acme.fr", "https://"])
def test_no_usable_official_site_gives_no_candidate(site: str | None) -> None:
    assert candidate_urls(site, set(), _LINKS) == []


async def _map_ok(_site: str) -> list[str]:
    return _LINKS


class _Spy:
    def __init__(self, results: list[dict[str, Any]] | Exception) -> None:
        self.calls: list[list[dict[str, Any]]] = []
        self._results = results

    async def __call__(self, hits: list[dict[str, Any]], *, max_pages: int) -> list[dict[str, Any]]:
        self.calls.append(hits)
        if isinstance(self._results, Exception):
            raise self._results
        return self._results


@pytest.mark.asyncio
async def test_without_a_firecrawl_key_nothing_is_fetched(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("FIRECRAWL_API_KEY", raising=False)
    spy = _Spy([])
    pages = await crawl_footprint_pages("https://www.acme.fr", set(), pages_already_used=0, scrape=spy, mapper=_map_ok)
    assert pages == [] and spy.calls == []


@pytest.mark.asyncio
async def test_a_full_page_budget_fetches_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FIRECRAWL_API_KEY", "fc-test")
    spy = _Spy([])
    pages = await crawl_footprint_pages("https://www.acme.fr", set(), pages_already_used=12, scrape=spy, mapper=_map_ok)
    assert pages == [] and spy.calls == []


@pytest.mark.asyncio
async def test_the_fetch_never_exceeds_the_remaining_page_budget(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FIRECRAWL_API_KEY", "fc-test")
    spy = _Spy([])
    await crawl_footprint_pages("https://www.acme.fr", set(), pages_already_used=11, scrape=spy, mapper=_map_ok)
    assert len(spy.calls) == 1 and len(spy.calls[0]) == 1


@pytest.mark.asyncio
async def test_only_pages_that_came_back_ok_are_returned(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FIRECRAWL_API_KEY", "fc-test")
    spy = _Spy(
        [
            {"url": "https://www.acme.fr/mentions-legales", "markdown": "Réalisation : Pixel", "scrape_status": "ok"},
            {"url": "https://www.acme.fr/credits", "markdown": None, "scrape_status": "error"},
        ]
    )
    pages = await crawl_footprint_pages("https://www.acme.fr", set(), pages_already_used=5, scrape=spy, mapper=_map_ok)
    assert pages == [{"url": "https://www.acme.fr/mentions-legales", "markdown": "Réalisation : Pixel"}]


@pytest.mark.asyncio
async def test_a_scrape_failure_never_takes_the_run_down(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FIRECRAWL_API_KEY", "fc-test")
    pages = await crawl_footprint_pages(
        "https://www.acme.fr", set(), pages_already_used=5, scrape=_Spy(RuntimeError("boom")), mapper=_map_ok
    )
    assert pages == []


def test_the_crawl_is_wired_into_the_research_route() -> None:
    from pathlib import Path

    source = (Path(__file__).parent.parent / "app" / "routers" / "phase1_research.py").read_text(encoding="utf-8")
    assert "crawl_footprint_pages(" in source


@pytest.mark.asyncio
async def test_only_existing_pages_are_scraped_never_the_guessed_ones(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FIRECRAWL_API_KEY", "fc-test")
    spy = _Spy([])
    await crawl_footprint_pages("https://www.acme.fr", set(), pages_already_used=0, scrape=spy, mapper=_map_ok)
    assert [h["url"] for h in spy.calls[0]] == ["https://www.acme.fr/mentions-legales", "https://www.acme.fr/credits"]


@pytest.mark.asyncio
async def test_an_empty_or_failed_map_scrapes_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FIRECRAWL_API_KEY", "fc-test")

    async def empty(_site: str) -> list[str]:
        return []

    async def boom(_site: str) -> list[str]:
        raise RuntimeError("map down")

    for mapper in (empty, boom):
        spy = _Spy([])
        pages = await crawl_footprint_pages(
            "https://www.acme.fr", set(), pages_already_used=0, scrape=spy, mapper=mapper
        )
        assert pages == [] and spy.calls == []
