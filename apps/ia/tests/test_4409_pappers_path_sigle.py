"""#4409.1 / #4409.2 — RÉFUTÉ en recette prod 23/10 : boîte Analyser (/search).

« OGF service funéraire » → 1re suggestion « SERVICES FUNERAIRES » (10-19 sal.) ; « OGF opérateur et gestionnaire
funéraire » → 1re = la holding à 0 salarié. Les correctifs b1a9476314 / fc49787ba2 ne rappelaient la tête de groupe
par son sigle que sur le chemin REGISTRE ; le chemin servi quand la source facturée répond (``_order_hits``) ne
triait que sa page de 5, où la tête de groupe n'est pas. Le sigle TAPÉ (« OGF ») est maintenant relu sur ce chemin
aussi, la fusion se fait par SIREN, et le même barème trie le tout.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.services.pappers.models import CompanySearchHit


def _hit(siren: str, name: str, label: str) -> CompanySearchHit:
    return CompanySearchHit.model_validate({"siren": siren, "nom_entreprise": name, "effectif": label})


SERVICES = _hit("401234567", "SERVICES FUNERAIRES", "10 à 19 salariés")
PF = _hit("818840175", "POMPES FUNEBRES DE FRANCE", "6 à 9 salariés")
GROUPE = _hit("542076799", "OGF", "5 000 à 9 999 salariés")
HOLDING = _hit("100497288", "OPERATEUR ET GESTIONNAIRE FUNERAIRE", "0 salarié")


def _search(client: TestClient, q: str, pages: dict[str, list[CompanySearchHit]]) -> tuple[list[str], list[str]]:
    asked: list[str] = []

    async def fake(name: str, *, limit: int = 5, **_: object) -> list[CompanySearchHit]:
        asked.append(name)
        return list(pages.get(name, []))

    with patch("app.routers.companies.search_company_suggestions", new=AsyncMock(side_effect=fake)):
        res = client.get("/companies/search", params={"q": q, "limit": 5})
    return [s["siren"] for s in res.json()["suggestions"]], asked


def test_ogf_service_funeraire_met_la_tete_de_groupe_en_tete(client: TestClient) -> None:
    sirens, asked = _search(
        client, "OGF service funéraire", {"OGF service funéraire": [SERVICES, PF], "OGF": [GROUPE, HOLDING]}
    )
    assert asked == ["OGF service funéraire", "OGF"]
    assert sirens[0] == GROUPE.siren
    assert SERVICES.siren in sirens  # proposée, jamais filtrée


def test_la_holding_a_zero_salarie_n_est_jamais_en_tete_quand_le_sigle_est_tape(client: TestClient) -> None:
    q = "OGF opérateur et gestionnaire funéraire"
    sirens, _ = _search(client, q, {q: [HOLDING], "OGF": [GROUPE, HOLDING]})
    assert sirens[0] == GROUPE.siren
    assert sirens.index(HOLDING.siren) > 0


def test_sait_dire_non_aucun_rappel_sans_sigle_tape_ni_quand_le_sigle_est_toute_la_saisie(client: TestClient) -> None:
    _, asked = _search(client, "Capgemini Technology Services", {"Capgemini Technology Services": [GROUPE]})
    assert asked == ["Capgemini Technology Services"]
    _, asked = _search(client, "OGF", {"OGF": [GROUPE, HOLDING]})
    assert asked == ["OGF"]
