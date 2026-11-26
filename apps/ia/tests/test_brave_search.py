from __future__ import annotations

import asyncio
import os
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.services.brave_search import _build_queries, search, search_web
from app.services.research.sources import SourceCategory


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mock_response(results: list[dict], status_code: int = 200) -> httpx.Response:
    """Create a fake httpx.Response with Brave-style JSON body."""
    response = MagicMock(spec=httpx.Response)
    response.status_code = status_code
    response.is_success = 200 <= status_code < 300
    response.json.return_value = {
        "web": {
            "results": results,
        }
    }
    return response


def _make_result(title: str, url: str, description: str = "desc") -> dict:
    return {"title": title, "url": url, "description": description}


# ---------------------------------------------------------------------------
# _build_queries
# ---------------------------------------------------------------------------

async def test_build_queries_returns_dict_grouped_by_category():
    """Every queries lane is keyed by a ``SourceCategory`` member."""
    queries = _build_queries("Acme Corp", {})
    assert set(queries.keys()) >= {
        SourceCategory.PRESS,
        SourceCategory.INTERVIEW,
        SourceCategory.OFFICIAL,
        SourceCategory.PROJECT,
        SourceCategory.JOBS,
        SourceCategory.OTHER,
    }


async def test_build_queries_each_category_has_at_least_one_query():
    queries = _build_queries("Acme Corp", {})
    for category, qs in queries.items():
        assert qs, f"category {category.value} has no queries"
        assert all("Acme Corp" in q for q in qs)


async def test_build_queries_press_lane_targets_press_intent():
    queries = _build_queries("Acme Corp", {})
    press = " | ".join(queries[SourceCategory.PRESS])
    assert "communiqué" in press or "actualité" in press or "news" in press


async def test_build_queries_jobs_lane_targets_jobs_intent():
    queries = _build_queries("Acme Corp", {})
    jobs = queries[SourceCategory.JOBS]
    assert any("welcometothejungle" in q for q in jobs)


async def test_build_queries_profile_offers_extend_project_lane():
    queries = _build_queries("TestCo", {"offers": ["cloud", "data"]})
    project_lane = queries[SourceCategory.PROJECT]
    assert any("cloud projet déploiement migration" in q for q in project_lane)
    assert any("data projet déploiement migration" in q for q in project_lane)


async def test_build_queries_profile_personas_extend_other_lane():
    queries = _build_queries("TestCo", {"personas": ["DSI"]})
    other_lane = queries[SourceCategory.OTHER]
    assert any("DSI" in q for q in other_lane)


# #2289.7 — "transformation digitale" n'est jamais un mot-clé par défaut pour un
# vendeur dont le domaine d'offre déclaré n'est PAS IT.
async def test_build_queries_default_it_seller_keeps_transformation_digitale():
    queries = _build_queries("Acme Corp", {})
    press = " | ".join(queries[SourceCategory.PRESS])
    project = " | ".join(queries[SourceCategory.PROJECT])
    assert "transformation digitale" in press
    assert "transformation digitale" in project


async def test_build_queries_non_it_seller_drops_transformation_digitale():
    queries = _build_queries("Acme Corp", {"offerDomain": "industrial_engineering"})
    press = " | ".join(queries[SourceCategory.PRESS])
    project = " | ".join(queries[SourceCategory.PROJECT])
    assert "transformation digitale" not in press
    assert "transformation digitale" not in project
    # les autres requêtes de la lane restent (pas de lane vidée)
    assert queries[SourceCategory.PRESS] and queries[SourceCategory.PROJECT]


# ---------------------------------------------------------------------------
# search() — full search call returns typed BraveHit with category
# ---------------------------------------------------------------------------

async def test_search_returns_typed_hits_with_category():
    """Each returned hit carries a ``category`` field of type SourceCategory."""
    press_url = "https://www.lesechos.fr/article/testco-results"
    jobs_url = "https://www.welcometothejungle.com/companies/testco/jobs"

    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get = AsyncMock(return_value=_mock_response([
        _make_result("Press release", press_url),
        _make_result("Jobs at TestCo", jobs_url),
    ]))

    with patch.dict(os.environ, {"BRAVE_API_KEY": "test-key"}):
        hits = await search("TestCo", {}, http_client=mock_client)

    by_url = {h["url"]: h for h in hits}
    assert by_url[press_url]["category"] is SourceCategory.PRESS
    assert by_url[jobs_url]["category"] is SourceCategory.JOBS


async def test_search_deduplicates_by_url():
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get = AsyncMock(return_value=_mock_response([
        _make_result("Page A", "https://example.com/a"),
        _make_result("Page B", "https://example.com/b"),
    ]))

    with patch.dict(os.environ, {"BRAVE_API_KEY": "test-key"}):
        hits = await search("TestCo", {}, http_client=mock_client)

    urls = [h["url"] for h in hits]
    assert len(urls) == len(set(urls))


async def test_search_caps_total_by_per_category_budget():
    """Selection is bounded by the per-category caps, not a flat top-N."""
    from app.services.brave_search import MAX_RESULTS

    call_count = 0

    async def _side_effect(*args, **kwargs):
        nonlocal call_count
        offset = call_count * 25
        call_count += 1
        unique = [
            _make_result(f"Page {offset + i}", f"https://example.com/{offset + i}")
            for i in range(25)
        ]
        return _mock_response(unique)

    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get = AsyncMock(side_effect=_side_effect)

    with patch.dict(os.environ, {"BRAVE_API_KEY": "test-key"}):
        hits = await search("TestCo", {}, http_client=mock_client)

    assert len(hits) <= MAX_RESULTS


async def test_search_enforces_per_category_caps():
    """A PRESS-heavy query stream cannot starve JOBS / INTERVIEW lanes —
    each category is capped independently.
    """
    from app.services.brave_search import PER_CATEGORY_CAP
    from app.services.research.sources import SourceCategory

    # Pre-build hits that all classify as PRESS (host_seed = lesechos.fr).
    press_hits = [
        _make_result(f"Press {i}", f"https://www.lesechos.fr/article/{i}")
        for i in range(40)
    ]
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get = AsyncMock(return_value=_mock_response(press_hits))

    with patch.dict(os.environ, {"BRAVE_API_KEY": "test-key"}):
        hits = await search("TestCo", {}, http_client=mock_client)

    press_count = sum(1 for h in hits if h["category"] is SourceCategory.PRESS)
    assert press_count <= PER_CATEGORY_CAP[SourceCategory.PRESS]


async def test_search_runs_queries_in_parallel():
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get = AsyncMock(return_value=_mock_response([]))

    with patch.dict(os.environ, {"BRAVE_API_KEY": "test-key"}), \
         patch("app.services.brave_search.asyncio.gather", wraps=asyncio.gather) as mock_gather:
        await search("TestCo", {}, http_client=mock_client)
        mock_gather.assert_called_once()
        # gather should receive one coroutine per query — at least one per lane.
        args = mock_gather.call_args
        assert len(args[0]) >= 6


async def test_search_continues_on_single_query_error():
    """A failing query must not break the overall search."""
    call_count = 0

    async def _side_effect(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise httpx.ConnectError("connection refused")
        return _mock_response([
            _make_result("Good result", f"https://example.com/good-{call_count}")
        ])

    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get = AsyncMock(side_effect=_side_effect)

    with patch.dict(os.environ, {"BRAVE_API_KEY": "test-key"}):
        hits = await search("TestCo", {}, http_client=mock_client)

    assert len(hits) >= 1
    assert all(h["url"] for h in hits)


async def test_search_raises_without_api_key():
    with patch.dict(os.environ, {}, clear=True):
        with pytest.raises(ValueError, match="BRAVE_API_KEY"):
            await search("TestCo", {})


# ---------------------------------------------------------------------------
# search_web() — #2721, the free-text primitive the chat's `web_search` tool
# calls. `search()` above templates ~21 company-research queries; this is ONE
# query, verbatim, no templating — the thing `execute_query` already knows
# how to do, exposed for a caller that isn't Phase 1.
# ---------------------------------------------------------------------------

async def test_search_web_returns_title_description_url():
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get = AsyncMock(return_value=_mock_response([
        _make_result("Sopra Steria — DSI", "https://example.com/sopra-dsi", "Sopra Steria nomme un DSI."),
    ]))

    with patch.dict(os.environ, {"BRAVE_API_KEY": "test-key"}):
        hits = await search_web("Sopra Steria DSI", http_client=mock_client)

    assert hits == [
        {
            "title": "Sopra Steria — DSI",
            "url": "https://example.com/sopra-dsi",
            "description": "Sopra Steria nomme un DSI.",
            "query": "Sopra Steria DSI",
        }
    ]


async def test_search_web_sends_the_query_verbatim_no_templating():
    """Unlike ``search()``, exactly ONE call, with the caller's query as-is —
    no press/interview/official/project/jobs fan-out."""
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get = AsyncMock(return_value=_mock_response([]))

    with patch.dict(os.environ, {"BRAVE_API_KEY": "test-key"}):
        await search_web("qui sont les DSI récemment nommés", http_client=mock_client)

    mock_client.get.assert_awaited_once()
    assert mock_client.get.call_args.kwargs["params"]["q"] == "qui sont les DSI récemment nommés"


async def test_search_web_caps_at_requested_count():
    many = [_make_result(f"Page {i}", f"https://example.com/{i}") for i in range(20)]
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get = AsyncMock(return_value=_mock_response(many))

    with patch.dict(os.environ, {"BRAVE_API_KEY": "test-key"}):
        hits = await search_web("large query", count=5, http_client=mock_client)

    assert len(hits) == 5


async def test_search_web_raises_without_api_key():
    """Sans clé = no-op STRICT (env-reference.md) : aucun appel réseau, la
    même règle que ``search()``."""
    mock_client = AsyncMock(spec=httpx.AsyncClient)
    mock_client.get = AsyncMock(return_value=_mock_response([]))

    with patch.dict(os.environ, {}, clear=True):
        with pytest.raises(ValueError, match="BRAVE_API_KEY"):
            await search_web("anything", http_client=mock_client)

    mock_client.get.assert_not_awaited()
