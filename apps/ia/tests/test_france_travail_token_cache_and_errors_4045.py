"""#4045 (14/10, recette prod) — jeton France Travail mis en cache, et un échec
du jeton n'est JAMAIS rangé comme « ne recrute pas » dans le cache partagé.

Cause du « 125 servis par le cache partagé, 0 collectés » : ``it_job_signals``
est décoré par ``provider_cache.cached_by`` (qui ouvre SA PROPRE écoute
``watch_fetch_errors``) et appelé depuis ``public_facts.cached_fact`` (qui ouvre
la sienne). L'erreur n'était notée que dans l'écoute la plus INTERNE : l'écoute
externe voyait ``errors == []`` et rangeait le vide 24 h comme un fait."""

from __future__ import annotations

import httpx
import pytest

from app.services import provider_cache, public_facts, rate_limiter, source_cache, source_health
from app.services.data_sources import france_travail as ft


@pytest.fixture(autouse=True)
def _env(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_ID", "id")
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_SECRET", "secret")
    monkeypatch.setenv("FRANCE_TRAVAIL_RPS", "100")
    rate_limiter._reset_cache_for_tests()
    ft._reset_token_cache_for_tests()
    yield
    rate_limiter._reset_cache_for_tests()
    ft._reset_token_cache_for_tests()


class _TokenDown:
    def __init__(self) -> None:
        self.posts = 0

    async def post(self, url: str, **_kw: object) -> httpx.Response:
        self.posts += 1
        raise httpx.ConnectError("boom")

    async def get(self, url: str, **_kw: object) -> httpx.Response:  # pragma: no cover
        raise AssertionError("pas de recherche sans jeton")


class _Api:
    """Jeton OAuth + recherche. ``expires_in`` configurable ; la recherche peut
    répondre 401 une fois."""

    def __init__(self, *, expires_in: int | None = 1499, first_search_401: bool = False) -> None:
        self.posts = 0
        self.gets = 0
        self.expires_in = expires_in
        self.first_search_401 = first_search_401
        self.tokens_seen: list[str] = []

    async def post(self, url: str, **_kw: object) -> httpx.Response:
        self.posts += 1
        body: dict = {"access_token": f"tok{self.posts}"}
        if self.expires_in is not None:
            body["expires_in"] = self.expires_in
        return httpx.Response(200, request=httpx.Request("POST", url), json=body)

    async def get(self, url: str, **kw: object) -> httpx.Response:
        self.gets += 1
        self.tokens_seen.append(str(kw["headers"]["Authorization"]))  # type: ignore[index]
        req = httpx.Request("GET", url)
        if self.first_search_401 and self.gets == 1:
            return httpx.Response(401, request=req, json={})
        return httpx.Response(200, request=req, json={"resultats": []})


@pytest.mark.asyncio
async def test_token_is_fetched_once_across_calls() -> None:
    api = _Api()
    await ft.it_job_signals.__wrapped__("Acme", client=api)  # type: ignore[attr-defined]
    await ft.it_job_signals.__wrapped__("Beta", client=api)  # type: ignore[attr-defined]
    assert api.posts == 1
    assert api.gets >= 4


@pytest.mark.asyncio
async def test_token_expiry_is_honoured(monkeypatch: pytest.MonkeyPatch) -> None:
    clock = [1000.0]
    monkeypatch.setattr(ft, "_now", lambda: clock[0])
    api = _Api(expires_in=120)
    await ft._token(api, "id", "secret")
    clock[0] += 30
    await ft._token(api, "id", "secret")
    assert api.posts == 1
    clock[0] += 40  # 70 s > 120 − 60
    await ft._token(api, "id", "secret")
    assert api.posts == 2


@pytest.mark.asyncio
async def test_missing_expires_in_falls_back_to_1200s(monkeypatch: pytest.MonkeyPatch) -> None:
    clock = [0.0]
    monkeypatch.setattr(ft, "_now", lambda: clock[0])
    api = _Api(expires_in=None)
    await ft._token(api, "id", "secret")
    clock[0] = 1199
    await ft._token(api, "id", "secret")
    assert api.posts == 1
    clock[0] = 1201
    await ft._token(api, "id", "secret")
    assert api.posts == 2


@pytest.mark.asyncio
async def test_concurrent_callers_share_one_renewal() -> None:
    import asyncio

    api = _Api()
    toks = await asyncio.gather(*(ft._token(api, "id", "secret") for _ in range(8)))
    assert api.posts == 1
    assert len(set(toks)) == 1


@pytest.mark.asyncio
async def test_search_401_invalidates_token_and_retries_once() -> None:
    api = _Api(first_search_401=True)
    await ft._search_authed(api, {"motsCles": "x"}, "id", "secret")
    assert api.posts == 2
    assert api.tokens_seen == ["Bearer tok1", "Bearer tok2"]


@pytest.mark.asyncio
async def test_failed_token_is_not_cached_as_a_fact(monkeypatch: pytest.MonkeyPatch) -> None:
    """Chaîne réelle : cached_fact → cached_by → it_job_signals → _token KO.
    Rien n'est rangé ; l'appel suivant RE-collecte."""
    stored: list[tuple] = []

    async def _miss(namespace: str, key: str):
        return None

    async def _single_flight(namespace: str, key: str, fetch):
        return await fetch(), True

    async def _set(*a: object, **k: object) -> None:
        stored.append(a)

    async def _redis_up():
        return object()

    monkeypatch.setattr(provider_cache, "get_json", _miss)
    monkeypatch.setattr(provider_cache, "set_json", _set)
    monkeypatch.setattr(provider_cache, "_redis", _redis_up)
    monkeypatch.setattr(source_cache, "single_flight", _single_flight)

    api = _TokenDown()
    for _ in range(2):
        rows = await public_facts.cached_fact(
            "jobs", "siren:1", "ft:esn_it:it", lambda: ft.it_job_signals("Acme", client=api)
        )
        assert rows == []
    assert stored == []
    assert api.posts == 2  # re-collecté, pas servi du cache


def test_nested_watchers_propagate_errors_to_the_outer_one() -> None:
    with source_health.watch_fetch_errors() as outer:
        with source_health.watch_fetch_errors() as inner:
            source_health.note_fetch_error("429")
        assert inner == ["429"]
    assert outer == ["429"]


@pytest.mark.asyncio
async def test_interactive_budget_runs_a_single_m18_search_per_company() -> None:
    from app.services.rate_limiter import wait_deadline
    import time

    api = _Api()
    with wait_deadline(time.monotonic() + 5.0):
        await ft.it_job_signals.__wrapped__("Acme", client=api)  # type: ignore[attr-defined]
    assert api.gets == 1  # M18 seule : un créneau 1 req/s par entreprise, pas deux


@pytest.mark.asyncio
async def test_background_collection_keeps_both_searches() -> None:
    api = _Api()
    await ft.it_job_signals.__wrapped__("Acme", client=api)  # type: ignore[attr-defined]
    assert api.gets == 2
