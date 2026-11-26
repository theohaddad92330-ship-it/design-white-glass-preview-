"""GROUPE-FRANCE (16/10) — « un groupe = plusieurs sociétés », mais en France seulement.

Réponses GRATUITES réelles du 16/10 (analyse DECATHLON FRANCE : 114 offres payées, 1 gardée) :
``decathlon.com`` → Brasil, Greece ; ``DECATHLON FRANCE`` → cinq fiches « Decathlon France » ;
``Decathlon`` → Logistique, Fitness Lab, United (siège), Digital, Decathlon.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services.data_sources import job_aggregators as agg

_NOW = datetime.now(UTC)
_SEARCH = {
    "decathlon.com": [{"id": "br", "name": "Decathlon Brasil"}, {"id": "gr", "name": "Decathlon Greece"}],
    "DECATHLON FRANCE": [{"id": f"fr{i}", "name": "Decathlon France"} for i in range(5)],
    "DECATHLON": [
        {"id": "log", "name": "Decathlon Logistique France"},
        {"id": "fit", "name": "Decathlon Fitness Lab - Marcq-en-Barœul"},
        {"id": "uni", "name": "Decathlon United - Villeneuve-d'Ascq"},
        {"id": "dig", "name": "Decathlon Digital"},
        {"id": "dec", "name": "Decathlon"},
    ],
}


def _resp(data: object) -> httpx.Response:
    return httpx.Response(200, json=data, request=httpx.Request("GET", "https://x"))


def _client(search: dict) -> AsyncMock:
    async def get(_url: str, params: dict, headers: dict) -> httpx.Response:
        return _resp(search.get(params["query"], []))

    async def post(url: str, json: dict, headers: dict) -> httpx.Response:
        ident = url.split("/companies/")[1].split("/")[0]
        job = {
            "job_title": f"Data engineer {ident}",
            "job_url": f"https://j/{ident}",
            "published_date": (_NOW - timedelta(days=3)).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "location": {"city": "Lille"},
        }
        return _resp({"jobs": [job]})

    c = AsyncMock(spec=httpx.AsyncClient)
    c.get = AsyncMock(side_effect=get)
    c.post = AsyncMock(side_effect=post)
    return c


@pytest.fixture(autouse=True)
def _env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MANTIKS_API_KEY", "k")
    monkeypatch.delenv("MANTIKS_MAX_ENTITIES", raising=False)
    monkeypatch.setattr(agg.mantiks_balance, "check_balance", AsyncMock())


def _bought(client: AsyncMock) -> list[str]:
    return [c.args[0].split("/companies/")[1].split("/")[0] for c in client.post.call_args_list]


async def test_decathlon_group_buys_digital_united_logistique_and_france_never_foreign() -> None:
    client = _client(_SEARCH)
    offers = await agg.mantiks_jobs("DECATHLON FRANCE", domain="decathlon.com", client=client)
    bought = _bought(client)
    assert {"dig", "uni", "log"} <= set(bought) and any(b.startswith("fr") for b in bought)
    assert not {"br", "gr", "fit"} & set(bought)
    assert len(bought) == len(set(bought)) <= 5
    assert len(offers) == len(bought)


async def test_exact_name_first_and_distinct_names_before_duplicates() -> None:
    client = _client(_SEARCH)
    await agg.mantiks_jobs("DECATHLON FRANCE", client=client)
    bought = _bought(client)
    assert bought[0] in {"dec", "fr0"} and bought.count("fr0") + bought.count("fr1") <= 1


async def test_cap_is_the_single_env_setting(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MANTIKS_MAX_ENTITIES", "2")
    client = _client(_SEARCH)
    await agg.mantiks_jobs("DECATHLON FRANCE", client=client)
    assert len(_bought(client)) == 2


async def test_homonym_outside_the_group_is_never_bought() -> None:
    search = {"DECATHLON": [{"id": "pl", "name": "Decathlon Plomberie"}, {"id": "x", "name": "Autre Société"}]}
    client = _client(search)
    assert await agg.mantiks_jobs("Decathlon", client=client) == []
    client.post.assert_not_awaited()


async def test_country_field_outside_france_is_dropped() -> None:
    search = {"Decathlon": [{"id": "z", "name": "Decathlon Digital", "country": "Brazil"}, {"id": "y", "name": "Decathlon"}]}
    client = _client(search)
    await agg.mantiks_jobs("Decathlon", client=client)
    assert _bought(client) == ["y"]


async def test_adzuna_retries_with_brand_when_legal_name_returns_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ADZUNA_APP_ID", "i")
    monkeypatch.setenv("ADZUNA_APP_KEY", "k")
    hit = {
        "title": "Dev",
        "company": {"display_name": "Decathlon Digital"},
        "location": {"display_name": "Lille"},
        "created": (_NOW - timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "redirect_url": "https://a/1",
    }

    async def get(_url: str, params: dict) -> httpx.Response:
        return _resp({"results": [hit] if params["what"] == "DECATHLON" else []})

    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(side_effect=get)
    offers = await agg.adzuna_jobs("DECATHLON FRANCE SAS", client=client)
    assert [o["title"] for o in offers] == ["Dev"]
    assert [c.kwargs["params"]["what"] for c in client.get.call_args_list] == ["DECATHLON FRANCE SAS", "DECATHLON"]


async def test_fantastic_also_queries_the_group_entities_known_by_siren(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services.data_sources.employer_match import EmployerScope

    monkeypatch.setenv("FANTASTIC_JOBS_API_KEY", "k")
    scope = EmployerScope.build("DECATHLON FRANCE", siren="306138900", siren_names=["Decathlon Digital"])
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(return_value=_resp([]))
    await agg.fantastic_jobs("DECATHLON FRANCE", scope=scope, client=client)
    asked = [c.kwargs["params"].get("organization") for c in client.get.call_args_list]
    assert "Decathlon Digital" in asked
