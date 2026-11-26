"""LOT (15/10) DATA-A point 5 — la recherche de personnes Apollo : cache commun 30 j (clé =
organisation + titres + séniorités), exclusions de titres, statut d'e-mail, domaine avant le nom."""

from __future__ import annotations

import fakeredis.aioredis
import httpx
import pytest
from unittest.mock import AsyncMock

from app.services import apollo
from app.services.apollo import ApolloSearchStatus


async def _wrap(client):
    return client


@pytest.fixture
def redis(monkeypatch: pytest.MonkeyPatch):
    fake = fakeredis.aioredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(apollo, "_enrich_cache_redis", lambda: _wrap(fake))
    monkeypatch.setenv("APOLLO_API_KEY", "k")
    monkeypatch.delenv("APOLLO_SEARCH_NOT_TITLES", raising=False)
    monkeypatch.delenv("APOLLO_SEARCH_EMAIL_STATUS", raising=False)
    return fake


def _person(pid: str = "p1") -> dict:
    return {"id": pid, "first_name": "Jean", "last_name": "Dupont", "title": "DSI", "organization_name": "Acme"}


def _client(people: list[dict]) -> AsyncMock:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.post = AsyncMock(
        return_value=httpx.Response(
            200, json={"people": people, "total_entries": len(people)}, request=httpx.Request("POST", "https://x")
        )
    )
    return client


async def test_same_search_is_paid_once_whatever_the_title_order(redis) -> None:
    client = _client([_person()])
    first = await apollo.search_people_with_status("Acme", ["DSI", "CTO"], http_client=client, organization_domains=["acme.fr"])
    paid = client.post.await_count  # ≤ 5 contacts : le repli par le nom part aussi, une seule fois
    second = await apollo.search_people_with_status("ACME ", ["cto", "dsi"], http_client=client, organization_domains=["acme.fr"])
    assert client.post.await_count == paid
    assert first[1] == ApolloSearchStatus.OK and second[1] == ApolloSearchStatus.OK
    assert [c.full_name if hasattr(c, "full_name") else c for c in second[0]] == [
        c.full_name if hasattr(c, "full_name") else c for c in first[0]
    ]


async def test_other_seniorities_or_organisation_are_other_searches(redis) -> None:
    client = _client([_person()])
    await apollo.search_people_with_status("Acme", ["DSI"], http_client=client, seniorities=["vp"])
    await apollo.search_people_with_status("Acme", ["DSI"], http_client=client, seniorities=["director"])
    await apollo.search_people_with_status("Autre", ["DSI"], http_client=client, seniorities=["vp"])
    assert client.post.await_count == 3


async def test_an_empty_search_is_never_cached(redis) -> None:
    client = _client([])
    await apollo.search_people_with_status("Acme", ["DSI"], http_client=client)
    await apollo.search_people_with_status("Acme", ["DSI"], http_client=client)
    assert client.post.await_count == 2


async def test_cache_lives_in_redis_under_the_purgeable_prefix(redis) -> None:
    await apollo.search_people_with_status("Acme", ["DSI"], http_client=_client([_person()]))
    keys = [k async for k in redis.scan_iter("*")]
    assert keys and all(k.startswith("apollo:search:") for k in keys)
    assert 0 < await redis.ttl(keys[0]) <= 30 * 24 * 3600


async def test_titles_to_exclude_and_domain_before_name(redis) -> None:
    client = _client([_person()])
    await apollo.search_people_with_status(
        "Acme", ["DSI"], http_client=client, organization_domains=["acme.fr"], max_pages=1
    )
    payload = client.post.await_args_list[0].kwargs["json"]
    assert payload["person_not_titles"] == ["stage", "alternance", "assistant"]
    assert payload["q_organization_domains_list"] == ["acme.fr"]
    assert "q_organization_name" not in payload
    assert "contact_email_status" not in payload


async def test_not_titles_and_email_status_are_switchable(redis, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APOLLO_SEARCH_NOT_TITLES", "off")
    monkeypatch.setenv("APOLLO_SEARCH_EMAIL_STATUS", "verified, likely to engage")
    client = _client([_person()])
    await apollo.search_people_with_status("Acme", ["DSI"], http_client=client, max_pages=1)
    payload = client.post.await_args_list[0].kwargs["json"]
    assert "person_not_titles" not in payload
    assert payload["contact_email_status"] == ["verified", "likely to engage"]
