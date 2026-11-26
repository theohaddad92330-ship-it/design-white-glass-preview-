"""#4409 — le tri des homonymes s'applique aux DEUX sources, et la tête
opérationnelle passe devant la holding (proposée, jamais filtrée)."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.services.pappers.models import CompanySearchHit


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


def test_registry_ordering_puts_operational_head_before_holding(client: TestClient) -> None:
    rows = [
        _registry_row("100000001", "OGF", "02", 1),  # établissement 3-5 salariés
        _registry_row("100000002", "OGF", "00", 0),  # holding 0 salarié
        _registry_row("100000003", "OGF", "52", 1000),  # tête opérationnelle
    ]
    with (
        patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=[]),
        patch("app.routers.companies._registry_suggestions", new_callable=AsyncMock, return_value=(rows, False)),
    ):
        res = client.get("/companies/search?q=OGF&limit=5")

    sirens = [s["siren"] for s in res.json()["suggestions"]]
    assert sirens[0] == "100000003"
    assert set(sirens) == {"100000001", "100000002", "100000003"}  # holding proposée, jamais filtrée
    assert sirens.index("100000002") > 0


def test_pappers_ordering_puts_operational_head_before_holding(client: TestClient) -> None:
    def hit(siren: str, tranche_min: int, tranche_max: int) -> CompanySearchHit:
        return CompanySearchHit.model_validate(
            {"siren": siren, "nom_entreprise": "OGF", "effectif_min": tranche_min, "effectif_max": tranche_max}
        )

    hits = [hit("100000001", 3, 5), hit("100000002", 0, 0), hit("100000003", 5000, 9999)]
    with patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=hits):
        res = client.get("/companies/search?q=OGF&limit=5")

    sirens = [s["siren"] for s in res.json()["suggestions"]]
    assert sirens[0] == "100000003"
    assert set(sirens) == {"100000001", "100000002", "100000003"}
    assert sirens.index("100000002") > 0
