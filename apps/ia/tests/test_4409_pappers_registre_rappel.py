"""#4409.1 / #4409.2 — inchangé en recette prod le 26/10 (38e9fc6e8a), chemin Pappers.

« OGF service funéraire » → tête = SERVICES FUNERAIRES (10-19 salariés), les cinq suivantes à
0-5 salariés, AUCUNE tête de groupe. Le rappel par sigle ne relisait que Pappers, dont la page de
cinq pour « OGF » ne contient pas le groupe (le registre libre, lui, le rend : 542076799, 5 000 à
9 999 salariés). Le rappel interroge donc AUSSI le registre libre, fusion par SIREN, et le même
barème trie le tout. Aucune ligne n'est retirée.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.services.pappers.models import CompanySearchHit


def _hit(siren: str, name: str, label: str) -> CompanySearchHit:
    return CompanySearchHit.model_validate({"siren": siren, "nom_entreprise": name, "effectif": label})


SERVICES = _hit("401234567", "SERVICES FUNERAIRES", "10 à 19 salariés")
PETITS = [_hit(f"50000000{i}", f"OGF PARTICIPATIONS {i}", "0 salarié") for i in range(5)]
HOLDING = _hit("100497288", "OPERATEUR ET GESTIONNAIRE FUNERAIRE", "0 salarié")
# Le registre libre : la tête de groupe, tranche INSEE 52 = 5 000 à 9 999 salariés.
GROUPE_REGISTRE = {
    "source": "recherche-entreprises",
    "siren": "542076799",
    "name": "OGF",
    "legalName": "OGF",
    "headcountTranche": "52",
    "establishmentCount": 0,
    "sizeClass": "GE",
    "isActive": True,
}


def _search(client: TestClient, q: str, pappers: dict[str, list[CompanySearchHit]], registre: dict[str, list[dict]]) -> list[str]:
    async def pappers_fake(name: str, *, limit: int = 5, **_: object) -> list[CompanySearchHit]:
        return list(pappers.get(name, []))

    async def registre_fake(query: str, limit: int) -> tuple[list[dict], bool]:
        return list(registre.get(query, [])), False

    with (
        patch("app.routers.companies.search_company_suggestions", new=AsyncMock(side_effect=pappers_fake)),
        patch("app.routers.companies._registry_suggestions", new=AsyncMock(side_effect=registre_fake)),
    ):
        res = client.get("/companies/search", params={"q": q, "limit": 5})
    return [s["siren"] for s in res.json()["suggestions"]]


def test_la_tete_de_groupe_du_registre_passe_devant_l_etablissement_de_10_19(client: TestClient) -> None:
    q = "OGF service funéraire"
    sirens = _search(client, q, {q: [SERVICES, *PETITS[:4]], "OGF": PETITS}, {"OGF": [GROUPE_REGISTRE]})
    assert sirens[0] == GROUPE_REGISTRE["siren"]
    assert SERVICES.siren in sirens  # proposée, jamais filtrée


def test_une_holding_a_zero_salarie_n_est_jamais_en_tete_chemin_pappers(client: TestClient) -> None:
    q = "OGF opérateur et gestionnaire funéraire"
    sirens = _search(client, q, {q: [HOLDING], "OGF": PETITS}, {"OGF": [GROUPE_REGISTRE]})
    assert sirens[0] == GROUPE_REGISTRE["siren"]
    assert sirens.index(HOLDING.siren) > 0


def test_sait_dire_non_sans_sigle_le_registre_n_est_pas_interroge(client: TestClient) -> None:
    q = "Capgemini Technology Services"
    sirens = _search(client, q, {q: [SERVICES]}, {q: [GROUPE_REGISTRE], "OGF": [GROUPE_REGISTRE]})
    assert sirens == [SERVICES.siren]
