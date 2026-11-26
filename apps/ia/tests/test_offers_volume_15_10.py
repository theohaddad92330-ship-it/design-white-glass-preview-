"""DISCOVER-OFFRES (15/10, point A) — le volume d'offres par carte : un aperçu gratuit pour toute la page."""

from __future__ import annotations

import time
from unittest.mock import AsyncMock

import httpx
import pytest

from app.routers import discover as discover_router
from app.services import provider_cache
from app.services.data_sources import mantiks_volume as mv


def _resp(payload: object, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json=payload, request=httpx.Request("POST", "https://x"))


def _row(site: str, n: int) -> dict:
    return {"company": {"id": 1, "name": "X", "website": site}, "job": {"job_title": "Dev"}, "matching_jobs": n}


@pytest.fixture(autouse=True)
def _env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MANTIKS_API_KEY", "k")
    monkeypatch.setattr(provider_cache, "_redis", AsyncMock(return_value=None))


def _client(payload: object, status: int = 200) -> AsyncMock:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.post = AsyncMock(return_value=_resp(payload, status))
    return client


def test_root_domain() -> None:
    assert mv.root_domain("https://www.shop.decathlon.fr/x") == "decathlon.fr"
    assert mv.root_domain("lectra.com") == "lectra.com"
    assert mv.root_domain("https://www.bbc.co.uk/a") == "bbc.co.uk"
    assert mv.root_domain("") == ""
    assert mv.root_domain("localhost") == ""


async def test_one_call_for_the_whole_page_and_sums_by_root_domain() -> None:
    client = _client([_row("https://www.lectra.com", 100), _row("lectra.com", 79), _row("seb.com", 133), _row("autre.fr", 9)])
    out = await mv.offer_volumes(["https://lectra.com/fr", "www.seb.com", "manitou.com"], client=client)
    assert out == {"lectra.com": 179, "seb.com": 133}  # « autre.fr » n'est pas une carte ; manitou : aucune ligne
    assert client.post.call_count == 1
    body = client.post.call_args.kwargs["json"]
    assert body["company"]["websites"] == ["lectra.com", "seb.com", "manitou.com"]
    assert body["job"]["locations"] == [{"id": "3017382", "radius": None}]
    assert body["job"]["published_date_window_days"] == 90
    assert body["job"]["contract_types_exclude"] == ["internship"]
    assert body["job"]["is_reposting"] is False
    assert body["company"]["reverse_sourcing_min_probability"] == 70
    assert body["people"] == {"has_valid_email": False, "allow_missing_people": True, "phone": False, "persona_strategy": "all"}
    assert client.post.call_args.kwargs["headers"]["X-API-KEY"] == "k"
    assert client.post.call_args.args[0].endswith("/api/v2/searches/preview")


async def test_response_may_wrap_the_rows() -> None:
    out = await mv.offer_volumes(["lectra.com"], client=_client({"data": [_row("lectra.com", 5)]}))
    assert out == {"lectra.com": 5}


@pytest.mark.parametrize("payload", [{}, {"error": "x"}, "texte", [], [_row("lectra.com", 0)], [{"matching_jobs": 4}]])
async def test_no_usable_answer_means_no_line_never_zero(payload: object) -> None:
    assert await mv.offer_volumes(["lectra.com"], client=_client(payload)) == {}


async def test_http_error_means_no_line() -> None:
    assert await mv.offer_volumes(["lectra.com"], client=_client({"error": "x"}, status=500)) == {}


async def test_network_failure_means_no_line() -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.post = AsyncMock(side_effect=httpx.ConnectError("boom"))
    assert await mv.offer_volumes(["lectra.com"], client=client) == {}


async def test_without_key_no_network_call(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MANTIKS_API_KEY")
    client = _client([_row("lectra.com", 5)])
    assert await mv.offer_volumes(["lectra.com"], client=client) == {}
    client.post.assert_not_called()


async def test_cache_of_24h_is_read_before_any_call(monkeypatch: pytest.MonkeyPatch) -> None:
    store: dict[tuple[str, str], tuple[object, int]] = {}

    async def get_json(ns: str, key: str):
        return store.get((ns, key), (None, 0))[0]

    async def set_json(ns: str, key: str, value: object, ttl: int | None = None):
        store[(ns, key)] = (value, ttl or 0)

    monkeypatch.setattr(provider_cache, "get_json", get_json)
    monkeypatch.setattr(provider_cache, "set_json", set_json)
    client = _client([_row("lectra.com", 179)])
    assert await mv.offer_volumes(["lectra.com"], client=client) == {"lectra.com": 179}
    assert store[("offer_volume", "lectra.com")][1] == 24 * 3600
    assert await mv.offer_volumes(["lectra.com"], client=client) == {"lectra.com": 179}
    assert client.post.call_count == 1  # la seconde lecture vient du cache commun


# ── Câblage dans Découvrir ──────────────────────────────────────────────────


def _wire_discover(monkeypatch: pytest.MonkeyPatch, volumes: AsyncMock, domains: dict[str, str]) -> None:
    for name in ("it_job_signals", "it_job_signals_ats", "adzuna_jobs"):
        monkeypatch.setattr(discover_router, name, AsyncMock(return_value=[]))
    for fn in ("public_tenders", "legal_signals", "press_signals", "funding_signals"):
        monkeypatch.setattr(discover_router, fn, AsyncMock(return_value=[]))
    monkeypatch.setattr(discover_router, "load_press_feeds", AsyncMock(return_value={}))
    monkeypatch.setattr(discover_router, "offer_volumes", volumes)
    monkeypatch.setattr(discover_router, "domain_of_card", AsyncMock(side_effect=lambda c: domains.get(c["siren"])))


async def _run(cards: list[dict]) -> None:
    tasks = discover_router._start_signal_tasks(cards, profile_data={})
    await discover_router._finish_signal_tasks(tasks, [], time.monotonic() + 10, profile_data={}, filters={})


async def test_discover_asks_the_preview_once_for_the_whole_page(monkeypatch: pytest.MonkeyPatch) -> None:
    volumes = AsyncMock(return_value={"lectra.com": 179, "seb.com": 133})
    _wire_discover(monkeypatch, volumes, {"630000001": "lectra.com", "630000002": "seb.com"})
    cards = [{"name": "Lectra", "siren": "630000001"}, {"name": "SEB", "siren": "630000002"}, {"name": "Sans site", "siren": "630000003"}]
    await _run(cards)
    assert volumes.await_count == 1
    assert sorted(volumes.await_args.args[0]) == ["lectra.com", "seb.com"]
    assert cards[0]["offersVolume"] == {"count": 179, "windowDays": 90, "country": "FR"}
    assert cards[1]["offersVolume"]["count"] == 133
    assert "offersVolume" not in cards[2]  # pas de domaine, pas de ligne — jamais « 0 »


async def test_no_answer_leaves_the_card_without_a_volume_line(monkeypatch: pytest.MonkeyPatch) -> None:
    _wire_discover(monkeypatch, AsyncMock(return_value={}), {"630000001": "lectra.com"})
    cards = [{"name": "Lectra", "siren": "630000001"}]
    await _run(cards)
    assert "offersVolume" not in cards[0]
    assert cards[0]["signalsSearched"] is True


async def test_a_failing_preview_never_breaks_the_page(monkeypatch: pytest.MonkeyPatch) -> None:
    _wire_discover(monkeypatch, AsyncMock(side_effect=RuntimeError("boom")), {"630000001": "lectra.com"})
    cards = [{"name": "Lectra", "siren": "630000001"}]
    await _run(cards)
    assert "offersVolume" not in cards[0] and cards[0]["signalsSearched"] is True


async def test_company_domain_is_remembered_by_siren_and_read_by_discover(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import company_domains

    store: dict[tuple[str, str], object] = {}

    async def get_json(ns: str, key: str):
        return store.get((ns, key))

    async def set_json(ns: str, key: str, value: object, ttl: int | None = None):
        store[(ns, key)] = value

    monkeypatch.setattr(provider_cache, "get_json", get_json)
    monkeypatch.setattr(provider_cache, "set_json", set_json)
    await company_domains.remember("630 000 009", "https://www.shop.exemple.fr/x")
    assert await discover_router.domain_of_card({"siren": "630000009"}) == "exemple.fr"
    assert await discover_router.domain_of_card({"siren": "630000009", "website": "https://autre.com"}) == "autre.com"
    assert await discover_router.domain_of_card({"siren": "630000010"}) is None  # jamais deviné
    await company_domains.remember("pas-un-siren", "exemple.fr")
    await company_domains.remember("630000011", "")
    assert all(k[1].startswith("siren:630000009") for k in store)


def test_the_analysis_hands_the_account_site_to_discover() -> None:
    import inspect

    from app.routers import phase1_research

    assert "company_domains.remember(_anchor_siren, req.website)" in inspect.getsource(phase1_research)
