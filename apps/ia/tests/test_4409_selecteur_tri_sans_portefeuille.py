"""#4409.1 / #4409.2 — recette prod 27/10 : « OGF » dans le sélecteur de /search.

Rangs 2 à 5 = quatre homonymes à 0-2 salariés (dont une SCI). Le tri doit tenir SANS l'indice « déjà dans le
portefeuille » (une information à afficher, jamais un rang) : entité opérationnelle → petit établissement →
effectif non renseigné (nommé, jamais « 0 ») → homonyme d'activité étrangère (SCI, holding sans salarié).
Rien n'est retiré.
"""

from __future__ import annotations

from app.services.homonym_disambiguation import order_prospect_suggestions


def _row(siren: str, name: str, tranche: str | None, etabs: int | None = None, naf: str | None = "96.03Z") -> dict:
    return {
        "source": "recherche-entreprises",
        "siren": siren,
        "name": name,
        "legalName": name,
        "headcountTranche": tranche,
        "establishmentCount": etabs,
        "nafCode": naf,
        "isActive": True,
    }


SCI = _row("100000001", "SCI OGF", "00", 1, naf="68.20B")
GALFINGUE = _row("100000002", "OGF", "01", 1)
MARSEILLE = _row("100000003", "OGF", "00", 1)
UNKNOWN = _row("100000004", "OGF", None, None)
OPERATIONAL = _row("100000005", "OGF", "11", 3)  # 10-19 salariés, nom exact


def _order(rows: list[dict]) -> list[str]:
    return [r["siren"] for r in order_prospect_suggestions("OGF", rows)]


def test_operational_entity_beats_unknown_headcount_beats_nothing_removed() -> None:
    sirens = _order([SCI, GALFINGUE, MARSEILLE, UNKNOWN, OPERATIONAL])
    assert sirens[0] == OPERATIONAL["siren"]
    assert set(sirens) == {r["siren"] for r in (SCI, GALFINGUE, MARSEILLE, UNKNOWN, OPERATIONAL)}


def test_order_is_establishment_then_unknown_then_foreign_activity() -> None:
    sirens = _order([SCI, UNKNOWN, MARSEILLE, GALFINGUE, OPERATIONAL])
    assert sirens == [
        OPERATIONAL["siren"],
        GALFINGUE["siren"],  # à effectif égal… 1-2 salariés passe devant 0
        MARSEILLE["siren"],
        UNKNOWN["siren"],
        SCI["siren"],
    ]


def test_sci_never_ahead_of_a_same_name_establishment_even_when_registry_lists_it_first() -> None:
    sirens = _order([SCI, MARSEILLE])
    assert sirens == [MARSEILLE["siren"], SCI["siren"]]


def test_sci_alone_is_still_proposed() -> None:
    assert _order([SCI]) == [SCI["siren"]]


def test_pappers_path_ranks_sci_and_unknown_headcount_after_operational_entity() -> None:
    from unittest.mock import AsyncMock, patch

    from fastapi.testclient import TestClient

    from app.main import app
    from app.services.pappers.models import CompanySearchHit

    def hit(siren: str, name: str, label: str | None, naf: str | None) -> CompanySearchHit:
        return CompanySearchHit.model_validate(
            {"siren": siren, "nom_entreprise": name, "effectif": label, "code_naf": naf}
        )

    hits = [
        hit("100000001", "SCI OGF", "0 salarié", "68.20B"),
        hit("100000004", "OGF", None, None),
        hit("100000005", "OGF", "10 à 19 salariés", "96.03Z"),
    ]
    with (
        patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=hits),
        patch("app.routers.companies._registry_suggestions", new_callable=AsyncMock, return_value=([], False)),
    ):
        res = TestClient(app).get("/companies/search?q=OGF&limit=5")
    assert [s["siren"] for s in res.json()["suggestions"]] == ["100000005", "100000004", "100000001"]
