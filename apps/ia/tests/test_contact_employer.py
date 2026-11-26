"""LUDB.5 — un contact enrichi n'est rattaché au compte que si son employeur correspond."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

import app.services.contact_enrich as ce
from app.models.contacts import ApolloEnrichmentResult
from app.services.contact_employer import account_domains_from, employer_matches

STILL = ["still.fr", "still.de"]


def test_homonym_domain_is_refused_for_still() -> None:
    # LUDB.5 — « stillfront.com » et « still.sk » ne sont pas STILL.
    assert employer_matches("cfo@stillfront.com", STILL) is False
    assert employer_matches("cto@still.sk", STILL) is False


def test_account_and_group_domains_match() -> None:
    assert employer_matches("jean.dupont@still.fr", STILL) is True
    assert employer_matches("hans@mail.still.de", STILL) is True
    assert employer_matches("x@kion.com", [*STILL, "kiongroup.com", "kion.com"]) is True


def test_unknown_is_not_a_mismatch() -> None:
    # Pas d'email ou pas de domaine de compte : on ne peut rien prouver, on ne rejette pas.
    assert employer_matches("", STILL) is None
    assert employer_matches("a@still.fr", []) is None


def test_account_domains_from_website() -> None:
    assert account_domains_from("https://www.still.fr/contact", ["Still.DE", ""]) == ["still.fr", "still.de"]
    assert account_domains_from(None, None) == []


@pytest.mark.asyncio
async def test_enrich_rejects_homonym_with_reason(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake(**_: object) -> ApolloEnrichmentResult:
        return ApolloEnrichmentResult(matched=True, email="cfo@stillfront.com", email_status="verified")

    monkeypatch.setattr(ce, "enrich_person", AsyncMock(side_effect=fake))
    contacts = [{"fullName": "Anna CFO", "priority": 1}]
    out = await ce.enrich_top_deciders(contacts, "STILL", account_domains=STILL)
    assert "email" not in out[0]
    assert out[0]["excluded"] is True
    assert "homonyme" in out[0]["exclusionReason"]


@pytest.mark.asyncio
async def test_enrich_without_domains_is_unchanged(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake(**_: object) -> ApolloEnrichmentResult:
        return ApolloEnrichmentResult(matched=True, email="cfo@stillfront.com", email_status="verified")

    monkeypatch.setattr(ce, "enrich_person", AsyncMock(side_effect=fake))
    out = await ce.enrich_top_deciders([{"fullName": "Anna CFO", "priority": 1}], "STILL")
    assert out[0]["email"] == "cfo@stillfront.com"
    assert "excluded" not in out[0]
