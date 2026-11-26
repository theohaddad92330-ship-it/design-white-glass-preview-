"""F2 — Crunchbase : la voie de résolution DOMAINE → ``permalink``, jamais le nom.

Contrat lu (data.crunchbase.com, 29/10/2026) : ``POST /v4/data/searches/organizations`` accepte le prédicat
``website_url`` avec les opérateurs ``domain_eq`` / ``domain_includes`` (« Available Field Types & Operators »).
Un NOM seul ne résout rien ; deux organisations sur un même domaine ne résolvent rien non plus.
"""

from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from app.services import cost_ledger
from app.services.data_sources import crunchbase as cb

ORG_URL = "https://api.crunchbase.com/v4/data/searches/organizations"
ROUNDS_URL = "https://api.crunchbase.com/v4/data/searches/funding_rounds"

ROUNDS = {
    "count": 1,
    "entities": [
        {
            "uuid": "r1",
            "properties": {
                "announced_on": "2025-12-18",
                "money_raised": {"currency": "EUR", "value": 12000000},
                "investment_stage": "series_a",
            },
        }
    ],
}


def _org(permalink: str = "acme-803a", website: str = "https://www.acme.fr/") -> dict:
    return {
        "uuid": "o-" + permalink,
        "properties": {"identifier": {"permalink": permalink, "value": "Acme"}, "website_url": website},
    }


def _client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def _router(orgs: list[dict], seen: list[tuple[str, dict]] | None = None):
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        if seen is not None:
            seen.append((str(request.url), body))
        if str(request.url) == ORG_URL:
            return httpx.Response(200, json={"count": len(orgs), "entities": orgs})
        assert str(request.url) == ROUNDS_URL
        return httpx.Response(200, json=ROUNDS)

    return handler


@pytest.fixture(autouse=True)
def _isolate(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CRUNCHBASE_API_KEY", raising=False)
    monkeypatch.delenv("PROVIDER_UNIT_COST_CRUNCHBASE", raising=False)
    monkeypatch.setenv("SOURCE_CACHE_DISABLED", "1")


async def test_without_a_key_and_without_a_directory_nothing_leaves_the_machine() -> None:
    def boom(request: httpx.Request) -> httpx.Response:
        raise AssertionError("aucun appel réseau sans clé")

    client = _client(boom)
    assert await cb.resolve_permalink("acme.fr", client=client) is None
    assert await cb.funding_rounds_for_domain("acme.fr", client=client) == []


async def test_one_organization_on_the_exact_domain_resolves_and_its_rounds_follow(monkeypatch) -> None:
    monkeypatch.setenv("CRUNCHBASE_API_KEY", "cle-de-test")
    seen: list[tuple[str, dict]] = []
    rounds = await cb.funding_rounds_for_domain("https://www.Acme.fr/contact", client=_client(_router([_org()], seen)))
    (org_url, org_body), (rounds_url, rounds_body) = seen
    assert org_url == ORG_URL
    predicate = org_body["query"][0]
    assert (predicate["field_id"], predicate["operator_id"], predicate["values"]) == (
        "website_url",
        "domain_eq",
        ["acme.fr"],
    )
    assert rounds_url == ROUNDS_URL
    assert rounds_body["query"][0]["values"] == ["acme-803a"]
    assert [r["date"] for r in rounds] == ["2025-12-18"]
    assert rounds[0]["amount_label"] == "12 M EUR"  # devise publiée, jamais convertie
    assert rounds[0]["url"].endswith("/organization/acme-803a")


@pytest.mark.parametrize("name", ["Acme", "Acme SAS", "", "acme", "..", "a b.fr"])
async def test_a_name_alone_never_resolves_anything(monkeypatch, name: str) -> None:
    monkeypatch.setenv("CRUNCHBASE_API_KEY", "cle-de-test")

    def boom(request: httpx.Request) -> httpx.Response:
        raise AssertionError("un nom n'est jamais envoyé à la source")

    client = _client(boom)
    assert await cb.resolve_permalink(name, client=client) is None
    assert await cb.funding_rounds_for_domain(name, client=client) == []


async def test_two_organizations_on_one_domain_resolve_nothing(monkeypatch) -> None:
    monkeypatch.setenv("CRUNCHBASE_API_KEY", "cle-de-test")
    seen: list[tuple[str, dict]] = []
    orgs = [_org("acme-803a"), _org("acme-group-1b2c")]
    assert await cb.funding_rounds_for_domain("acme.fr", client=_client(_router(orgs, seen))) == []
    assert [u for u, _ in seen] == [ORG_URL]  # jamais de recherche de tours sur un rapprochement ambigu


async def test_an_answer_whose_site_is_another_domain_is_not_trusted(monkeypatch) -> None:
    monkeypatch.setenv("CRUNCHBASE_API_KEY", "cle-de-test")
    seen: list[tuple[str, dict]] = []
    other = [_org("autre-1", website="https://autre.com")]
    assert await cb.resolve_permalink("acme.fr", client=_client(_router(other, seen))) is None
    assert [u for u, _ in seen] == [ORG_URL]


async def test_no_organization_and_a_failure_both_resolve_nothing(monkeypatch) -> None:
    monkeypatch.setenv("CRUNCHBASE_API_KEY", "cle-de-test")
    assert await cb.resolve_permalink("acme.fr", client=_client(_router([]))) is None
    for response in (httpx.Response(403, json={}), httpx.Response(200, json={"oops": 1})):
        assert await cb.resolve_permalink("acme.fr", client=_client(lambda r, resp=response: resp)) is None


async def test_both_paid_calls_are_in_the_ledger_and_never_priced_by_guess(monkeypatch) -> None:
    monkeypatch.setenv("CRUNCHBASE_API_KEY", "cle-de-test")
    with cost_ledger.bind_run("run-f2"):
        await cb.funding_rounds_for_domain("acme.fr", client=_client(_router([_org()])))
        rows = cost_ledger.snapshot()
    assert sorted((r["provider"], r["operation"], r["calls"]) for r in rows) == [
        ("crunchbase", "funding_rounds_search", 1),
        ("crunchbase", "organizations_search", 1),
    ]
    assert all(r["cost_usd"] is None for r in rows)


async def test_five_concurrent_requests_on_one_domain_pay_each_source_once(monkeypatch) -> None:
    monkeypatch.delenv("SOURCE_CACHE_DISABLED", raising=False)
    monkeypatch.setenv("CRUNCHBASE_API_KEY", "cle-de-test")
    calls: list[str] = []

    async def slow(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        await asyncio.sleep(0.05)
        return _router([_org()])(request)

    client = _client(slow)
    with cost_ledger.bind_run("run-f2b"):
        results = await asyncio.gather(*[cb.funding_rounds_for_domain("acme.fr", client=client) for _ in range(5)])
        rows = cost_ledger.snapshot()
    assert sorted(calls) == sorted([ORG_URL, ROUNDS_URL])  # UN appel par source, pas cinq
    assert sorted(r["calls"] for r in rows) == [1, 1]
    assert all(len(r) == 1 for r in results)
