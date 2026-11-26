"""SIG-D (11/10) — paramètres de source relus sur la doc et enfin envoyés.

Chaque test tient un paramètre CONFIRMÉ par la documentation officielle du
fournisseur (relue le 11/10/2026) ; un paramètre non confirmé n'est pas testé
ici parce qu'il n'est pas envoyé (voir « Reste » du commentaire #4016).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services.data_sources import job_aggregators as agg

_NOW = datetime.now(UTC)


def _iso(days_ago: int) -> str:
    return (_NOW - timedelta(days=days_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")


def _resp(json_data: object, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json=json_data, request=httpx.Request("POST", "https://x"))


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for k in ("JOOBLE_API_KEY", "JOOBLE_HOST", "FANTASTIC_JOBS_API_KEY", "BRAVE_EXTRA_SNIPPETS"):
        monkeypatch.delenv(k, raising=False)


def _jooble_job(i: int, employer: str = "DECATHLON") -> dict:
    return {"title": f"Dev {i}", "location": "Lille", "company": employer, "updated": _iso(2), "link": f"https://j/{i}"}


# ── D1 — Jooble ──────────────────────────────────────────────────────────────


async def test_jooble_default_host_and_company_search(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JOOBLE_API_KEY", "k")
    client = AsyncMock(spec=httpx.AsyncClient)
    client.post = AsyncMock(return_value=_resp({"jobs": [_jooble_job(1)]}))
    await agg.jooble_jobs("DECATHLON", client=client)
    url = client.post.call_args.args[0]
    body = client.post.call_args.kwargs["json"]
    assert url == "https://jooble.org/api/k"  # byte-identique sans JOOBLE_HOST
    assert body["companysearch"] is True  # doc : « true searches company names »


async def test_jooble_host_is_configurable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JOOBLE_API_KEY", "k")
    monkeypatch.setenv("JOOBLE_HOST", "https://fr.jooble.org/")
    client = AsyncMock(spec=httpx.AsyncClient)
    client.post = AsyncMock(return_value=_resp({"jobs": []}))
    await agg.jooble_jobs("DECATHLON", client=client)
    assert client.post.call_args.args[0] == "https://fr.jooble.org/api/k"


async def test_jooble_rejects_a_malformed_host(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JOOBLE_API_KEY", "k")
    monkeypatch.setenv("JOOBLE_HOST", "evil.example/x?y=")
    client = AsyncMock(spec=httpx.AsyncClient)
    client.post = AsyncMock(return_value=_resp({"jobs": []}))
    await agg.jooble_jobs("DECATHLON", client=client)
    assert client.post.call_args.args[0] == "https://jooble.org/api/k"


async def test_jooble_reads_page_two_only_when_page_one_is_full(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JOOBLE_API_KEY", "k")
    full = {"jobs": [_jooble_job(i, "Intersport") for i in range(agg._JOOBLE_PER_PAGE)]}
    client = AsyncMock(spec=httpx.AsyncClient)
    client.post = AsyncMock(side_effect=[_resp(full), _resp({"jobs": [_jooble_job(99)]})])
    offers = await agg.jooble_jobs("DECATHLON", client=client)
    assert [c.kwargs["json"]["page"] for c in client.post.call_args_list] == [1, 2]
    assert [o["title"] for o in offers] == ["Dev 99"]

    short = AsyncMock(spec=httpx.AsyncClient)
    short.post = AsyncMock(return_value=_resp({"jobs": [_jooble_job(1)]}))
    await agg.jooble_jobs("DECATHLON 2", client=short)
    assert short.post.call_count == 1  # le quota gratuit (500 à vie) ne se brûle pas
