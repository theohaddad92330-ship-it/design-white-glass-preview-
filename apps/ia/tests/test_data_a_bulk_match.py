"""LOT (15/10) DATA-A point 8 — Apollo `bulk_match` : 10 personnes par appel pour les contacts qui ont un
identifiant Apollo (le reste garde l'appel individuel), cache par personne conservé."""

from __future__ import annotations

from unittest.mock import AsyncMock

import fakeredis.aioredis
import httpx
import pytest

import app.services.contact_enrich as ce
from app.models.contacts import ApolloEnrichmentResult
from app.services import apollo


def _matched(email: str) -> ApolloEnrichmentResult:
    return ApolloEnrichmentResult(matched=True, email=email, email_status="verified")


async def _wrap(client):
    return client


def _client(matches_for) -> AsyncMock:
    """Un faux client httpx : répond à `people/bulk_match` avec une personne par `details[i]`."""
    client = AsyncMock(spec=httpx.AsyncClient)

    async def post(url, json=None, headers=None):
        matches = [matches_for(d["id"]) for d in json["details"]]
        return httpx.Response(200, json={"matches": matches}, request=httpx.Request("POST", url))

    client.post = AsyncMock(side_effect=post)
    return client


def _person(pid: str) -> dict:
    return {"id": pid, "first_name": "P", "last_name": pid, "email": f"{pid}@acme.fr", "email_status": "verified"}


@pytest.fixture(autouse=True)
def _env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APOLLO_API_KEY", "k")
    monkeypatch.setattr(apollo, "_enrich_cache_redis", lambda: _wrap(fakeredis.aioredis.FakeRedis(decode_responses=True)))


async def test_25_ids_make_3_calls_of_at_most_10(monkeypatch) -> None:
    client = _client(lambda i: _person(i))
    ids = [f"id{n}" for n in range(25)]
    out = await apollo.bulk_enrich_people(ids, http_client=client)
    assert client.post.await_count == 3
    assert [len(c.kwargs["json"]["details"]) for c in client.post.await_args_list] == [10, 10, 5]
    assert all(c.kwargs["json"]["details"][0].keys() == {"id"} for c in client.post.await_args_list)
    assert out["id7"].email == "id7@acme.fr" and len(out) == 25


async def test_a_null_match_is_absent_from_the_result(monkeypatch) -> None:
    client = _client(lambda i: None if i == "id1" else _person(i))
    out = await apollo.bulk_enrich_people(["id0", "id1"], http_client=client)
    assert set(out) == {"id0"}


async def test_a_person_already_cached_is_not_paid_again(monkeypatch) -> None:
    fake = fakeredis.aioredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(apollo, "_enrich_cache_redis", lambda: _wrap(fake))
    client = _client(lambda i: _person(i))
    await apollo.bulk_enrich_people(["a", "b"], http_client=client)
    client2 = _client(lambda i: _person(i))
    out = await apollo.bulk_enrich_people(["a", "b", "c"], http_client=client2)
    assert [d["id"] for d in client2.post.await_args_list[0].kwargs["json"]["details"]] == ["c"]
    assert set(out) == {"a", "b", "c"}


async def test_plan_block_raises_the_plan_error() -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.post = AsyncMock(
        return_value=httpx.Response(
            403, json={"error_code": "API_INACCESSIBLE"}, request=httpx.Request("POST", "https://x")
        )
    )
    with pytest.raises(apollo.ApolloPlanError):
        await apollo.bulk_enrich_people(["a"], http_client=client)


async def test_top_deciders_with_an_apollo_id_go_through_bulk_match(monkeypatch) -> None:
    bulk = AsyncMock(side_effect=lambda ids, **_: {i: _matched(f"{i}@x.fr") for i in ids})
    single = AsyncMock(return_value=_matched("solo@x.fr"))
    monkeypatch.setattr(ce, "bulk_enrich_people", bulk)
    monkeypatch.setattr(ce, "enrich_person", single)
    contacts = [{"fullName": f"P{i}", "priority": 1, "apolloId": f"id{i}"} for i in range(12)]
    contacts.append({"fullName": "Sans Id", "priority": 1})
    out = await ce.enrich_top_deciders(contacts, "Acme", limit=15)
    assert bulk.await_count == 1 and len(bulk.await_args.args[0]) == 12
    assert single.await_count == 1  # seul le contact sans identifiant garde l'appel individuel
    assert out[3]["email"] == "id3@x.fr" and out[12]["email"] == "solo@x.fr"
