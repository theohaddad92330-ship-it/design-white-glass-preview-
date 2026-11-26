"""Wire-contract guard for GET /companies/search.

Why this file exists: the ``registryId`` casing bug (#494 follow-up) survived a
full green suite on BOTH sides. ``test_companies.py`` asserted the Python shape
(``registry_id``) and ``companies.service.spec.ts`` asserted the TS shape
(``registryId``) against a HAND-WRITTEN mock of the IA client — each side was
internally consistent, neither ever compared itself to the other, and the NestJS
proxy forwards the suggestion objects verbatim without validating them. Result:
the national registry id of every non-FR suggestion arrived ``undefined`` in the
browser.

The fix is a single shared artefact rather than two parallel assertions:
``packages/contracts/src/fixtures/company-suggestions.ia.json`` holds the RAW
FastAPI response bodies. This module pins the live response to that file; the
contracts package strict-parses the same file against ``companySuggestionSchema``
(see ``companies.fixtures.test.ts``). Renaming a field on either side now breaks
the other side's suite.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.services.pappers.models import CompanySearchHit

# apps/ia/tests/<this file> → parents[3] is the monorepo root.
_FIXTURE = (
    Path(__file__).resolve().parents[3] / "packages" / "contracts" / "src" / "fixtures" / "company-suggestions.ia.json"
)


def _expected(path: str) -> dict:
    return json.loads(_FIXTURE.read_text(encoding="utf-8"))[path]


def test_fixture_is_reachable_from_the_ia_package() -> None:
    """A moved/renamed fixture must fail loudly here rather than silently skip
    the guard below."""
    assert _FIXTURE.is_file(), f"shared wire fixture not found at {_FIXTURE}"


def test_fr_search_response_matches_the_shared_wire_fixture(client: TestClient) -> None:
    """French default (recherche-entreprises/Pappers) — the historical path.

    Pins the snake_case fields the API genuinely consumes (``postal_code``,
    ``employees_min``/``max`` feed ``similar-scoring.ts``) so the fix to the
    registry fields cannot silently re-case them.
    """
    hits = [
        CompanySearchHit.model_validate(
            {"siren": "330703844", "nom_entreprise": "Capgemini", "libelle_code_naf": "Conseil"}
        )
    ]
    with (
        patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=hits),
        patch("app.routers.companies.suggest_registry_entities", new_callable=AsyncMock) as pack,
    ):
        res = client.get("/companies/search?q=cap&limit=1")

    assert res.status_code == 200
    assert res.json() == _expected("fr")
    pack.assert_not_awaited()


def test_us_search_response_matches_the_shared_wire_fixture(client: TestClient) -> None:
    """Country-pack market (SEC EDGAR). This is the case the casing bug broke:
    ``registryId`` is the identity pivot abroad — there is no SIREN — so a
    mis-cased key erases the only stable identifier the suggestion carries."""
    entity = {
        "source": "sec_edgar",
        "country": "US",
        "name": "Apple Inc.",
        "registryId": "0000320193",
        "registryIdLabel": "CIK",
        "seat": "Cupertino, CA",
        "legalForm": "",
    }
    with (
        patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock) as pappers,
        patch("app.routers.companies.suggest_registry_entities", new_callable=AsyncMock, return_value=[entity]),
    ):
        res = client.get("/companies/search?q=apple&country=US&limit=5")

    assert res.status_code == 200
    assert res.json() == _expected("us")
    pappers.assert_not_awaited()


@pytest.mark.parametrize("path", ["fr", "us"])
def test_registry_identity_keys_are_camel_case_on_the_wire(path: str) -> None:
    """Explicit regression lock on the exact bug.

    The registry identity pair travels in camelCase everywhere else on the
    IA→NestJS wire (``_registry_identity_overlay`` in ``phase1_research.py``
    emits ``registryId``/``registryCountry``, which ``accounts.service.ts``
    reads to persist ``accounts.registry_id``). The autocomplete suggestion must
    speak the same dialect.
    """
    suggestion = _expected(path)["suggestions"][0]
    assert "registryId" in suggestion
    assert "registryIdLabel" in suggestion
    assert "registry_id" not in suggestion
    assert "registry_id_label" not in suggestion
