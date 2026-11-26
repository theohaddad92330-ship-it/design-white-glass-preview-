"""#4409.1 / #4409.2 — suite de la recette prod du 22/10 : la 1re suggestion était un
établissement de 10-19 salariés SANS LIEN avec OGF, la holding à 0 salarié suivait.

Cause : le rappel par sigle ne partait que si la 1re ligne était elle-même une
coquille ; un homonyme de descriptif (« service funéraire ») la précédait, donc la
tête de groupe n'était jamais demandée. Et le sigle « (OGF) » de la holding, tapé
par l'utilisateur, ne comptait pas comme lien de nom.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.services.homonym_disambiguation import order_prospect_suggestions


def _row(siren: str, name: str, tranche: str | None, etabs: int | None, legal: str | None = None) -> dict:
    return {
        "source": "recherche-entreprises",
        "siren": siren,
        "name": name,
        "legalName": legal or name,
        "headcountTranche": tranche,
        "establishmentCount": etabs,
        "isActive": True,
    }


# Fixtures: aucun appel réseau.
HOMONYME = _row("111111111", "SERVICE FUNERAIRE DU CENTRE", "11", 1)  # 10-19 salariés, sans lien avec OGF
HOLDING = _row("100497288", "OPERATEUR ET GESTIONNAIRE FUNERAIRE (OGF)", "00", 1, legal="OPERATEUR ET GESTIONNAIRE FUNERAIRE")
GROUPE = _row("542076799", "OGF", "52", 3073)
Q = "OGF service funéraire"


def _search(client: TestClient, pages: dict[str, list[dict]]) -> list[str]:
    async def fake(query: str, limit: int) -> tuple[list[dict], bool]:
        return list(pages.get(query, [])), False

    with (
        patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=[]),
        patch("app.routers.companies._registry_suggestions", new=AsyncMock(side_effect=fake)),
    ):
        res = client.get("/companies/search", params={"q": Q, "limit": 5})
    return [s["siren"] for s in res.json()["suggestions"]]


def test_sigle_recall_runs_even_when_an_unrelated_namesake_leads(client: TestClient) -> None:
    sirens = _search(client, {Q: [HOMONYME, HOLDING], "OGF": [GROUPE, HOLDING]})
    assert sirens[0] == GROUPE["siren"]
    assert {HOMONYME["siren"], HOLDING["siren"]} <= set(sirens)  # rien n'est retiré


def test_typed_sigle_links_the_holding_before_an_unrelated_namesake() -> None:
    # Même si la tête de groupe reste introuvable : la holding porte « (OGF) », tapé.
    ordered = [r["siren"] for r in order_prospect_suggestions(Q, [HOMONYME, HOLDING])]
    assert ordered == [HOLDING["siren"], HOMONYME["siren"]]


def test_sigle_not_typed_gives_no_link() -> None:
    # Le test sait dire NON : sans « OGF » dans la saisie, le sigle ne pèse pas.
    ordered = [r["siren"] for r in order_prospect_suggestions("service funéraire", [HOLDING, HOMONYME])]
    assert ordered[0] == HOMONYME["siren"]
