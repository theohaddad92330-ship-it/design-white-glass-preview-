"""#4409.1 / #4409.2 / #4410.1 — recette PROD du 22/10 : les données EXACTES du registre.

Les tests d'origine passaient sur des lignes fabriquées (« OGF » ×3, même nom). En
production le nom tapé désigne une entité PRÉCISE : la bande de nom écrasait donc la
taille, et la holding à 0 salarié gagnait par son nom exact.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.services.company_filters import parse_headcount_label
from app.services.pappers.models import CompanySearchHit


def _row(siren: str, name: str, tranche: str | None, etabs: int | None, size: str | None, legal: str | None = None) -> dict:
    return {
        "source": "recherche-entreprises",
        "siren": siren,
        "name": name,
        "legalName": legal or name,
        "headcountTranche": tranche,
        "establishmentCount": etabs,
        "sizeClass": size,
        "isActive": True,
        "city": "Courbevoie",
    }


SERVICES = _row("828160069", "OGF SERVICES FUNERAIRES", "02", 1571, "GE")
GROUPE = _row("542076799", "OGF", "52", 3073, "GE")
HOLDING = _row(
    "100497288",
    "OPERATEUR ET GESTIONNAIRE FUNERAIRE (SERENITE HARMONIE FUNERAIRE, EXEQUIAS AGERE) (OGF)",
    "00",
    1,
    None,
    legal="OPERATEUR ET GESTIONNAIRE FUNERAIRE",
)
PF = _row("818840175", "POMPES FUNEBRES DE FRANCE", "03", 5, "PME")


def _search(client: TestClient, q: str, pages: dict[str, list[dict]]) -> list[str]:
    async def fake(query: str, limit: int) -> tuple[list[dict], bool]:
        return list(pages.get(query, pages.get("*", []))), False

    with (
        patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=[]),
        patch("app.routers.companies._registry_suggestions", new=AsyncMock(side_effect=fake)),
    ):
        res = client.get("/companies/search", params={"q": q, "limit": 5})
    return [s["siren"] for s in res.json()["suggestions"]]


def test_brand_typed_with_descriptor_puts_group_head_before_small_unit(client: TestClient) -> None:
    # « OGF service funéraire » : l'unité à « 3 à 5 salariés » ne passe pas devant la tête de groupe.
    sirens = _search(client, "OGF service funéraire", {"*": [SERVICES, PF, GROUPE]})
    assert sirens[0] == GROUPE["siren"]
    assert set(sirens) == {SERVICES["siren"], PF["siren"], GROUPE["siren"]}


def test_holding_alone_in_first_page_is_never_head_when_its_sigle_finds_the_group(client: TestClient) -> None:
    # La holding à 0 salarié porte le nom EXACT tapé : seule dans la page, elle gagnait.
    # Son sigle « (OGF) » ramène la tête de groupe, et le tri s'applique APRÈS la fusion.
    pages = {"OGF opérateur et gestionnaire funéraire": [HOLDING], "OGF": [GROUPE, SERVICES, HOLDING]}
    sirens = _search(client, "OGF opérateur et gestionnaire funéraire", pages)
    assert sirens[0] == GROUPE["siren"]
    assert HOLDING["siren"] in sirens  # proposée, jamais filtrée
    assert sirens.index(HOLDING["siren"]) > 0


def test_holding_stays_when_it_is_the_only_entity_known(client: TestClient) -> None:
    sirens = _search(client, "OGF opérateur et gestionnaire funéraire", {"*": [HOLDING]})
    assert sirens == [HOLDING["siren"]]


def test_pappers_hits_with_textual_headcount_only_are_ranked_by_it(client: TestClient) -> None:
    def hit(siren: str, name: str, label: str) -> CompanySearchHit:
        return CompanySearchHit.model_validate({"siren": siren, "nom_entreprise": name, "effectif": label})

    hits = [
        hit("828160069", "OGF SERVICES FUNERAIRES", "Entre 3 et 5 salariés"),
        hit("100497288", "OPERATEUR ET GESTIONNAIRE FUNERAIRE", "0 salarié"),
        hit("542076799", "OGF", "5 000 à 9 999 salariés"),
    ]
    with patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=hits):
        res = client.get("/companies/search", params={"q": "OGF service funéraire", "limit": 5})
    sirens = [s["siren"] for s in res.json()["suggestions"]]
    assert sirens[0] == "542076799"


@pytest.mark.parametrize(
    ("label", "expected"),
    [
        ("Entre 3 et 5 salariés", 3),
        ("3 à 5 salariés", 3),
        ("0 salarié", 0),
        ("Aucun salarié", 0),
        ("5 000 à 9 999 salariés", 5000),
        ("10 000 salariés et plus", 10000),
        ("1 salarié", 1),
        ("Non renseigné", None),
        ("", None),
        (None, None),
    ],
)
def test_parse_headcount_label(label: str | None, expected: int | None) -> None:
    assert parse_headcount_label(label) == expected
