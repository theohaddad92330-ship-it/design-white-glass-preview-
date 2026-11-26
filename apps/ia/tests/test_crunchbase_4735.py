"""#4735 — Crunchbase : tours de table datés, montant tel que publié, jamais déduit.

Contrat lu sur la documentation officielle (data.crunchbase.com, 28/10/2026) :
``POST /v4/data/searches/funding_rounds``, en-tête ``X-cb-user-key``, réponse ``{count, entities[]}``.
Sans clé : zéro appel réseau. Un cache single-flight : un seul appel en vol par requête.
"""

from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from app.services import cost_ledger
from app.services.data_sources import crunchbase as cb

PAYLOAD = {
    "count": 2,
    "entities": [
        {
            "uuid": "r1",
            "properties": {
                "announced_on": "2025-12-18",
                "money_raised": {"currency": "USD", "value": 330000000, "value_usd": 330000000},
                "investment_stage": "early_stage_venture",
                "funded_organization_identifier": {"permalink": "acme-803a", "value": "Acme"},
            },
        },
        {"uuid": "r2", "properties": {"announced_on": None, "money_raised": None}},
        {
            "uuid": "r3",
            "properties": {
                "announced_on": "2026-03-02",
                "funded_organization_identifier": {"permalink": "acme-803a", "value": "Acme"},
            },
        },
    ],
}


def _client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


@pytest.fixture(autouse=True)
def _isolate(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CRUNCHBASE_API_KEY", raising=False)
    monkeypatch.delenv("PROVIDER_UNIT_COST_CRUNCHBASE", raising=False)
    monkeypatch.setenv("SOURCE_CACHE_DISABLED", "1")


async def test_without_a_key_nothing_leaves_the_machine() -> None:
    def boom(request: httpx.Request) -> httpx.Response:
        raise AssertionError("aucun appel réseau sans clé")

    assert await cb.funding_rounds("acme-803a", client=_client(boom)) == []
    assert cb.is_configured() is False


async def test_a_round_carries_its_date_its_published_amount_and_its_link(monkeypatch) -> None:
    monkeypatch.setenv("CRUNCHBASE_API_KEY", "cle-de-test")
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["key"] = request.headers.get("X-cb-user-key")
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json=PAYLOAD)

    rounds = await cb.funding_rounds("acme-803a", client=_client(handler))
    assert seen["url"] == "https://api.crunchbase.com/v4/data/searches/funding_rounds"
    assert seen["key"] == "cle-de-test"
    predicate = seen["body"]["query"][0]
    assert predicate["field_id"] == "funded_organization_identifier"
    assert predicate["values"] == ["acme-803a"]
    # une ligne sans date n'est pas gardée ; la plus récente d'abord
    assert [r["date"] for r in rounds] == ["2026-03-02", "2025-12-18"]
    published = rounds[1]
    assert published["type"] == "funding"
    assert published["amount_label"] == "330 M USD"
    assert published["stage"] == "early_stage_venture"
    assert published["url"] == "https://www.crunchbase.com/organization/acme-803a"
    # un montant absent n'est JAMAIS « 0 »
    assert rounds[0]["amount_label"] is None


async def test_the_source_is_never_named_in_the_signal(monkeypatch) -> None:
    monkeypatch.setenv("CRUNCHBASE_API_KEY", "cle-de-test")
    rounds = await cb.funding_rounds("acme-803a", client=_client(lambda r: httpx.Response(200, json=PAYLOAD)))
    for row in rounds:
        assert "crunchbase" not in (row["label"] + row["detail"]).lower()


@pytest.mark.parametrize("bad", ["", "Acme SAS", "../etc", "a" * 200])
async def test_a_permalink_that_is_not_one_is_never_sent(monkeypatch, bad: str) -> None:
    monkeypatch.setenv("CRUNCHBASE_API_KEY", "cle-de-test")

    def boom(request: httpx.Request) -> httpx.Response:
        raise AssertionError("pas d'appel pour un identifiant deviné")

    assert await cb.funding_rounds(bad, client=_client(boom)) == []


async def test_a_failure_is_an_empty_answer_and_never_a_made_up_round(monkeypatch) -> None:
    monkeypatch.setenv("CRUNCHBASE_API_KEY", "cle-de-test")
    for response in (httpx.Response(403, json={}), httpx.Response(200, json={"oops": 1})):
        assert await cb.funding_rounds("acme-803a", client=_client(lambda r, resp=response: resp)) == []


async def test_each_paid_call_is_in_the_ledger_and_never_priced_by_guess(monkeypatch) -> None:
    monkeypatch.setenv("CRUNCHBASE_API_KEY", "cle-de-test")
    with cost_ledger.bind_run("run-1"):
        await cb.funding_rounds("acme-803a", client=_client(lambda r: httpx.Response(200, json=PAYLOAD)))
        rows = cost_ledger.snapshot()
    assert [(r["provider"], r["operation"], r["calls"]) for r in rows] == [("crunchbase", "funding_rounds_search", 1)]
    assert rows[0]["cost_usd"] is None  # prix inconnu ≠ gratuit


async def test_five_identical_concurrent_requests_pay_once(monkeypatch) -> None:
    monkeypatch.delenv("SOURCE_CACHE_DISABLED", raising=False)
    monkeypatch.setenv("CRUNCHBASE_API_KEY", "cle-de-test")
    calls = 0

    async def slow(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.05)
        return httpx.Response(200, json=PAYLOAD)

    client = _client(slow)
    with cost_ledger.bind_run("run-2"):
        results = await asyncio.gather(*[cb.funding_rounds("acme-803a", client=client) for _ in range(5)])
        rows = cost_ledger.snapshot()
    assert calls == 1
    assert rows[0]["calls"] == 1
    assert all(len(r) == 2 for r in results)
