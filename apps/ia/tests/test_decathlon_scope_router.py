"""DECATHLON 11/10 — l'APPELANT réel passe le groupe connu aux sources d'offres.

Le rattachement groupe (``EmployerScope``) ne vaut que si l'analyse le construit
depuis la fiche registre DÉJÀ collectée et le donne à France Travail et aux
agrégateurs, avec le site du compte. Passe par ``POST /phase/1/research``.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.services.data_sources.employer_match import EmployerScope
from tests.test_phase1_research import (
    MOCK_BRAVE_RESULTS,
    MOCK_BUNDLE_WITH_CONTENT,
    MOCK_PROFILE,
    _claude_side_effect,
    _facts,
    _signals,
    _strategy,
)


def test_the_research_passes_the_registry_group_and_site_to_job_sources(client: TestClient) -> None:
    seen: dict = {}

    async def _ft(*_args, scope=None, **_kw):
        seen["ft_scope"] = scope
        return []

    async def _aggregators(_company, *, scope=None, domain=None, **_kw):
        seen["agg_scope"] = scope
        seen["agg_domain"] = domain
        return []

    async def _empty(*_args, **_kw):
        return []

    with (
        patch("app.routers.phase1_research.research_brave", new_callable=AsyncMock, return_value=MOCK_BRAVE_RESULTS),
        patch("app.routers.phase1_research.research_pappers", new_callable=AsyncMock, return_value=MOCK_PROFILE),
        patch(
            "app.routers.phase1_research.research_firecrawl",
            new_callable=AsyncMock,
            return_value=MOCK_BUNDLE_WITH_CONTENT,
        ),
        patch(
            "app.routers.phase1_research.call_claude",
            new_callable=AsyncMock,
            side_effect=_claude_side_effect(_facts(), _signals(), _strategy()),
        ),
        patch("app.routers.phase1_research.it_job_signals", _ft),
        patch("app.routers.phase1_research.it_job_signals_apec", _empty),
        patch("app.routers.phase1_research.it_job_signals_ats", _empty),
        patch("app.routers.phase1_research.it_job_signals_careers", _empty),
        patch("app.routers.phase1_research.it_job_signals_wttj", _empty),
        patch("app.routers.phase1_research.it_job_signals_aggregators", _aggregators),
    ):
        res = client.post(
            "/phase/1/research",
            json={"company_name": "SNCF", "website": "https://www.sncf.com/fr", "profile_data": {}},
        )

    assert res.status_code == 200, res.text
    expected = EmployerScope.from_registry("SNCF", profile=MOCK_PROFILE)
    for key in ("ft_scope", "agg_scope"):
        scope = seen[key]
        assert isinstance(scope, EmployerScope), key
        assert scope.fingerprint() == expected.fingerprint(), key
    # La fiche registre est bien lue : son SIREN compte pour le groupe.
    assert MOCK_PROFILE.siren in seen["agg_scope"].known_sirens
    assert seen["agg_domain"] == "sncf.com"
