"""Lot 757 — CONTACTS 3/6 : GET /companies/{siren}/group-perimeter.

Arbitrage Louis 31/10 : taper « Decathlon » ouvre un SÉLECTEUR groupe + filiales (taille, siège, région),
le commercial coche, les contacts sont cherchés sur le groupe ET les filiales cochées. Ce test garde la
LECTURE du périmètre : le graphe capitalistique du registre, jamais un rapprochement de noms ; une absence
reste ``None`` (jamais « 0 ») ; seize entités au plus (décision du 10/10).
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.services.group_perimeter import build_group_perimeter, region_of_department
from app.services.pappers.models import (
    CompanyProfile,
    GroupAffiliation,
    PappersNoResultError,
    PappersUnavailableError,
    RelatedCompany,
)


def _profile(siren: str, name: str, subs: list[tuple[str, str]], affiliation: GroupAffiliation | None = None):
    profile = CompanyProfile.model_validate({"siren": siren, "nom_entreprise": name})
    profile.subsidiaries = [RelatedCompany(id=s, siren=s, name=n) for s, n in subs]
    profile.group_affiliation = affiliation
    return profile


def _registry(rows: dict[str, dict]):
    async def fake(name: str, **_: object) -> list[dict]:
        row = rows.get(name)
        return [row] if row else []

    return fake


HEAD = _profile(
    "306138900",
    "DECATHLON SE",
    [("500569405", "DECATHLON FRANCE"), ("123456789", "DECATHLON IMMOBILIER")],
    GroupAffiliation(role="groupe", head_siren="306138900", head_name="DECATHLON SE"),
)
ROWS = {
    "500569405": {
        "siren": "500569405",
        "name": "DECATHLON FRANCE",
        "headcountTranche": "53",
        "city": "VILLENEUVE-D'ASCQ",
        "department": "59",
        "isActive": True,
    },
    "306138900": {"siren": "306138900", "name": "DECATHLON SE", "headcountTranche": "00", "department": "59"},
}


def test_un_groupe_rend_sa_tete_puis_ses_filiales_avec_taille_siege_region() -> None:
    with (
        patch("app.services.group_perimeter.get_company", new_callable=AsyncMock, return_value=HEAD),
        patch("app.services.group_perimeter.search_companies", side_effect=_registry(ROWS)),
    ):
        out = asyncio.run(build_group_perimeter("306138900"))
    assert out is not None
    assert out["rootSiren"] == "306138900" and out["headSiren"] == "306138900"
    assert [e["siren"] for e in out["entities"]] == ["306138900", "500569405", "123456789"]
    head, france, immo = out["entities"]
    assert head["role"] == "groupe" and france["role"] == "filiale"
    assert france["headcountLabel"] == "10 000 salariés et plus"
    assert france["city"] == "VILLENEUVE-D'ASCQ" and france["region"] == "Hauts-de-France"
    # OGF (Loïc) — une holding à 0 salarié se LIT comme telle : « 0 salarié » est publié, pas deviné.
    assert head["headcountLabel"] == "0 salarié"
    # Le registre muet sur une filiale : tout reste None, jamais « 0 » ni une ville devinée.
    assert immo["headcountLabel"] is None and immo["city"] is None and immo["region"] is None
    assert immo["isActive"] is None
    assert out["truncated"] is False


def test_une_filiale_tapee_remonte_au_groupe_confirme() -> None:
    root = _profile(
        "500569405",
        "DECATHLON FRANCE",
        [],
        GroupAffiliation(role="filiale", head_siren="306138900", head_name="DECATHLON SE"),
    )

    async def fake_company(siren: str, **_: object):
        return root if siren == "500569405" else HEAD

    confirmed = GroupAffiliation(role="filiale", head_siren="306138900", head_name="DECATHLON SE")
    with (
        patch("app.services.group_perimeter.get_company", side_effect=fake_company),
        patch("app.services.group_perimeter.unite_legale_by_siren", new_callable=AsyncMock, return_value=None),
        patch("app.services.group_perimeter.confirm_group_head", return_value=confirmed),
        patch("app.services.group_perimeter.search_companies", side_effect=_registry({})),
    ):
        out = asyncio.run(build_group_perimeter("500569405"))
    assert out is not None
    assert out["rootSiren"] == "500569405" and out["headSiren"] == "306138900"
    assert out["entities"][0]["siren"] == "306138900"
    assert "500569405" in [e["siren"] for e in out["entities"]]


def test_tete_non_confirmee_au_registre_le_groupe_n_est_pas_devine() -> None:
    root = _profile(
        "500569405",
        "DECATHLON FRANCE",
        [("777777777", "SOUS FILIALE")],
        GroupAffiliation(role="filiale", head_siren="306138900", head_name="DECATHLON SE"),
    )
    with (
        patch("app.services.group_perimeter.get_company", new_callable=AsyncMock, return_value=root),
        patch("app.services.group_perimeter.unite_legale_by_siren", new_callable=AsyncMock, return_value=None),
        patch("app.services.group_perimeter.confirm_group_head", return_value=None),
        patch("app.services.group_perimeter.search_companies", side_effect=_registry({})),
    ):
        out = asyncio.run(build_group_perimeter("500569405"))
    assert out is not None
    assert out["headSiren"] is None
    assert [e["siren"] for e in out["entities"]] == ["500569405", "777777777"]


def test_seize_entites_au_plus_et_l_entite_tapee_reste_dedans() -> None:
    subs = [(str(100000000 + i), f"FILIALE {i}") for i in range(30)]
    head = _profile("306138900", "DECATHLON SE", subs)
    with (
        patch("app.services.group_perimeter.get_company", new_callable=AsyncMock, return_value=head),
        patch("app.services.group_perimeter.search_companies", side_effect=_registry({})),
    ):
        out = asyncio.run(build_group_perimeter("306138900"))
    assert out is not None
    assert len(out["entities"]) == 16 and out["truncated"] is True
    assert out["entities"][0]["siren"] == "306138900"


def test_un_nom_ne_fait_pas_une_entite_sans_siren() -> None:
    head = _profile("306138900", "DECATHLON SE", [])
    head.subsidiaries = [RelatedCompany(id="x", siren=None, name="DECATHLON QUELQUE CHOSE")]
    with (
        patch("app.services.group_perimeter.get_company", new_callable=AsyncMock, return_value=head),
        patch("app.services.group_perimeter.search_companies", side_effect=_registry({})),
    ):
        out = asyncio.run(build_group_perimeter("306138900"))
    assert out is not None
    assert [e["siren"] for e in out["entities"]] == ["306138900"]


def test_region_d_un_departement_et_inconnu_rend_none() -> None:
    assert region_of_department("59") == "Hauts-de-France"
    assert region_of_department("2A") == "Corse"
    assert region_of_department("") is None
    assert region_of_department("ZZ") is None


def test_endpoint_rend_le_perimetre(client: TestClient) -> None:
    with (
        patch("app.services.group_perimeter.get_company", new_callable=AsyncMock, return_value=HEAD),
        patch("app.services.group_perimeter.search_companies", side_effect=_registry(ROWS)),
    ):
        res = client.get("/companies/306138900/group-perimeter")
    assert res.status_code == 200
    assert res.json()["entities"][1]["name"] == "DECATHLON FRANCE"


def test_endpoint_source_muette_ou_en_panne_rend_null_jamais_5xx(client: TestClient) -> None:
    for exc in (
        PappersNoResultError("0"),
        PappersUnavailableError(503, "upstream_error", "boom"),
        ValueError("no key"),
    ):
        with patch("app.services.group_perimeter.get_company", new_callable=AsyncMock, side_effect=exc):
            res = client.get("/companies/306138900/group-perimeter")
        assert res.status_code == 200
        assert res.json() is None


def test_endpoint_refuse_un_siren_mal_forme(client: TestClient) -> None:
    res = client.get("/companies/DECATHLON/group-perimeter")
    assert res.status_code == 422
