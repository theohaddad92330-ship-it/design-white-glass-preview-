"""Lot 762 (Louis 31/10 « pas de limite ») — la collecte GRATUITE ne jette plus une donnée à cause de son âge.

Chaque test dit NON si la borne revient : une annonce ancienne est STOCKÉE estampillée ``historical``."""

from __future__ import annotations

import inspect
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services.data_sources import bodacc, ted
from tests.test_ted_tenders_4116 import _client, _payload, _resp


@pytest.mark.asyncio
async def test_ted_notice_of_five_years_is_kept_and_stamped_historical() -> None:
    data = _payload()
    old = (datetime.now(UTC) - timedelta(days=1800)).strftime("%Y-%m-%d+01:00")
    for n in data["notices"]:
        if n["publication-number"] == "655703-2024":
            n["publication-date"] = old
    out = await ted.ted_tenders("Ville de Paris", client=_client(_resp(data)))
    by_url = {i["url"]: i for i in out}
    aged = by_url["https://ted.europa.eu/fr/notice/-/detail/655703-2024"]
    assert aged.get("historical") is True
    assert not by_url["https://ted.europa.eu/fr/notice/-/detail/647934-2024"].get("historical")


def test_ted_query_carries_no_date_bound_by_default() -> None:
    query = ted.build_query("Ville de Paris")
    assert query is not None and "publication-date" not in query
    assert "publication-date>=" in (ted.build_query("Ville de Paris", since_days=30) or "")


def test_bodacc_default_limit_is_the_api_maximum_not_eight() -> None:
    assert inspect.signature(bodacc.legal_signals).parameters["limit"].default == 20


@pytest.mark.asyncio
async def test_bodacc_asks_for_twenty_rows() -> None:
    c = AsyncMock(spec=httpx.AsyncClient)
    c.get = AsyncMock(return_value=httpx.Response(200, json={"records": []}, request=httpx.Request("GET", "https://x")))
    await bodacc._legal_signals_uncached("552032534", limit=20, client=c)
    assert c.get.call_args.kwargs["params"]["rows"] == "20"
