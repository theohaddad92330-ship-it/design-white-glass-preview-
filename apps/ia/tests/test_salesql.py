"""SalesQL person enrichment — second source in the contact cascade.

Contract verified against https://salesql.com/docs (persons/enrich): GET with a
``linkedin_url`` OR name + org, ``emails[]`` / ``phones[]`` in the response.
Covers: strict no-op without the key (ZERO network), real-fixture parsing,
graceful degradation on every failure mode, and the best-effort Redis cache.
"""

from __future__ import annotations

import fakeredis.aioredis
import httpx
import pytest

from app.services import salesql
from app.services.salesql import (
    SALESQL_ENRICH_URL,
    _coerce_email_status,
    _pick_email,
    _to_result,
    enrich_person,
    is_enabled,
)

# Fixture calquée sur la réponse documentée SalesQL persons/enrich.
SAMPLE_PERSON = {
    "first_name": "Marie-Aude",
    "last_name": "Morel",
    "full_name": "Marie-Aude Morel",
    "linkedin_url": "https://www.linkedin.com/in/marie-aude-morel",
    "title": "Administrateur",
    "headline": "Administrateur — Groupe TF1",
    "emails": [
        {"email": "personal@gmail.com", "type": "Personal", "status": "Valid"},
        {"email": "ma.morel@tf1.fr", "type": "Work", "status": "Valid"},
    ],
    "phones": [
        {"phone": "+33 1 41 41 12 34", "type": "Mobile"},
    ],
}


def _mock_response(status: int, json_data: dict | list | None = None, text: str | None = None) -> httpx.Response:
    request = httpx.Request("GET", SALESQL_ENRICH_URL)
    if text is not None:
        return httpx.Response(status, text=text, request=request)
    return httpx.Response(status, json=json_data if json_data is not None else {}, request=request)


async def _none():
    return None


async def _wrap(client):
    return client


# === Pure parsing ===


class TestParsing:
    def test_pick_email_prefers_work_then_valid(self) -> None:
        primary, status, extras = _pick_email(SAMPLE_PERSON["emails"])
        # Work email wins over the personal one even though both are Valid.
        assert primary == "ma.morel@tf1.fr"
        assert status == "verified"
        assert extras == ["personal@gmail.com"]

    def test_pick_email_empty(self) -> None:
        assert _pick_email([]) == (None, None, [])
        assert _pick_email(None) == (None, None, [])

    def test_coerce_email_status(self) -> None:
        assert _coerce_email_status("Valid") == "verified"
        assert _coerce_email_status("verified") == "verified"
        assert _coerce_email_status("catch-all") == "unverified"
        assert _coerce_email_status("unknown") == "unknown"
        assert _coerce_email_status("weird") == "unknown"
        assert _coerce_email_status("") is None
        assert _coerce_email_status(None) is None

    def test_to_result_full(self) -> None:
        r = _to_result(SAMPLE_PERSON)
        assert r.matched is True
        assert r.first_name == "Marie-Aude"
        assert r.last_name == "Morel"
        assert r.email == "ma.morel@tf1.fr"
        assert r.email_status == "verified"
        assert r.phone == "+33 1 41 41 12 34"
        assert r.linkedin_url == "https://www.linkedin.com/in/marie-aude-morel"
        assert r.title == "Administrateur"
        assert r.personal_emails == ["personal@gmail.com"]
        assert len(r.phone_numbers) == 1

    def test_to_result_identity_only_is_matched(self) -> None:
        # Real name but no email/phone — completing the identity is still a match.
        r = _to_result({"first_name": "Julien", "last_name": "Bataille"})
        assert r.matched is True
        assert r.email is None

    def test_to_result_empty_payload_not_matched(self) -> None:
        # Nothing reachable and no full name → never invents a match.
        assert _to_result({}).matched is False
        assert _to_result({"first_name": "Julien"}).matched is False  # no last name


# === Gating: no key = strict no-op, ZERO network ===


class TestGating:
    @pytest.mark.asyncio
    async def test_no_key_is_a_strict_noop(self, monkeypatch) -> None:
        monkeypatch.delenv("SALESQL_API_KEY", raising=False)
        assert is_enabled() is False

        class _Boom(httpx.AsyncClient):
            async def get(self, *a, **kw):  # pragma: no cover — must never run
                raise AssertionError("network call attempted without SALESQL_API_KEY")

        result = await enrich_person(
            linkedin_url="https://linkedin.com/in/x", http_client=_Boom()
        )
        assert result.matched is False

    @pytest.mark.asyncio
    async def test_no_usable_match_key_is_a_noop(self, monkeypatch) -> None:
        monkeypatch.setenv("SALESQL_API_KEY", "k")

        class _Boom(httpx.AsyncClient):
            async def get(self, *a, **kw):  # pragma: no cover — must never run
                raise AssertionError("network call attempted without a usable key")

        # No linkedin, and first_name without an org anchor → never queried.
        result = await enrich_person(first_name="Julien", http_client=_Boom())
        assert result.matched is False


# === Live call (mocked) + gracieux ===


class TestEnrich:
    @pytest.mark.asyncio
    async def test_hit_by_linkedin(self, monkeypatch) -> None:
        monkeypatch.setenv("SALESQL_API_KEY", "k")
        monkeypatch.setattr(salesql, "_cache_redis", _none)

        seen: dict = {}

        async def _get(url, params=None, headers=None):
            seen["params"] = params
            seen["headers"] = headers
            return _mock_response(200, SAMPLE_PERSON)

        client = httpx.AsyncClient()
        monkeypatch.setattr(client, "get", _get)
        r = await enrich_person(
            linkedin_url="https://www.linkedin.com/in/marie-aude-morel", http_client=client
        )
        assert r.matched and r.email == "ma.morel@tf1.fr"
        assert seen["params"]["linkedin_url"] == "https://www.linkedin.com/in/marie-aude-morel"
        # Default auth style = Bearer header.
        assert seen["headers"]["Authorization"] == "Bearer k"
        await client.aclose()

    @pytest.mark.asyncio
    async def test_hit_by_name_and_org(self, monkeypatch) -> None:
        monkeypatch.setenv("SALESQL_API_KEY", "k")
        monkeypatch.setattr(salesql, "_cache_redis", _none)

        seen: dict = {}

        async def _get(url, params=None, headers=None):
            seen["params"] = params
            return _mock_response(200, SAMPLE_PERSON)

        client = httpx.AsyncClient()
        monkeypatch.setattr(client, "get", _get)
        r = await enrich_person(
            first_name="Marie-Aude",
            last_name="Morel",
            organization_name="Groupe TF1",
            organization_domain="tf1.fr",
            http_client=client,
        )
        assert r.matched
        assert seen["params"]["first_name"] == "Marie-Aude"
        assert seen["params"]["organization_domain"] == "tf1.fr"
        await client.aclose()

    @pytest.mark.asyncio
    async def test_query_auth_style(self, monkeypatch) -> None:
        monkeypatch.setenv("SALESQL_API_KEY", "k")
        monkeypatch.setenv("SALESQL_AUTH_STYLE", "query")
        monkeypatch.setattr(salesql, "_cache_redis", _none)

        seen: dict = {}

        async def _get(url, params=None, headers=None):
            seen["params"] = params
            seen["headers"] = headers
            return _mock_response(200, SAMPLE_PERSON)

        client = httpx.AsyncClient()
        monkeypatch.setattr(client, "get", _get)
        await enrich_person(linkedin_url="https://linkedin.com/in/x", http_client=client)
        assert seen["params"]["api_key"] == "k"
        assert "Authorization" not in seen["headers"]
        await client.aclose()

    @pytest.mark.asyncio
    @pytest.mark.parametrize("status", [401, 402, 404, 429, 500])
    async def test_http_failure_degrades_to_empty(self, monkeypatch, status: int) -> None:
        monkeypatch.setenv("SALESQL_API_KEY", "k")
        monkeypatch.setattr(salesql, "_cache_redis", _none)

        async def _get(*_a, **_kw):
            return _mock_response(status, {"error": "nope"})

        client = httpx.AsyncClient()
        monkeypatch.setattr(client, "get", _get)
        r = await enrich_person(linkedin_url="https://linkedin.com/in/x", http_client=client)
        assert r.matched is False
        await client.aclose()

    @pytest.mark.asyncio
    async def test_non_json_200_degrades_to_empty(self, monkeypatch) -> None:
        monkeypatch.setenv("SALESQL_API_KEY", "k")
        monkeypatch.setattr(salesql, "_cache_redis", _none)

        async def _get(*_a, **_kw):
            return _mock_response(200, text="<html>interstitial</html>")

        client = httpx.AsyncClient()
        monkeypatch.setattr(client, "get", _get)
        r = await enrich_person(linkedin_url="https://linkedin.com/in/x", http_client=client)
        assert r.matched is False
        await client.aclose()

    @pytest.mark.asyncio
    async def test_network_error_degrades_to_empty(self, monkeypatch) -> None:
        monkeypatch.setenv("SALESQL_API_KEY", "k")
        monkeypatch.setattr(salesql, "_cache_redis", _none)

        async def _get(*_a, **_kw):
            raise httpx.ConnectError("boom")

        client = httpx.AsyncClient()
        monkeypatch.setattr(client, "get", _get)
        r = await enrich_person(linkedin_url="https://linkedin.com/in/x", http_client=client)
        assert r.matched is False
        await client.aclose()

    @pytest.mark.asyncio
    async def test_wrapped_data_payload(self, monkeypatch) -> None:
        # Tolerant of a { "data": {...} } wrapper without inventing fields.
        monkeypatch.setenv("SALESQL_API_KEY", "k")
        monkeypatch.setattr(salesql, "_cache_redis", _none)

        async def _get(*_a, **_kw):
            return _mock_response(200, {"data": SAMPLE_PERSON})

        client = httpx.AsyncClient()
        monkeypatch.setattr(client, "get", _get)
        r = await enrich_person(linkedin_url="https://linkedin.com/in/x", http_client=client)
        assert r.matched and r.email == "ma.morel@tf1.fr"
        await client.aclose()


# === Cache best-effort ===


class TestCache:
    @pytest.mark.asyncio
    async def test_hit_served_from_cache(self, monkeypatch) -> None:
        monkeypatch.setenv("SALESQL_API_KEY", "k")
        fake = fakeredis.aioredis.FakeRedis(decode_responses=True)
        monkeypatch.setattr(salesql, "_cache_redis", lambda: _wrap(fake))

        calls = {"n": 0}

        async def _get(*_a, **_kw):
            calls["n"] += 1
            return _mock_response(200, SAMPLE_PERSON)

        client = httpx.AsyncClient()
        monkeypatch.setattr(client, "get", _get)
        r1 = await enrich_person(linkedin_url="https://linkedin.com/in/x", http_client=client)
        r2 = await enrich_person(linkedin_url="https://linkedin.com/in/x", http_client=client)
        assert r1.matched and r2.matched
        assert calls["n"] == 1  # 2nd served from cache — no 2nd SalesQL credit
        await client.aclose()

    @pytest.mark.asyncio
    async def test_miss_is_not_cached(self, monkeypatch) -> None:
        monkeypatch.setenv("SALESQL_API_KEY", "k")
        fake = fakeredis.aioredis.FakeRedis(decode_responses=True)
        monkeypatch.setattr(salesql, "_cache_redis", lambda: _wrap(fake))

        calls = {"n": 0}

        async def _get(*_a, **_kw):
            calls["n"] += 1
            return _mock_response(404, {"error": "not found"})

        client = httpx.AsyncClient()
        monkeypatch.setattr(client, "get", _get)
        await enrich_person(linkedin_url="https://linkedin.com/in/x", http_client=client)
        await enrich_person(linkedin_url="https://linkedin.com/in/x", http_client=client)
        assert calls["n"] == 2  # a miss re-tries (data improves over time)
        await client.aclose()
