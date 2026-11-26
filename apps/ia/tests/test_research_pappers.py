"""research_pappers (fast name path) + resolve_pappers_via_web_or_bundle
(SIREN fallback that reuses the scraped bundle before any fresh fetch)."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.services.research import pappers


@pytest.mark.asyncio
async def test_research_pappers_happy_path():
    hit = SimpleNamespace(siren="552120222")
    profile = SimpleNamespace(siren="552120222")
    with (
        patch.object(pappers, "search_company", new=AsyncMock(return_value=hit)),
        patch.object(pappers, "get_company", new=AsyncMock(return_value=profile)) as get_company,
    ):
        out = await pappers.research_pappers("Société Générale")

    assert out is profile
    get_company.assert_awaited_once_with("552120222")


@pytest.mark.asyncio
async def test_research_pappers_anchors_on_provided_siren_and_skips_name_search():
    # Scope lock (Théo p.10) : SIREN fourni → get_company direct, PAS de name search.
    profile = SimpleNamespace(siren="552120222")
    with (
        patch.object(pappers, "search_company", new=AsyncMock()) as search_company,
        patch.object(pappers, "get_company", new=AsyncMock(return_value=profile)) as get_company,
    ):
        out = await pappers.research_pappers("Société Générale", siren="552120222")

    assert out is profile
    get_company.assert_awaited_once_with("552120222")
    search_company.assert_not_awaited()  # scope lock bypasses the ambiguous name search


@pytest.mark.asyncio
async def test_research_pappers_siren_lock_falls_back_to_name_on_failure():
    # get_company(siren) échoue → on ne perd pas le run, on retombe sur le name.
    hit = SimpleNamespace(siren="424761419")
    profile = SimpleNamespace(siren="424761419")
    get_company = AsyncMock(side_effect=[RuntimeError("pappers 500"), profile])
    with (
        patch.object(pappers, "search_company", new=AsyncMock(return_value=hit)) as search_company,
        patch.object(pappers, "get_company", new=get_company),
    ):
        out = await pappers.research_pappers("OVHcloud", siren="000000000")

    assert out is profile
    search_company.assert_awaited_once()  # fell back to the name path


@pytest.mark.asyncio
async def test_research_pappers_soft_fails_to_none_without_web_fallback():
    # The fast path no longer does the web fallback itself — it just returns None.
    with (
        patch.object(pappers, "search_company", new=AsyncMock(side_effect=ValueError("no match"))),
        patch.object(pappers, "get_company", new=AsyncMock()) as get_company,
    ):
        assert await pappers.research_pappers("OVHcloud") is None
    get_company.assert_not_awaited()


@pytest.mark.asyncio
async def test_fallback_reuses_the_scraped_bundle_first():
    profile = SimpleNamespace(siren="424761419")
    sources = [SimpleNamespace(url="https://www.ovhcloud.com/mentions-legales", scraped_markdown="RCS Lille 537 407 926")]
    with (
        patch.object(pappers, "find_siren_in_bundle", return_value="424761419") as in_bundle,
        patch.object(pappers, "_resolve_siren_via_web", new=AsyncMock()) as web,
        patch.object(pappers, "get_company", new=AsyncMock(return_value=profile)) as get_company,
    ):
        out = await pappers.resolve_pappers_via_web_or_bundle("OVHcloud", sources)

    assert out is profile
    in_bundle.assert_called_once()
    web.assert_not_awaited()  # bundle hit → no fresh fetch
    get_company.assert_awaited_once_with("424761419")


@pytest.mark.asyncio
async def test_fallback_fetches_web_only_when_bundle_misses():
    profile = SimpleNamespace(siren="424761419")
    with (
        patch.object(pappers, "find_siren_in_bundle", return_value=None),
        patch.object(pappers, "_resolve_siren_via_web", new=AsyncMock(return_value="424761419")) as web,
        patch.object(pappers, "get_company", new=AsyncMock(return_value=profile)) as get_company,
    ):
        out = await pappers.resolve_pappers_via_web_or_bundle("OVHcloud", [])

    assert out is profile
    web.assert_awaited_once_with("OVHcloud")
    get_company.assert_awaited_once_with("424761419")


@pytest.mark.asyncio
async def test_fallback_returns_none_when_nothing_resolves():
    with (
        patch.object(pappers, "find_siren_in_bundle", return_value=None),
        patch.object(pappers, "_resolve_siren_via_web", new=AsyncMock(return_value=None)),
        patch.object(pappers, "get_company", new=AsyncMock()) as get_company,
    ):
        assert await pappers.resolve_pappers_via_web_or_bundle("Inconnue", []) is None
    get_company.assert_not_awaited()
