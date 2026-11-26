"""#3983.1 (#3705.3) — siège / implantation / équipe : ce que la source SAIT.

L'API publique « Recherche d'entreprises » (INSEE, sans clé) porte, sur chaque
entreprise, le SIÈGE (`siege`) et, quand une zone département/région est
demandée, les établissements qui ont fait matcher cette zone
(`matching_etablissements` : `siret`, `est_siege`, `etat_administratif`,
`libelle_commune`, `code_postal`, `region`). Fixture VERBATIM : ARQUUS, siège à
Versailles (78), un établissement à Garchizy (58) en Bourgogne-Franche-Comté.

« Équipe » (l'effectif LOCAL d'un établissement) n'est pas dans cette source :
elle publie une tranche d'effectif de l'ENTREPRISE, jamais d'un site. Les tests
verrouillent que rien ne l'invente.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.services.company_filters import CompanyDiscoveryFilters
from app.services.data_sources.recherche_entreprises import _list_row, covers_filters
from app.services.site_geography import describe_geography, site_geography

FIXTURE = Path(__file__).parent / "fixtures" / "discover_establishment" / "arquus_bfc_dept.json"
ARQUUS = json.loads(FIXTURE.read_text(encoding="utf-8"))["results"][0]
BFC = ["21", "25", "39", "58", "70", "71", "89", "90"]


def _row(siege: dict, matching: list[dict]) -> dict:
    return {"siren": "123456789", "nom_complet": "ACME", "siege": siege, "matching_etablissements": matching}


def _site(siret: str, commune: str, cp: str, region: str, *, siege: bool = False, etat: str = "A") -> dict:
    return {
        "siret": siret,
        "libelle_commune": commune,
        "code_postal": cp,
        "region": region,
        "est_siege": siege,
        "etat_administratif": etat,
    }


def test_no_zone_means_no_geography_block() -> None:
    """Sans zone demandée, rien n'est dit : le chemin reste byte-identique."""
    assert site_geography(ARQUUS, CompanyDiscoveryFilters(naf_code="62.02A")) is None


def test_headquarters_elsewhere_and_a_site_in_the_zone() -> None:
    geo = site_geography(ARQUUS, CompanyDiscoveryFilters(departments=BFC))
    assert geo is not None
    assert geo["basis"] == "establishment"
    assert geo["headquarters"] == {"city": "VERSAILLES", "department": "78"}
    assert geo["siteCount"] == 1
    assert geo["sites"] == [{"siret": "66204340500106", "city": "GARCHIZY", "department": "58", "region": "27"}]


def test_headquarters_inside_the_zone_is_headquarters_basis() -> None:
    row = _row(
        {"libelle_commune": "LYON", "departement": "69", "code_postal": "69003", "etat_administratif": "A"},
        [_site("1", "LYON", "69003", "84", siege=True), _site("2", "GRENOBLE", "38000", "84")],
    )
    geo = site_geography(row, CompanyDiscoveryFilters(regions=["84"]))
    assert geo is not None
    assert geo["basis"] == "headquarters"
    # Le siège n'est pas compté comme « autre établissement ».
    assert geo["siteCount"] == 1
    assert [s["city"] for s in geo["sites"]] == ["GRENOBLE"]


def test_closed_establishments_are_never_counted() -> None:
    row = _row(
        {"libelle_commune": "PARIS", "departement": "75", "etat_administratif": "A"},
        [_site("1", "LYON", "69003", "84", etat="C"), _site("2", "ANNECY", "74000", "84")],
    )
    geo = site_geography(row, CompanyDiscoveryFilters(regions=["84"]))
    assert geo is not None
    assert geo["siteCount"] == 1
    assert [s["city"] for s in geo["sites"]] == ["ANNECY"]


def test_duplicate_sirets_are_counted_once() -> None:
    dup = _site("9", "ANNECY", "74000", "84")
    row = _row({"departement": "75", "libelle_commune": "PARIS"}, [dup, dict(dup)])
    geo = site_geography(row, CompanyDiscoveryFilters(regions=["84"]))
    assert geo is not None and geo["siteCount"] == 1


def test_nothing_matching_in_the_zone_is_unknown_not_zero() -> None:
    """La source ne PROUVE aucun site dans la zone : pas de bloc, pas de « 0 »."""
    row = _row({"departement": "75", "libelle_commune": "PARIS"}, [])
    assert site_geography(row, CompanyDiscoveryFilters(regions=["84"])) is None


def test_the_source_never_provides_local_headcount() -> None:
    geo = site_geography(ARQUUS, CompanyDiscoveryFilters(departments=BFC))
    assert geo is not None
    assert not any("headcount" in key.lower() or "team" in key.lower() for key in geo)
    assert all(not any("headcount" in k.lower() for k in site) for site in geo["sites"])


def test_sentence_says_the_basis() -> None:
    geo = site_geography(ARQUUS, CompanyDiscoveryFilters(departments=BFC))
    assert describe_geography(geo, zone_label="Bourgogne-Franche-Comté") == (
        "siège à Versailles (78), 1 établissement en Bourgogne-Franche-Comté"
    )


def test_sentence_plural_and_region_label_from_code() -> None:
    row = _row(
        {"libelle_commune": "PARIS", "departement": "75", "etat_administratif": "A"},
        [_site("1", "LYON", "69003", "84"), _site("2", "ANNECY", "74000", "84"), _site("3", "GRENOBLE", "38000", "84")],
    )
    geo = site_geography(row, CompanyDiscoveryFilters(regions=["84"]))
    assert describe_geography(geo) == "siège à Paris (75), 3 établissements en Auvergne-Rhône-Alpes"


def test_sentence_headquarters_in_zone_without_other_site() -> None:
    row = _row(
        {"libelle_commune": "LYON", "departement": "69", "etat_administratif": "A"},
        [_site("1", "LYON", "69003", "84", siege=True)],
    )
    geo = site_geography(row, CompanyDiscoveryFilters(regions=["84"]))
    assert describe_geography(geo) == "siège à Lyon (69), en Auvergne-Rhône-Alpes"
    # Une zone de départements n'a pas de nom de région : on dit « dans la zone ».
    by_department = site_geography(row, CompanyDiscoveryFilters(departments=["69"]))
    assert describe_geography(by_department) == "siège à Lyon (69), dans la zone"


def test_sentence_is_none_without_geography() -> None:
    assert describe_geography(None) is None


# ── _list_row : le bloc voyage, et le filtre « siège » ─────────────────────────


def test_list_row_carries_the_geography_when_a_zone_is_asked() -> None:
    row = _list_row(ARQUUS, CompanyDiscoveryFilters(departments=BFC))
    assert row is not None
    assert row["geography"]["basis"] == "establishment"
    assert row["geography"]["headquarters"]["city"] == "VERSAILLES"


def test_list_row_has_no_geography_key_without_a_zone() -> None:
    row = _list_row(ARQUUS, CompanyDiscoveryFilters(naf_code="62.02A"))
    assert row is not None
    assert "geography" not in row


def test_headquarters_only_keeps_rows_whose_siege_is_in_the_zone() -> None:
    """« siège dans <zone> » ≠ « implantation dans <zone> » : ARQUUS (siège 78)
    sort quand on demande le siège en Bourgogne-Franche-Comté, reste quand on
    demande une implantation."""
    assert _list_row(ARQUUS, CompanyDiscoveryFilters(departments=BFC, on_headquarters_only=True)) is None
    assert _list_row(ARQUUS, CompanyDiscoveryFilters(departments=BFC, on_headquarters_only=False)) is not None
    assert _list_row(ARQUUS, CompanyDiscoveryFilters(departments=BFC)) is not None


def test_headquarters_only_keeps_a_siege_proven_in_the_zone() -> None:
    row = _row(
        {"libelle_commune": "LYON", "departement": "69", "etat_administratif": "A"},
        [_site("1", "LYON", "69003", "84", siege=True)],
    )
    assert _list_row(row, CompanyDiscoveryFilters(regions=["84"], on_headquarters_only=True)) is not None


def test_headquarters_only_drops_a_siege_that_cannot_be_proven() -> None:
    """Département du siège hors zone et aucune ligne `est_siege` : non prouvé,
    donc écarté — jamais gardé « au bénéfice du doute »."""
    row = _row({"libelle_commune": "PARIS", "departement": "75"}, [_site("2", "LYON", "69003", "84")])
    assert _list_row(row, CompanyDiscoveryFilters(regions=["84"], on_headquarters_only=True)) is None


def test_registry_covers_headquarters_only_when_a_zone_is_asked() -> None:
    zone = CompanyDiscoveryFilters(departments=BFC, on_headquarters_only=True)
    assert covers_filters(zone) is True
    # Sans zone, « siège seulement » n'a rien à filtrer côté registre : Pappers.
    assert covers_filters(CompanyDiscoveryFilters(naf_code="62.02A", on_headquarters_only=True)) is False


# ---- #5008.1 — le chemin SIGNAUX porte aussi la base de la zone ----


def test_signals_geography_headquarters_in_zone_with_site_cities() -> None:
    from app.services.site_geography import geography_from_signals

    geo = geography_from_signals(
        "VILLENEUVE-D'ASCQ", "59", "59", [{"siteCity": "Lille"}, {"siteCity": "Lille"}, {"siteCity": "villeneuve-d'ascq"}]
    )
    assert geo is not None
    assert geo["basis"] == "headquarters"
    assert geo["headquarters"] == {"city": "VILLENEUVE-D'ASCQ", "department": "59"}
    assert geo["siteCount"] == 1
    assert [s["city"] for s in geo["sites"]] == ["Lille"]


def test_signals_geography_establishment_only_when_headquarters_outside_zone() -> None:
    from app.services.site_geography import geography_from_signals

    geo = geography_from_signals("PARIS", "75", "59", [{"siteCity": "Lille"}])
    assert geo is not None and geo["basis"] == "establishment" and geo["siteCount"] == 1


def test_signals_geography_absent_without_proof() -> None:
    from app.services.site_geography import geography_from_signals

    assert geography_from_signals("PARIS", "75", "59", []) is None  # hors zone, aucun site : rien
    assert geography_from_signals("LILLE", "59", None, [{"siteCity": "Lille"}]) is None  # aucune zone demandée
