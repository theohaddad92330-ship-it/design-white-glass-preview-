"""#2165.24 / #2166.3 / #2165.16 — GET /companies/{siren}/group-affiliation.

Le rôle capitalistique d'une entreprise (groupe/filiale) et sa tête de
groupe, dérivés de la cartographie Pappers déjà branchée. `null` partout où
on ne peut pas trancher — jamais un rôle deviné (doctrine CLAUDE.md).
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.services.pappers.models import (
    CompanyProfile,
    GroupAffiliation,
    PappersNoResultError,
    PappersUnavailableError,
)


def _profile(group_affiliation: GroupAffiliation | None) -> CompanyProfile:
    profile = CompanyProfile.model_validate({"siren": "326300159", "nom_entreprise": "TF1"})
    profile.group_affiliation = group_affiliation
    return profile


def test_renvoie_le_role_et_la_tete_de_groupe(client: TestClient) -> None:
    profile = _profile(GroupAffiliation(role="filiale", head_siren="222222222", head_name="BOUYGUES"))
    with patch("app.routers.companies.get_company", new_callable=AsyncMock, return_value=profile):
        res = client.get("/companies/326300159/group-affiliation")
    assert res.status_code == 200
    assert res.json() == {"role": "filiale", "headSiren": "222222222", "headName": "BOUYGUES"}


def test_aucun_lien_capitalistique_rend_null(client: TestClient) -> None:
    profile = _profile(None)
    with patch("app.routers.companies.get_company", new_callable=AsyncMock, return_value=profile):
        res = client.get("/companies/000000000/group-affiliation")
    assert res.status_code == 200
    assert res.json() is None


def test_siren_absent_du_registre_rend_null_jamais_une_erreur(client: TestClient) -> None:
    with patch("app.routers.companies.get_company", new_callable=AsyncMock, side_effect=PappersNoResultError("0")):
        res = client.get("/companies/000000000/group-affiliation")
    assert res.status_code == 200
    assert res.json() is None


def test_source_en_panne_rend_null_jamais_5xx(client: TestClient) -> None:
    with patch(
        "app.routers.companies.get_company",
        new_callable=AsyncMock,
        side_effect=PappersUnavailableError(503, "upstream_error", "boom"),
    ):
        res = client.get("/companies/000000000/group-affiliation")
    assert res.status_code == 200
    assert res.json() is None


def test_sans_cle_pappers_rend_null_jamais_une_erreur(client: TestClient) -> None:
    # `get_api_key()` lève ValueError quand PAPPERS_API_KEY est absente —
    # no-op strict, comme toute source sans clé (CLAUDE.md).
    with patch("app.routers.companies.get_company", new_callable=AsyncMock, side_effect=ValueError("no key")):
        res = client.get("/companies/000000000/group-affiliation")
    assert res.status_code == 200
    assert res.json() is None
