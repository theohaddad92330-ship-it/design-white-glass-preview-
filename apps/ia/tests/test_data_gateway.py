"""IA v2 Data Gateway — waterfall search + FR-signal consolidation.

Covers: the provider clients (Serper/Tavily) no-op without keys (asserting NO
network call) and parse correctly; the waterfall picks the first keyed provider,
falls back on empty AND on error, and is fully inert (no provider called) when no
key is present; FR signals degrade per-source. Mocked HTTP.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import httpx
import pytest

from app.services import data_gateway as dg
from app.services.data_gateway import DataGateway
from app.services.data_sources.serper import serper_search
from app.services.data_sources.tavily import tavily_search

_SEARCH_KEYS = ("SERPER_API_KEY", "TAVILY_API_KEY", "BRAVE_API_KEY")


def _resp(json_data: object, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json=json_data, request=httpx.Request("POST", "https://x"))


def _post_client(resp: httpx.Response) -> AsyncMock:
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(return_value=resp)
    c.get = AsyncMock(return_value=resp)
    return c


def _clear_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    for k in _SEARCH_KEYS:
        monkeypatch.delenv(k, raising=False)


# ── Serper provider ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_serper_no_op_without_key_makes_no_network_call(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SERPER_API_KEY", raising=False)
    client = _post_client(_resp({}))
    assert await serper_search("SNCF", client=client) == []
    client.post.assert_not_called()  # NO FAKE, NO network


@pytest.mark.asyncio
async def test_serper_parses_organic(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SERPER_API_KEY", "k")
    payload = {
        "organic": [
            {"title": "SNCF DSI", "link": "https://sncf.com/dsi", "snippet": "La DSI du groupe..."},
            {"title": "no link dropped", "snippet": "x"},
            {"title": "SNCF news", "link": "https://presse.sncf.com/x", "snippet": "actu"},
        ]
    }
    out = await serper_search("SNCF", client=_post_client(_resp(payload)))
    assert [h["url"] for h in out] == ["https://sncf.com/dsi", "https://presse.sncf.com/x"]
    assert out[0]["source"] == "serper"
    assert out[0]["title"] == "SNCF DSI"


@pytest.mark.asyncio
async def test_serper_passes_through_a_real_date_field(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SERPER_API_KEY", "k")
    payload = {"organic": [{"title": "SNCF DSI", "link": "https://sncf.com/dsi", "date": "20 sept. 2026"}]}
    out = await serper_search("SNCF", client=_post_client(_resp(payload)))
    assert out[0]["date"] == "20 sept. 2026"


@pytest.mark.asyncio
async def test_serper_degrades_on_http_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SERPER_API_KEY", "k")
    assert await serper_search("SNCF", client=_post_client(_resp({}, status=500))) == []


# ── Tavily provider ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_tavily_no_op_without_key_makes_no_network_call(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("TAVILY_API_KEY", raising=False)
    client = _post_client(_resp({}))
    assert await tavily_search("SNCF", client=client) == []
    client.post.assert_not_called()


@pytest.mark.asyncio
async def test_tavily_parses_results(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TAVILY_API_KEY", "k")
    payload = {
        "results": [
            {"title": "SNCF", "url": "https://sncf.com", "content": "Groupe ferroviaire..."},
            {"title": "no url", "content": "x"},
        ]
    }
    out = await tavily_search("SNCF", client=_post_client(_resp(payload)))
    assert len(out) == 1
    assert out[0]["url"] == "https://sncf.com"
    assert out[0]["description"].startswith("Groupe ferroviaire")
    assert out[0]["source"] == "tavily"


@pytest.mark.asyncio
async def test_tavily_passes_through_a_real_published_date(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TAVILY_API_KEY", "k")
    payload = {"results": [{"title": "SNCF", "url": "https://sncf.com", "content": "x", "published_date": "2026-09-18"}]}
    out = await tavily_search("SNCF", client=_post_client(_resp(payload)))
    assert out[0]["date"] == "2026-09-18"


@pytest.mark.asyncio
async def test_tavily_degrades_on_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TAVILY_API_KEY", "k")
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(side_effect=httpx.ConnectError("boom"))
    assert await tavily_search("SNCF", client=c) == []


# ── Brave single-query adapter ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_brave_single_no_op_without_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("BRAVE_API_KEY", raising=False)
    client = _post_client(_resp({}))
    assert await dg.brave_search_single("SNCF", client=client) == []
    client.get.assert_not_called()


@pytest.mark.asyncio
async def test_brave_single_parses(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BRAVE_API_KEY", "k")
    payload = {"web": {"results": [{"title": "SNCF", "url": "https://sncf.com", "description": "d"}]}}
    out = await dg.brave_search_single("SNCF", client=_post_client(_resp(payload)))
    assert out[0]["url"] == "https://sncf.com"
    assert out[0]["source"] == "brave"


@pytest.mark.asyncio
async def test_brave_single_passes_through_a_real_date_field(monkeypatch: pytest.MonkeyPatch) -> None:
    """#2616.1 — Brave rend une date par résultat (``page_age``/``age``, même
    payload que ``brave_news.py:75``) : le waterfall doit la transmettre, pas
    la jeter. C'est ce qui manquait pour que ``job_search.py`` puisse juger la
    fraîcheur d'une offre dont l'URL elle-même ne porte jamais de date
    (Lever/Greenhouse/Teamtailor…)."""
    monkeypatch.setenv("BRAVE_API_KEY", "k")
    payload = {
        "web": {
            "results": [
                {
                    "title": "SNCF",
                    "url": "https://sncf.com",
                    "description": "d",
                    "page_age": "2026-09-20T10:00:00Z",
                }
            ]
        }
    }
    out = await dg.brave_search_single("SNCF", client=_post_client(_resp(payload)))
    assert out[0]["date"] == "2026-09-20T10:00:00Z"


@pytest.mark.asyncio
async def test_brave_single_date_absent_stays_empty_never_guessed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BRAVE_API_KEY", "k")
    payload = {"web": {"results": [{"title": "SNCF", "url": "https://sncf.com", "description": "d"}]}}
    out = await dg.brave_search_single("SNCF", client=_post_client(_resp(payload)))
    assert out[0]["date"] == ""


# ── Waterfall ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_waterfall_empty_query_returns_empty() -> None:
    assert await DataGateway().search("  ") == []


@pytest.mark.asyncio
async def test_waterfall_no_key_is_inert_no_provider_no_network(monkeypatch: pytest.MonkeyPatch) -> None:
    """No provider key → the gateway calls NOTHING (no provider, no network) and
    returns []. NO FAKE."""
    _clear_keys(monkeypatch)
    serper = AsyncMock()
    tavily = AsyncMock()
    brave = AsyncMock()
    monkeypatch.setattr(dg, "serper_search", serper)
    monkeypatch.setattr(dg, "tavily_search", tavily)
    monkeypatch.setattr(dg, "brave_search_single", brave)
    client = _post_client(_resp({}))

    assert await DataGateway(client=client).search("SNCF") == []
    serper.assert_not_called()
    tavily.assert_not_called()
    brave.assert_not_called()
    client.get.assert_not_called()
    client.post.assert_not_called()


@pytest.mark.asyncio
async def test_waterfall_picks_first_keyed_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    """Serper keyed + returns hits → it wins; Tavily/Brave never touched."""
    _clear_keys(monkeypatch)
    monkeypatch.setenv("SERPER_API_KEY", "k")
    hits = [{"title": "t", "url": "https://a", "description": "d", "source": "serper"}]
    serper = AsyncMock(return_value=hits)
    tavily = AsyncMock(return_value=[{"url": "https://b"}])
    brave = AsyncMock(return_value=[{"url": "https://c"}])
    monkeypatch.setattr(dg, "serper_search", serper)
    monkeypatch.setattr(dg, "tavily_search", tavily)
    monkeypatch.setattr(dg, "brave_search_single", brave)

    out = await DataGateway().search("SNCF")
    assert out == hits
    serper.assert_awaited_once()
    tavily.assert_not_called()
    brave.assert_not_called()


@pytest.mark.asyncio
async def test_waterfall_falls_back_on_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    """Serper keyed but empty → fall through to keyed Tavily."""
    _clear_keys(monkeypatch)
    monkeypatch.setenv("SERPER_API_KEY", "k")
    monkeypatch.setenv("TAVILY_API_KEY", "k")
    tavily_hits = [{"title": "t", "url": "https://b", "description": "d", "source": "tavily"}]
    serper = AsyncMock(return_value=[])
    tavily = AsyncMock(return_value=tavily_hits)
    brave = AsyncMock(return_value=[{"url": "https://c"}])
    monkeypatch.setattr(dg, "serper_search", serper)
    monkeypatch.setattr(dg, "tavily_search", tavily)
    monkeypatch.setattr(dg, "brave_search_single", brave)

    out = await DataGateway().search("SNCF")
    assert out == tavily_hits
    serper.assert_awaited_once()
    tavily.assert_awaited_once()
    brave.assert_not_called()


@pytest.mark.asyncio
async def test_waterfall_falls_back_on_error(monkeypatch: pytest.MonkeyPatch) -> None:
    """Serper keyed but raises → the error is swallowed and Tavily takes over."""
    _clear_keys(monkeypatch)
    monkeypatch.setenv("SERPER_API_KEY", "k")
    monkeypatch.setenv("TAVILY_API_KEY", "k")
    tavily_hits = [{"title": "t", "url": "https://b", "description": "d", "source": "tavily"}]
    serper = AsyncMock(side_effect=httpx.ConnectError("boom"))
    tavily = AsyncMock(return_value=tavily_hits)
    monkeypatch.setattr(dg, "serper_search", serper)
    monkeypatch.setattr(dg, "tavily_search", tavily)
    monkeypatch.setattr(dg, "brave_search_single", AsyncMock())

    out = await DataGateway().search("SNCF")
    assert out == tavily_hits
    serper.assert_awaited_once()
    tavily.assert_awaited_once()


@pytest.mark.asyncio
async def test_waterfall_brave_only_key_skips_unkeyed_providers(monkeypatch: pytest.MonkeyPatch) -> None:
    """Only Brave keyed → Serper/Tavily are skipped (never called) and Brave wins."""
    _clear_keys(monkeypatch)
    monkeypatch.setenv("BRAVE_API_KEY", "k")
    brave_hits = [{"title": "t", "url": "https://c", "description": "d", "source": "brave"}]
    serper = AsyncMock(return_value=[{"url": "https://a"}])
    tavily = AsyncMock(return_value=[{"url": "https://b"}])
    brave = AsyncMock(return_value=brave_hits)
    monkeypatch.setattr(dg, "serper_search", serper)
    monkeypatch.setattr(dg, "tavily_search", tavily)
    monkeypatch.setattr(dg, "brave_search_single", brave)

    out = await DataGateway().search("SNCF")
    assert out == brave_hits
    serper.assert_not_called()
    tavily.assert_not_called()
    brave.assert_awaited_once()


@pytest.mark.asyncio
async def test_waterfall_all_keyed_but_empty_returns_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_keys(monkeypatch)
    for k in _SEARCH_KEYS:
        monkeypatch.setenv(k, "k")
    monkeypatch.setattr(dg, "serper_search", AsyncMock(return_value=[]))
    monkeypatch.setattr(dg, "tavily_search", AsyncMock(return_value=[]))
    monkeypatch.setattr(dg, "brave_search_single", AsyncMock(return_value=[]))
    assert await DataGateway().search("SNCF") == []


# ── FR signals consolidation ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_collect_fr_signals_empty_company() -> None:
    out = await DataGateway().collect_fr_signals("")
    assert out == {"registry": None, "tenders": [], "jobs": [], "legalSignals": []}


@pytest.mark.asyncio
async def test_collect_fr_signals_graceful_per_source_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    """One source raising must not sink the others; BODACC siren derived from the
    registry lookup."""
    monkeypatch.setattr(dg, "fetch_company", AsyncMock(return_value={"siren": "552049447"}))
    monkeypatch.setattr(dg, "public_tenders", AsyncMock(side_effect=RuntimeError("boom")))
    monkeypatch.setattr(dg, "it_job_signals", AsyncMock(return_value=[{"title": "Dev Java"}]))
    # APEC est active par défaut (zéro-flag) : on la mocke pour garder le test hors réseau.
    monkeypatch.setattr(dg, "it_job_signals_apec", AsyncMock(return_value=[]))
    monkeypatch.setattr(dg, "it_job_signals_wttj", AsyncMock(return_value=[]))
    monkeypatch.setattr(dg, "legal_signals", AsyncMock(return_value=[{"type": "Dépôts des comptes"}]))

    out = await DataGateway().collect_fr_signals("SNCF")
    assert out["registry"] == {"siren": "552049447"}
    assert out["tenders"] == []  # the failing source degraded, others survived
    assert out["jobs"] == [{"title": "Dev Java"}]
    assert out["legalSignals"] == [{"type": "Dépôts des comptes"}]
    dg.legal_signals.assert_awaited_once()
    assert dg.legal_signals.await_args.args[0] == "552049447"
