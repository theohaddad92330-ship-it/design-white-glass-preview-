"""Enrich org-broadening fallback (Path 2b): when the precise account org finds
nobody, retry the role search on the parent brand — the CTO at "Groupe TF1" for
an account analysed as "Studio TF1" (0 Apollo people)."""
from __future__ import annotations

import os
from unittest.mock import patch

import pytest

from app.models.contacts import ApolloEnrichmentResult
from app.services import apollo
from app.services.apollo import _broaden_org_names, enrich_person_with_fallback


class TestBroadenOrgNames:
    def test_studio_prefix_broadens_to_brand(self) -> None:
        assert "TF1" in _broaden_org_names("Studio TF1")

    def test_groupe_prefix_broadens_to_brand(self) -> None:
        assert "TF1" in _broaden_org_names("Groupe TF1")

    def test_parenthetical_and_brand_token(self) -> None:
        out = _broaden_org_names("TF1 Télévision Française 1 (ou Studio TF1 groupe)")
        assert "TF1 Télévision Française 1" in out  # parenthetical stripped
        assert "TF1" in out  # leading brand token

    def test_suffix_noise_stripped(self) -> None:
        assert "TF1" in _broaden_org_names("TF1 PUB")

    def test_original_and_dupes_excluded(self) -> None:
        out = _broaden_org_names("TF1")
        assert "TF1" not in out  # never re-emits the original
        assert out == [] or all(c != "TF1" for c in out)


@pytest.mark.asyncio
async def test_path2b_broadens_when_precise_org_empty() -> None:
    """The account org ('Studio TF1') resolves nobody; the broadened org ('TF1')
    resolves the real CTO. enrich_person_with_fallback must surface it via Path 2b."""
    resolved = ApolloEnrichmentResult(
        matched=True, first_name="Thierry", last_name="Datour",
        email="thierry@tf1.fr", title="CTO", organization_name="Groupe TF1",
    )

    calls: list[str] = []

    async def fake_resolve(*, organization_name, title, first_name=None, **_):
        calls.append(organization_name)
        # The precise account org has 0 Apollo people; a broadened brand resolves.
        return resolved if organization_name in ("TF1", "TF1 Télévision Française 1") else None

    with patch.dict(os.environ, {"APOLLO_API_KEY": "k"}), \
            patch.object(apollo, "_resolve_by_search", side_effect=fake_resolve):
        result = await enrich_person_with_fallback(
            first_name="Thierry", organization_name="Studio TF1", title="CTO",
        )

    assert result.matched is True
    assert result.last_name == "Datour"
    assert result.email == "thierry@tf1.fr"
    # Tried the precise org first, then broadened.
    assert calls[0] == "Studio TF1"
    assert "TF1" in calls


@pytest.mark.asyncio
async def test_path2b_stays_honest_when_nothing_resolves() -> None:
    """If neither the precise nor any broadened org resolves a real person, the
    contact stays unmatched — never invented."""
    async def fake_resolve(**_):
        return None

    with patch.dict(os.environ, {"APOLLO_API_KEY": "k"}), \
            patch.object(apollo, "_resolve_by_search", side_effect=fake_resolve):
        result = await enrich_person_with_fallback(
            first_name="Thierry", organization_name="Studio TF1", title="CTO",
        )

    assert result.matched is False
