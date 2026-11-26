"""A rejected credential and a genuine « nobody found » must not look alike.

The bug this pins: the on-demand enrich endpoint answered EVERY provider failure
with a stringified ``ValueError`` — no machine-readable cause — and the NestJS
API had nothing to translate, so the seller read « API error » in a French UI.

Two directions are tested, deliberately (the #638 rule):

  * an outage must never be rendered as an absence — a dead Apollo key, an
    exhausted quota and a 429 each carry their own :class:`DegradeReason`;
  * an absence must never be rendered as an outage — Apollo answering 200 with
    no ``person`` is a real « this person is not in the database », and it must
    stay a plain empty result with no degradation attached.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import HTTPException

import app.services.apollo as apollo
from app.models.contacts import ApolloEnrichmentResult
from app.routers import phase2_contacts
from app.services.apollo import (
    ApolloPlanError,
    ApolloUnavailableError,
    enrich_person,
    enrich_person_with_fallback,
)
from app.services.company_filters import DegradeReason


class _Res:
    """Minimal httpx-like response — status + body, which is all the classifier reads."""

    def __init__(self, status: int, text: str = "", payload: object | None = None) -> None:
        self.status_code = status
        self.text = text
        self.is_success = 200 <= status < 300
        self._payload = payload

    def json(self) -> object:
        if self._payload is None:
            raise ValueError("no json")
        return self._payload


def _client(res: _Res) -> httpx.AsyncClient:
    client = httpx.AsyncClient()
    client.post = AsyncMock(return_value=res)  # type: ignore[method-assign]
    return client


# ── Direction 1 — an outage carries a machine-readable cause ────────────────


@pytest.mark.asyncio
async def test_missing_key_is_missing_api_key_not_a_miss(monkeypatch: pytest.MonkeyPatch) -> None:
    """No APOLLO_API_KEY is a configuration fault, not « person not found »."""
    monkeypatch.delenv("APOLLO_API_KEY", raising=False)

    with pytest.raises(ApolloUnavailableError) as exc:
        await enrich_person(first_name="Gilles", last_name="Denoyel", organization_name="EDF")

    assert exc.value.reason == DegradeReason.MISSING_API_KEY


@pytest.mark.asyncio
async def test_missing_key_stays_a_valueerror_for_existing_handlers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Back-compat guard: every pre-existing ``except ValueError`` still catches it.

    ``ApolloUnavailableError`` subclasses ``ValueError`` on purpose — the typed
    reason is additive, so no existing call site changes behaviour.
    """
    monkeypatch.delenv("APOLLO_API_KEY", raising=False)

    with pytest.raises(ValueError):
        await enrich_person(first_name="Gilles", last_name="Denoyel", organization_name="EDF")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status", "expected"),
    [
        (401, DegradeReason.UNAUTHORIZED),
        (403, DegradeReason.UNAUTHORIZED),
        (429, DegradeReason.RATE_LIMITED),
        (500, DegradeReason.UPSTREAM_ERROR),
        (503, DegradeReason.UPSTREAM_ERROR),
    ],
)
async def test_http_failures_carry_their_own_reason(
    monkeypatch: pytest.MonkeyPatch, status: int, expected: str
) -> None:
    """A dead key (401), a throttle (429) and a provider outage (5xx) are three
    different facts with three different repairs — they must not collapse."""
    monkeypatch.setenv("APOLLO_API_KEY", "k")

    with pytest.raises(ApolloUnavailableError) as exc:
        await enrich_person(
            first_name="Gilles",
            last_name="Denoyel",
            organization_name="EDF",
            http_client=_client(_Res(status, "nope")),
        )

    assert exc.value.reason == expected
    assert exc.value.status == status


@pytest.mark.asyncio
async def test_transport_failure_is_network_error(monkeypatch: pytest.MonkeyPatch) -> None:
    """Apollo unreachable ≠ Apollo saying no."""
    monkeypatch.setenv("APOLLO_API_KEY", "k")
    client = httpx.AsyncClient()
    client.post = AsyncMock(side_effect=httpx.ConnectError("dns"))  # type: ignore[method-assign]

    with pytest.raises(ApolloUnavailableError) as exc:
        await enrich_person(
            first_name="Gilles", last_name="Denoyel", organization_name="EDF", http_client=client
        )

    assert exc.value.reason == DegradeReason.NETWORK_ERROR


@pytest.mark.asyncio
async def test_plan_block_is_unauthorized_not_a_quota(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """« Your Apollo plan has no REST access » must NOT read as a quota.

    The production account had 214/2500 credits left, so « quota épuisé,
    réessaie » would send the seller chasing a refill that will never help. The
    repair is the plan/key — server-side — which is what ``unauthorized`` says.
    """
    monkeypatch.setenv("APOLLO_API_KEY", "k")
    body = '{"error_code": "API_INACCESSIBLE"}'

    with pytest.raises(ApolloPlanError) as exc:
        await enrich_person(
            first_name="Gilles",
            last_name="Denoyel",
            organization_name="EDF",
            http_client=_client(_Res(403, body)),
        )

    assert exc.value.reason == DegradeReason.UNAUTHORIZED


# ── Direction 2 — an absence stays an absence ───────────────────────────────


@pytest.mark.asyncio
async def test_locked_email_placeholder_is_not_a_reveal(monkeypatch: pytest.MonkeyPatch) -> None:
    """Apollo's « email_not_unlocked@… » is a plan limitation, not an address.

    On a plan without reveal, People-Match returns the person WITH that
    placeholder in ``email``. Surfacing it would persist a garbage address and
    bill a credit for a reveal that never happened. The match must report no
    reachable email — the linkedin/title it carries are free, present-only data.
    """
    monkeypatch.setenv("APOLLO_API_KEY", "k")
    person = {
        "id": "x",
        "first_name": "Gilles",
        "last_name": "Denoyel",
        "email": "email_not_unlocked@domain.com",
        "linkedin_url": "https://linkedin.com/in/gdenoyel",
        "title": "Senior Advisor",
    }

    out = await enrich_person(
        first_name="Gilles",
        last_name="Denoyel",
        organization_name="EDF",
        http_client=_client(_Res(200, "{}", payload={"person": person})),
    )

    assert out.matched is True  # the person WAS matched…
    assert out.email is None  # …but nothing reveal-gated came back
    assert out.linkedin_url == "https://linkedin.com/in/gdenoyel"  # free public field kept


@pytest.mark.asyncio
async def test_apollo_200_without_person_is_a_real_miss(monkeypatch: pytest.MonkeyPatch) -> None:
    """200 + no ``person`` is Apollo telling us the truth: it doesn't know them.

    The symmetric bug would be dressing this absence as an outage. It must stay
    an unmatched result, never an exception.
    """
    monkeypatch.setenv("APOLLO_API_KEY", "k")

    out = await enrich_person(
        first_name="Gilles",
        last_name="Denoyel",
        organization_name="EDF",
        http_client=_client(_Res(200, "{}", payload={"person": None})),
    )

    assert out.matched is False


@pytest.mark.asyncio
async def test_cascade_returns_empty_when_every_source_honestly_missed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """No provider failed, nobody was found ⇒ plain empty, no error raised."""
    monkeypatch.setenv("APOLLO_API_KEY", "k")
    monkeypatch.setattr(
        apollo, "enrich_person", AsyncMock(return_value=ApolloEnrichmentResult(matched=False))
    )
    monkeypatch.setattr(apollo, "salesql_is_enabled", lambda: False)

    out = await enrich_person_with_fallback(
        first_name="Gilles", last_name="Denoyel", organization_name="EDF"
    )

    assert out.matched is False


# ── The cascade must survive one dead source ────────────────────────────────


@pytest.mark.asyncio
async def test_dead_apollo_does_not_abort_the_salesql_leg(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A rejected Apollo credential used to kill the whole cascade.

    ``enrich_person`` raised, the exception escaped ``enrich_person_with_fallback``
    at path 1, and SalesQL — which may well know this person — was never asked.
    The cascade documented in CLAUDE.md (Apollo → SalesQL → Dropcontact) only
    exists if a broken first leg is survivable.
    """
    monkeypatch.setenv("APOLLO_API_KEY", "k")
    monkeypatch.setattr(
        apollo,
        "enrich_person",
        AsyncMock(side_effect=ApolloUnavailableError(401, DegradeReason.UNAUTHORIZED)),
    )
    monkeypatch.setattr(apollo, "salesql_is_enabled", lambda: True)
    monkeypatch.setattr(
        apollo,
        "salesql_enrich_person",
        AsyncMock(
            return_value=ApolloEnrichmentResult(
                matched=True,
                email="gilles.denoyel@edf.fr",
                first_name="Gilles",
                last_name="Denoyel",
            )
        ),
    )

    out = await enrich_person_with_fallback(
        first_name="Gilles",
        last_name="Denoyel",
        organization_name="EDF",
        organization_domain="edf.fr",
    )

    assert out.matched is True
    assert out.email == "gilles.denoyel@edf.fr"


@pytest.mark.asyncio
async def test_all_sources_down_raises_rather_than_reporting_an_absence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Apollo down and SalesQL silent ⇒ we do NOT know whether the person exists.

    Returning ``matched=False`` here would be the exact lie #638 forbids: an
    outage rendered as a fact about the market. The typed failure propagates so
    the endpoint can say « provider unavailable » instead of « not found ».
    """
    monkeypatch.setenv("APOLLO_API_KEY", "k")
    monkeypatch.setattr(
        apollo,
        "enrich_person",
        AsyncMock(side_effect=ApolloUnavailableError(401, DegradeReason.UNAUTHORIZED)),
    )
    monkeypatch.setattr(apollo, "salesql_is_enabled", lambda: False)

    with pytest.raises(ApolloUnavailableError) as exc:
        await enrich_person_with_fallback(
            first_name="Gilles", last_name="Denoyel", organization_name="EDF"
        )

    assert exc.value.reason == DegradeReason.UNAUTHORIZED


# ── The HTTP endpoint hands the code to the API ─────────────────────────────


@pytest.mark.asyncio
async def test_endpoint_returns_a_code_the_api_can_translate(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The whole point: the failure reaches NestJS as a *code*, not prose.

    ``detail`` used to be ``str(exc)`` — an English sentence the API could only
    forward or drop. It now carries ``{message, code, provider}``.
    """
    monkeypatch.setattr(
        phase2_contacts,
        "enrich_person_with_fallback",
        AsyncMock(side_effect=ApolloUnavailableError(401, DegradeReason.UNAUTHORIZED)),
    )
    req = phase2_contacts.EnrichPersonRequest(
        first_name="Gilles", last_name="Denoyel", organization_name="EDF"
    )

    with pytest.raises(HTTPException) as exc:
        await phase2_contacts.enrich(req)

    assert exc.value.status_code == 502
    assert isinstance(exc.value.detail, dict)
    assert exc.value.detail["code"] == DegradeReason.UNAUTHORIZED
    assert exc.value.detail["provider"] == "apollo"


@pytest.mark.asyncio
async def test_endpoint_keeps_402_for_a_plan_block(monkeypatch: pytest.MonkeyPatch) -> None:
    """Plan blocked stays a 402, and carries the ``unauthorized`` code so the
    API names the plan/key rather than a phantom quota."""
    monkeypatch.setattr(
        phase2_contacts,
        "enrich_person_with_fallback",
        AsyncMock(side_effect=ApolloPlanError("upgrade your plan")),
    )
    req = phase2_contacts.EnrichPersonRequest(
        first_name="Gilles", last_name="Denoyel", organization_name="EDF"
    )

    with pytest.raises(HTTPException) as exc:
        await phase2_contacts.enrich(req)

    assert exc.value.status_code == 402
    assert exc.value.detail["code"] == DegradeReason.UNAUTHORIZED


@pytest.mark.asyncio
async def test_endpoint_still_answers_200_on_a_genuine_miss(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A real absence is a successful answer carrying ``matched=False`` — never
    an HTTP error. This is what keeps « aucune personne trouvée » distinct from
    « le fournisseur est indisponible » all the way to the toast."""
    monkeypatch.setattr(
        phase2_contacts,
        "enrich_person_with_fallback",
        AsyncMock(return_value=ApolloEnrichmentResult(matched=False)),
    )
    req = phase2_contacts.EnrichPersonRequest(
        first_name="Gilles", last_name="Denoyel", organization_name="EDF"
    )

    out = await phase2_contacts.enrich(req)

    assert out.success is True
    assert out.data.matched is False
