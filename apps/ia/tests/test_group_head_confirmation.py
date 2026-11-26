"""#3917 — le NOM de la tête de groupe est confirmé par le registre (Sirene) avant tout rattachement.

Le graphe Pappers donne un SIREN et un nom ; le registre est l'arbitre. Registre muet (pas de clé, panne,
SIREN inconnu) → comportement d'avant, strict no-op. Registre qui répond un AUTRE nom → pas de tête : un
rattachement au groupe ne se devine pas.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.services.group_head_confirm import confirm_group_head
from app.services.insee_sirene import InseeUniteLegale
from app.services.pappers.models import CompanyProfile, GroupAffiliation


def _unite(denomination: str) -> InseeUniteLegale:
    return InseeUniteLegale(
        siren="222222222",
        denomination=denomination,
        naf_code=None,
        naf_is_it=False,
        headcount_range=None,
        legal_category=None,
        is_active=True,
    )


def _filiale(name: str | None = "BOUYGUES") -> GroupAffiliation:
    return GroupAffiliation(role="filiale", head_siren="222222222", head_name=name)


def test_le_nom_du_registre_confirme_et_devient_le_nom_canonique() -> None:
    out = confirm_group_head(_filiale("Bouygues"), _unite("BOUYGUES SA"))
    assert out is not None
    assert out.head_name == "BOUYGUES SA"
    assert out.head_siren == "222222222"


def test_un_autre_nom_au_registre_retire_la_tete() -> None:
    assert confirm_group_head(_filiale("ETG"), _unite("RENAULT SAS")) is None


def test_un_nom_qui_en_contient_un_autre_nest_pas_confirme() -> None:
    # « Renault » n'est pas « Renault Trucks » : même garde que l'homonyme de la presse.
    assert confirm_group_head(_filiale("RENAULT"), _unite("RENAULT TRUCKS")) is None


def test_registre_muet_ne_change_rien() -> None:
    aff = _filiale()
    assert confirm_group_head(aff, None) is aff


def test_la_racine_groupe_nest_pas_concernee() -> None:
    aff = GroupAffiliation(role="groupe", head_siren="222222222", head_name="X")
    assert confirm_group_head(aff, _unite("AUTRE CHOSE")) is aff


def test_une_tete_sans_nom_prend_le_nom_du_registre() -> None:
    out = confirm_group_head(_filiale(None), _unite("BOUYGUES SA"))
    assert out is not None and out.head_name == "BOUYGUES SA"


def _profile(aff: GroupAffiliation) -> CompanyProfile:
    profile = CompanyProfile.model_validate({"siren": "326300159", "nom_entreprise": "TF1"})
    profile.group_affiliation = aff
    return profile


def test_endpoint_consulte_le_registre_et_renvoie_null_si_le_nom_diverge(client: TestClient) -> None:
    with (
        patch("app.routers.companies.get_company", new_callable=AsyncMock, return_value=_profile(_filiale("ETG"))),
        patch(
            "app.routers.companies.unite_legale_by_siren", new_callable=AsyncMock, return_value=_unite("RENAULT SAS")
        ),
    ):
        res = client.get("/companies/326300159/group-affiliation")
    assert res.status_code == 200
    assert res.json() is None


def test_endpoint_registre_en_panne_garde_le_comportement_davant(client: TestClient) -> None:
    with (
        patch("app.routers.companies.get_company", new_callable=AsyncMock, return_value=_profile(_filiale())),
        patch("app.routers.companies.unite_legale_by_siren", new_callable=AsyncMock, side_effect=RuntimeError("boom")),
    ):
        res = client.get("/companies/326300159/group-affiliation")
    assert res.json() == {"role": "filiale", "headSiren": "222222222", "headName": "BOUYGUES"}
