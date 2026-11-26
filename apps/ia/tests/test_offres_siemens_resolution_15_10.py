"""#4182 — SIEMENS SAS : les sources payées ne rendaient rien parce qu'on interrogeait la raison sociale.

« SIEMENS SAS » n'est pas le nom sous lequel Siemens publie ses offres : la marque est « Siemens ».
Chaque test sait dire NON (une raison sociale sans forme juridique ne change rien).
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


def _resp(json_data: object) -> httpx.Response:
    return httpx.Response(200, json=json_data, request=httpx.Request("GET", "https://x"))


@pytest.fixture(autouse=True)
def _keys(monkeypatch: pytest.MonkeyPatch) -> None:
    for k in ("ADZUNA_APP_ID", "ADZUNA_APP_KEY", "JOOBLE_API_KEY"):
        monkeypatch.delenv(k, raising=False)
    for k in ("FANTASTIC_JOBS_API_KEY", "MANTIKS_API_KEY", "THEIRSTACK_API_KEY"):
        monkeypatch.setenv(k, "k")


def test_name_forms_brand_first_without_legal_form() -> None:
    assert agg._name_forms("SIEMENS SAS")[:2] == ["SIEMENS", "Siemens"]
    assert "SIEMENS SAS" in agg._name_forms("SIEMENS SAS")
    assert agg._name_forms("decathlon") == ["decathlon", "Decathlon"]


async def test_fantastic_searches_the_brand_not_only_the_legal_name() -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    hit = {"title": "Ingénieur", "organization": "Siemens", "date_posted": _iso(3), "url": "https://x/1"}
    client.get = AsyncMock(side_effect=[_resp([]), _resp([hit])])
    offers = await agg.fantastic_jobs("SIEMENS SAS", client=client)
    orgs = [c.kwargs["params"]["organization"] for c in client.get.call_args_list]
    assert orgs == ["SIEMENS", "Siemens"]
    assert len(offers) == 1


async def test_mantiks_searches_the_brand_when_the_legal_name_finds_nothing() -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(side_effect=[_resp([]), _resp([{"id": 7, "name": "Siemens"}])])
    job = {"job_title": "Ingénieur", "published_date": _iso(4), "job_url": "https://x/2", "location": {}}
    client.post = AsyncMock(return_value=_resp({"jobs": [job]}))
    offers = await agg.mantiks_jobs("SIEMENS SAS", client=client)
    queries = [c.kwargs["params"]["query"] for c in client.get.call_args_list if "params" in c.kwargs]
    assert queries[0] == "SIEMENS" and "SIEMENS SAS" in queries
    assert len(offers) == 1


async def test_theirstack_names_carry_the_brand() -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    hit = {"job_title": "Ingénieur", "company": "Siemens", "date_posted": _iso(2), "url": "https://x/3"}
    client.post = AsyncMock(return_value=_resp({"data": [hit]}))
    await agg.theirstack_jobs("SIEMENS SAS", client=client)
    names = client.post.call_args.kwargs["json"]["company_name_or"]
    assert "Siemens" in names and "SIEMENS SAS" in names


async def test_plain_name_is_unchanged() -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.post = AsyncMock(return_value=_resp({"data": []}))
    await agg.theirstack_jobs("Decathlon", client=client)
    assert client.post.call_args_list[0].kwargs["json"]["company_name_or"] == ["Decathlon"]


async def test_per_source_returned_and_kept_are_logged(caplog: pytest.LogCaptureFixture) -> None:
    import logging

    client = AsyncMock(spec=httpx.AsyncClient)
    rows = [
        {"title": "Analyste SOC", "organization": "Siemens", "date_posted": _iso(3), "url": "https://x/a"},
        {"title": "Bid Manager", "organization": "Siemens", "date_posted": _iso(4), "url": "https://x/b"},
    ]
    client.get = AsyncMock(return_value=_resp(rows))
    client.post = AsyncMock(return_value=_resp({"data": []}))
    with caplog.at_level(logging.INFO, logger=agg.logger.name):
        await agg.it_job_signals_aggregators(
            "SIEMENS SAS", keep_title=lambda t: "SOC" in t, client=client
        )
    assert any("jobs_source_kept source=fantastic_jobs returned=2 kept=1" in r.getMessage() for r in caplog.records)
