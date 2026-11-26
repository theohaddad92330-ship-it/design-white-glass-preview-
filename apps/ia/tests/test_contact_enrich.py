"""Auto-enrich the top deciders with email (Apollo People-Match). Mocked Apollo."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

import app.services.contact_enrich as ce
from app.models.contacts import ApolloEnrichmentResult
from app.services.apollo import ApolloPlanError


def _result(
    email: str,
    phone: str = "",
    verified: bool = True,
    *,
    first_name: str | None = None,
    last_name: str | None = None,
    linkedin_url: str | None = None,
) -> ApolloEnrichmentResult:
    """A realistic People-Match result (real model, not a stub) so the tests
    exercise the actual matched/email_status/name contract the code reads."""
    return ApolloEnrichmentResult(
        matched=True,
        email=email or None,
        phone=phone or None,
        email_status="verified" if verified else "unverified",
        first_name=first_name,
        last_name=last_name,
        linkedin_url=linkedin_url,
    )


@pytest.mark.asyncio
async def test_enriches_only_top_deciders_missing_email(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    async def fake_enrich(*, linkedin_url=None, first_name=None, last_name=None, organization_name=None, **_):
        calls.append(f"{first_name} {last_name}")
        return _result(f"{(first_name or '').lower()}@x.fr", phone="+33100000000")

    monkeypatch.setattr(ce, "enrich_person", AsyncMock(side_effect=fake_enrich))

    contacts = [
        {"fullName": "Alice DSI", "priority": 1, "influenceLevel": "decision-maker"},
        {"fullName": "Bob Dev", "priority": 4},  # not a decider — skipped
        {"fullName": "Carol CTO", "influenceLevel": "decision-maker", "email": "already@x.fr"},  # has email — skipped
        {"fullName": "Dan RSSI", "priority": 2},  # decider — enriched
    ]
    out = await ce.enrich_top_deciders(contacts, "Doctolib")

    assert out[0]["email"] == "alice@x.fr" and out[0]["phone"] == "+33100000000"
    assert out[0]["emailVerified"] is True
    assert "email" not in out[1]  # non-decider untouched
    assert out[2]["email"] == "already@x.fr"  # already had one, not re-fetched
    assert out[3]["email"] == "dan@x.fr"
    assert set(calls) == {"Alice DSI", "Dan RSSI"}


@pytest.mark.asyncio
async def test_respects_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ce, "enrich_person", AsyncMock(return_value=_result("x@y.fr")))
    contacts = [{"fullName": f"P{i}", "priority": 1} for i in range(10)]
    await ce.enrich_top_deciders(contacts, "X", limit=3)
    assert sum(1 for c in contacts if c.get("email")) == 3


@pytest.mark.asyncio
async def test_default_limit_is_fifteen_and_env_tunable(monkeypatch: pytest.MonkeyPatch) -> None:
    # The auto-reveal budget is the Apollo cost lever: 15 by default (the rest
    # revealed on demand), env-configurable (CONTACTS_ENRICH_TOP_N) so a big
    # account can turn it up or down without a code change. It was 5 — too thin
    # once the search stopped discarding Apollo's hits: a dossier could detect
    # 1379 contacts and ship 5 addresses.
    assert ce.DEFAULT_ENRICH_LIMIT == 15
    monkeypatch.setattr(ce, "enrich_person", AsyncMock(return_value=_result("x@y.fr")))
    contacts = [{"fullName": f"P{i}", "priority": 1} for i in range(20)]
    await ce.enrich_top_deciders(contacts, "X")  # no explicit limit → default 15
    assert sum(1 for c in contacts if c.get("email")) == 15


@pytest.mark.asyncio
async def test_skips_deciders_apollo_says_have_no_email(monkeypatch: pytest.MonkeyPatch) -> None:
    # Credit-smart: a decider Apollo flagged hasEmail=False must NOT be enriched
    # (guaranteed People-Match miss = wasted credit). One with hasEmail=True is.
    calls: list[str] = []

    async def fake_enrich(*, first_name=None, last_name=None, **_):
        calls.append(f"{first_name} {last_name}")
        return _result("hit@x.fr")

    monkeypatch.setattr(ce, "enrich_person", AsyncMock(side_effect=fake_enrich))
    contacts = [
        {"fullName": "Ana Yes", "priority": 1, "hasEmail": True},
        {"fullName": "Bob No", "priority": 1, "hasEmail": False},   # Apollo: no email → skip
        {"fullName": "Cid Unknown", "priority": 1},                 # no flag → still tried
    ]
    await ce.enrich_top_deciders(contacts, "X")
    assert "Bob No" not in calls
    assert {"Ana Yes", "Cid Unknown"} == set(calls)


@pytest.mark.asyncio
async def test_prefers_known_email_deciders_within_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    # With a tight limit, spend credits on hasEmail=True deciders first, before the
    # unknown-flag ones.
    calls: list[str] = []

    async def fake_enrich(*, first_name=None, **_):
        calls.append(first_name or "")
        return _result("x@y.fr")

    monkeypatch.setattr(ce, "enrich_person", AsyncMock(side_effect=fake_enrich))
    contacts = [
        {"fullName": "Unknown One", "priority": 1},
        {"fullName": "Known Two", "priority": 1, "hasEmail": True},
    ]
    await ce.enrich_top_deciders(contacts, "X", limit=1)
    assert calls == ["Known"]  # the hasEmail=True decider wins the single slot


@pytest.mark.asyncio
async def test_plan_error_stops_without_failing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ce, "enrich_person", AsyncMock(side_effect=ApolloPlanError("no plan")))
    contacts = [{"fullName": "Alice", "priority": 1}, {"fullName": "Bob", "priority": 1}]
    out = await ce.enrich_top_deciders(contacts, "X")  # must not raise
    assert all("email" not in c for c in out)


@pytest.mark.asyncio
async def test_generic_error_is_best_effort(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ce, "enrich_person", AsyncMock(side_effect=RuntimeError("boom")))
    contacts = [{"fullName": "Alice", "priority": 1}]
    out = await ce.enrich_top_deciders(contacts, "X")  # must not raise
    assert "email" not in out[0]


@pytest.mark.asyncio
async def test_noop_when_no_deciders(monkeypatch: pytest.MonkeyPatch) -> None:
    enrich = AsyncMock(return_value=_result("x@y.fr"))
    monkeypatch.setattr(ce, "enrich_person", enrich)
    contacts = [{"fullName": "Bob", "priority": 5}, {"fullName": "Eve", "title": "Intern"}]
    await ce.enrich_top_deciders(contacts, "X")
    enrich.assert_not_awaited()
