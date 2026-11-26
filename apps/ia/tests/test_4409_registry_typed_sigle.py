"""#4409.1 / #4409.2 — recette prod du 25/10 : le sigle TAPÉ ne rappelait le groupe que sur le chemin
de la source facturée. Sur le chemin registre, le rappel exigeait une coquille publiant « (OGF) » dans la page ;
quand la page ne contient ni holding ni tête de groupe (établissement de 10-19 sal. + OGF SERVICES FUNERAIRES),
rien n'était demandé et l'établissement passait devant.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient


def _row(siren: str, name: str, tranche: str | None, etabs: int | None, size: str | None = None, legal: str | None = None) -> dict:
    return {
        "source": "recherche-entreprises",
        "siren": siren,
        "name": name,
        "legalName": legal or name,
        "headcountTranche": tranche,
        "establishmentCount": etabs,
        "sizeClass": size,
        "isActive": True,
    }


SAINT_VICTORET = _row("333333333", "SERVICES FUNERAIRES", "11", 1)  # 10-19 sal., Saint-Victoret
SERVICES = _row("828160069", "OGF SERVICES FUNERAIRES", "02", 1571, "GE")  # 3-5 sal.
GROUPE = _row("542076799", "OGF", "52", 3073, "GE")
HOLDING = _row(
    "100497288",
    "OPERATEUR ET GESTIONNAIRE FUNERAIRE (OGF)",
    "00",
    1,
    legal="OPERATEUR ET GESTIONNAIRE FUNERAIRE",
)


def _search(client: TestClient, q: str, pages: dict[str, list[dict]]) -> list[str]:
    async def fake(query: str, limit: int) -> tuple[list[dict], bool]:
        return list(pages.get(query, [])), False

    with (
        patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=[]),
        patch("app.routers.companies._registry_suggestions", new=AsyncMock(side_effect=fake)),
    ):
        res = client.get("/companies/search", params={"q": q, "limit": 5})
    return [s["siren"] for s in res.json()["suggestions"]]


def test_typed_sigle_recalls_group_when_page_has_no_shell_and_no_head(client: TestClient) -> None:
    q = "OGF service funéraire"
    sirens = _search(client, q, {q: [SAINT_VICTORET, SERVICES], "OGF": [GROUPE, SERVICES, HOLDING]})
    assert sirens[0] == GROUPE["siren"]
    assert {SAINT_VICTORET["siren"], SERVICES["siren"]} <= set(sirens)  # rien n'est retiré


def test_holding_zero_employee_never_leads_when_group_exists(client: TestClient) -> None:
    q = "OGF opérateur et gestionnaire funéraire"
    sirens = _search(client, q, {q: [HOLDING, SAINT_VICTORET], "OGF": [GROUPE, HOLDING]})
    assert sirens[0] == GROUPE["siren"]
    assert HOLDING["siren"] in sirens


def test_single_word_query_triggers_no_extra_recall(client: TestClient) -> None:
    calls: list[str] = []

    async def fake(query: str, limit: int) -> tuple[list[dict], bool]:
        calls.append(query)
        return [GROUPE], False

    with (
        patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=[]),
        patch("app.routers.companies._registry_suggestions", new=AsyncMock(side_effect=fake)),
    ):
        client.get("/companies/search", params={"q": "OGF", "limit": 5})
    assert calls == ["OGF"]
