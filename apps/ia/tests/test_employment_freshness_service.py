"""Apollo Professional (02/11) — la fraîcheur du poste par People-Match : parcours daté, jamais un échec pris pour un état."""

from unittest.mock import AsyncMock, patch

import pytest

from app.models.contacts import ApolloEmploymentEntry, ApolloEnrichmentResult
from app.services.apollo import ApolloUnavailableError
from app.services.employment_freshness import read_employment_freshness

PATH = "app.services.employment_freshness._enrich_person_uncached"


def _result(history: list[ApolloEmploymentEntry], organization: str | None = "Autre SA") -> ApolloEnrichmentResult:
    return ApolloEnrichmentResult(matched=True, organization_name=organization, employment_history=history)


@pytest.mark.asyncio
async def test_en_poste_quand_le_parcours_a_une_experience_en_cours_chez_l_employeur() -> None:
    history = [ApolloEmploymentEntry(organization_name="Acme SA", start_date="2020-01-01", current=True)]
    with patch(PATH, new=AsyncMock(return_value=_result(history, "Acme SA"))):
        out = await read_employment_freshness(apollo_id="abc", linkedin_url=None, employer_ref="Acme")
    assert (out.status, out.state, out.credits) == ("ok", "in_post", 1)
    assert out.left_on is None


@pytest.mark.asyncio
async def test_parti_porte_la_date_de_fin_et_le_nouvel_employeur() -> None:
    history = [
        ApolloEmploymentEntry(organization_name="Acme SA", start_date="2018-01-01", end_date="2024-06-30"),
        ApolloEmploymentEntry(organization_name="Autre SA", start_date="2024-07-01", current=True),
    ]
    with patch(PATH, new=AsyncMock(return_value=_result(history))):
        out = await read_employment_freshness(apollo_id="abc", linkedin_url=None, employer_ref="Acme")
    assert (out.state, out.organization, out.left_on) == ("left", "Autre SA", "2024-06-30")


@pytest.mark.asyncio
async def test_inconnu_quand_le_parcours_ne_cite_pas_l_employeur_et_sans_instantane() -> None:
    history = [ApolloEmploymentEntry(organization_name="Ailleurs", current=True)]
    with patch(PATH, new=AsyncMock(return_value=_result(history, None))):
        out = await read_employment_freshness(apollo_id="abc", linkedin_url=None, employer_ref="Acme")
    assert (out.status, out.state) == ("ok", "unknown")


@pytest.mark.asyncio
async def test_sans_identifiant_aucun_appel_reseau() -> None:
    mock = AsyncMock()
    with patch(PATH, new=mock):
        out = await read_employment_freshness(apollo_id=None, linkedin_url=None, employer_ref="Acme")
    assert (out.status, out.state, out.credits) == ("no_identifier", "unknown", 0)
    mock.assert_not_called()


@pytest.mark.asyncio
async def test_panne_n_est_jamais_un_etat() -> None:
    from app.services.company_filters import DegradeReason

    err = ApolloUnavailableError(503, DegradeReason.NETWORK_ERROR, "down", context="enrich")
    with patch(PATH, new=AsyncMock(side_effect=err)):
        out = await read_employment_freshness(apollo_id="abc", linkedin_url=None, employer_ref="Acme")
    assert (out.status, out.state, out.credits) == ("unavailable", "unknown", 0)


@pytest.mark.asyncio
async def test_aucune_correspondance_ne_debite_rien_et_reste_inconnu() -> None:
    with patch(PATH, new=AsyncMock(return_value=ApolloEnrichmentResult(matched=False))):
        out = await read_employment_freshness(apollo_id="abc", linkedin_url=None, employer_ref="Acme")
    assert (out.status, out.state, out.credits) == ("unmatched", "unknown", 0)


def test_route_expose_la_lecture_et_ne_prend_pas_de_nom() -> None:
    from fastapi.testclient import TestClient

    from app.main import app

    reading = ApolloEnrichmentResult(
        matched=True,
        organization_name="Acme SA",
        employment_history=[ApolloEmploymentEntry(organization_name="Acme SA", current=True)],
    )
    with patch(PATH, new=AsyncMock(return_value=reading)):
        res = TestClient(app).post(
            "/phase/2/people/employment-freshness",
            json={"apollo_id": "abc", "employer_ref": "Acme"},
            headers={"x-internal-secret": "test"},
        )
    assert res.status_code == 200, res.text
    assert res.json()["state"] == "in_post"
