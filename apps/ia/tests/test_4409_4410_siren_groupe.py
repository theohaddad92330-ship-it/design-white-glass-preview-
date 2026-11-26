"""#4410 — un SIREN tapé dans le sélecteur rend CETTE entité, pas un homonyme.
#4409 — le tri des homonymes s'applique aux DEUX sources, et la tête
opérationnelle passe devant la holding.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.services.pappers.models import CompanyProfile

SIREN = "552032534"


def _profile() -> CompanyProfile:
    return CompanyProfile.model_validate(
        {
            "siren": SIREN,
            "nom_entreprise": "DANONE",
            "libelle_code_naf": "Activités des sièges sociaux",
            "code_naf": "70.10Z",
            "effectif_min": 1000,
            "effectif_max": 1999,
            "siege": {"ville": "Paris", "code_postal": "75009"},
        }
    )


def _registry_row(siren: str, name: str, tranche: str | None, etabs: int | None) -> dict:
    return {
        "source": "recherche-entreprises",
        "siren": siren,
        "name": name,
        "legalName": name,
        "headcountTranche": tranche,
        "establishmentCount": etabs,
        "isActive": True,
        "city": "Paris",
    }


def test_siren_with_spaces_resolves_that_entity_without_name_search(client: TestClient) -> None:
    with (
        patch("app.routers.companies.get_company", new_callable=AsyncMock, return_value=_profile()) as fiche,
        patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock) as by_name,
    ):
        res = client.get("/companies/search?q=552%20032%20534&limit=5")

    assert res.status_code == 200
    sug = res.json()["suggestions"]
    assert [s["siren"] for s in sug] == [SIREN]
    by_name.assert_not_called()
    assert fiche.await_args.args[0] == SIREN


def test_siret_is_reduced_to_its_siren(client: TestClient) -> None:
    with (
        patch("app.routers.companies.get_company", new_callable=AsyncMock, return_value=_profile()) as fiche,
        patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock) as by_name,
    ):
        res = client.get("/companies/search?q=55203253400000")

    assert [s["siren"] for s in res.json()["suggestions"]] == [SIREN]
    by_name.assert_not_called()
    assert fiche.await_args.args[0] == SIREN


def test_siren_without_pappers_falls_back_to_registry_exact_entity(client: TestClient) -> None:
    rows = [
        _registry_row("111111111", "HOMONYME", "01", 1),
        _registry_row(SIREN, "DANONE", "41", 3),
    ]
    with (
        patch("app.routers.companies.get_company", new_callable=AsyncMock, side_effect=ValueError("no key")),
        patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock) as by_name,
        patch("app.routers.companies._registry_suggestions", new_callable=AsyncMock, return_value=(rows, False)),
    ):
        res = client.get("/companies/search?q=552032534&limit=5")

    assert [s["siren"] for s in res.json()["suggestions"]] == [SIREN]
    by_name.assert_not_called()


def test_unknown_siren_is_empty_never_a_namesake(client: TestClient) -> None:
    with (
        patch("app.routers.companies.get_company", new_callable=AsyncMock, side_effect=ValueError("no key")),
        patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock) as by_name,
        patch("app.routers.companies._registry_suggestions", new_callable=AsyncMock, return_value=([], False)),
    ):
        res = client.get("/companies/search?q=999999999")

    assert res.json()["suggestions"] == []
    by_name.assert_not_called()
