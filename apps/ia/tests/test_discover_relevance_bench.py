"""Banc de PERTINENCE de Découvrir — #2490 et #2489.

Les deux retours de Louis que ce banc rend mesurables :

* #2490 — « il me sort très souvent des boîtes qui ne collent pas. Si je veux
  de l'aéronautique sur Toulouse, je veux Airbus […] pas des boîtes au hasard
  où je ne pourrais placer personne » ;
* #2489 — « ça ne m'a ressorti que des trucs liés à la santé ou au public
  alors que j'ai plein d'autres secteurs ».

## Des pages RÉELLES, pas des lignes écrites à la main

Chaque fixture de ``fixtures/discover_bench/`` est la première (ou la seconde)
page que le registre public gouv.fr a rendue le 17/09/2026 pour la requête
écrite dans son ``_query``, réduite aux champs que la projection de la source
lit. Le banc les fait passer par la VRAIE projection (``_list_row``) puis par le
vrai routeur : il mesure ce que l'écran aurait reçu, pas ce qu'on imagine.

Trois faits du registre, mesurés le même jour, expliquent presque tout :

1. ``departement=31`` retient une entreprise dont UN établissement est dans le
   31, pas son siège — la page de ``activite_principale=30.30Z&departement=31``
   n'a que 10 sièges haut-garonnais sur 25, et « AIRBUS OPERATIONS » (siège à
   Toulouse, 10 000 salariés et plus) n'apparaît qu'en page 2 ;
2. le registre classe par taille de réseau : une recherche sur PLUSIEURS
   secteurs en un seul OU (ce que l'écran envoie quand on applique les secteurs
   du profil) rend 25 banques, organismes publics et acteurs de santé
   nationaux — pas une entreprise d'aéronautique ni un éditeur ;
3. le plein-texte (``q``) matche aussi les établissements et les adresses :
   « aéronautique Toulouse » rend la commune de Toulouse, des amicales, et deux
   géants de la restauration collective.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.services.company_filters import CompanyDiscoveryFilters, DegradeReason, degraded_entry
from app.services.data_sources.recherche_entreprises import _list_row

FIXTURES = Path(__file__).parent / "fixtures" / "discover_bench"

AEROSPACE = "30.30Z"
RETAIL_BANKING = "64.19Z,64.92Z,66.19A,66.19B"
HEALTHCARE = "86.10Z,86.21Z,86.22A,86.22B,86.22C,86.23Z,86.90A,86.90B,86.90C,86.90D,86.90E,86.90F,87.10A,87.10B,87.10C"
PUBLIC_SECTOR = "84.11Z,84.12Z,84.13Z,84.21Z,84.22Z,84.23Z,84.24Z,84.25Z,84.30A,84.30B,84.30C"
SOFTWARE_TECH = "58.21Z,58.29A,58.29B,58.29C,62.01Z,62.02A,62.02B,62.03Z,62.09Z,63.11Z,63.12Z"
#: Ce que l'écran envoie quand on applique cinq secteurs du profil : UN OU.
PROFILE_SECTORS = ",".join([AEROSPACE, RETAIL_BANKING, HEALTHCARE, PUBLIC_SECTOR, SOFTWARE_TECH])


def _key(
    codes: str | None, departments: list[str] | None, q: str | None, page: int, *, commune: str | None = None
) -> tuple:
    return (
        frozenset(code for code in (codes or "").split(",") if code),
        tuple(sorted(departments or [])),
        (q or "").strip().lower(),
        (commune or "").strip(),
        page,
    )


def _load_pages() -> dict[tuple, list[dict]]:
    pages: dict[tuple, list[dict]] = {}
    for path in sorted(FIXTURES.glob("*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        query = doc["_query"]
        departments = [query["departement"]] if query.get("departement") else []
        key = _key(
            query.get("activite_principale"),
            departments,
            query.get("q"),
            int(query["page"]),
            commune=query.get("code_commune"),
        )
        rows = [row for row in (_list_row(r, CompanyDiscoveryFilters()) for r in doc["results"]) if row]
        pages[key] = rows
    return pages


PAGES = _load_pages()


def test_the_bench_reads_its_corpus() -> None:
    """Une garde qui ne lit rien est verte pour rien."""
    assert len(PAGES) >= 12
    assert all(len(rows) >= 20 for rows in PAGES.values())


class _Registry:
    """La source gouv.fr rejouée depuis les pages capturées. Une requête qu'on
    n'a pas capturée rend une page VIDE et reste inscrite dans ``misses``."""

    def __init__(self) -> None:
        self.calls: list[tuple] = []
        self.misses: list[tuple] = []

    def _answer(self, filters: CompanyDiscoveryFilters, limit: int, page: int) -> list[dict]:
        departments = list(filters.departments or [])
        if filters.department and filters.department not in departments:
            departments.append(filters.department)
        key = _key(filters.naf_code, departments, filters.q, page, commune=filters.commune_code)
        self.calls.append(key)
        rows = PAGES.get(key)
        if rows is None:
            self.misses.append(key)
            return []
        return [dict(row) for row in rows[:limit]]

    async def first_page(self, filters, limit, degraded=None):
        return self._answer(filters, limit, 1)

    async def page(self, filters, limit, degraded=None, *, page: int = 1):
        return self._answer(filters, limit, page)


async def _no_pappers_key(filters, limit, degraded=None):
    # L'état mesurable : sans clé, la source payante se déclare et se retire.
    if degraded is not None:
        degraded.append(degraded_entry("pappers", DegradeReason.MISSING_API_KEY))
    return []


#: #2490.11 — la SEULE commune que la résolution du banc reconnaît, pour ne
#: jamais taper le réseau gouv.fr pendant les tests (le banc doit rester
#: déterministe et hors-ligne). Champs identiques à ce que `geo_communes.py`
#: rend réellement pour « Toulouse » (mesuré le 17/09/2026).
_TOULOUSE_COMMUNE = {
    "code": "31555",
    "name": "Toulouse",
    "postalCodes": ["31000", "31100", "31200", "31300", "31400", "31500"],
    "latitude": 43.6007,
    "longitude": 1.4328,
    "population": 514819,
    "department": "31",
    "departmentName": "Haute-Garonne",
}


async def _resolve_toulouse_only(city: str, fuzzy: bool = False) -> dict | None:
    from app.services.text_norm import normalize_name

    return _TOULOUSE_COMMUNE if normalize_name(city) == "toulouse" else None


@pytest.fixture
def bench(monkeypatch) -> _Registry:
    registry = _Registry()
    monkeypatch.setattr("app.routers.discover._registry_search", _no_pappers_key)
    monkeypatch.setattr("app.routers.discover._fallback_search", registry.first_page)
    monkeypatch.setattr("app.routers.discover._fallback_search_page", registry.page)
    # #2490.11 — la résolution ville → commune ne doit jamais taper le réseau
    # pendant le banc : seule « Toulouse » résout, tout le reste échoue comme
    # une source muette le ferait.
    monkeypatch.setattr("app.routers.discover._resolve_city_commune", _resolve_toulouse_only)
    return registry


def _run(client: TestClient, filters: dict[str, Any], limit: int = 20) -> list[dict]:
    with patch("app.routers.discover.call_claude", new_callable=AsyncMock, return_value=({"angles": []}, None)):
        response = client.post("/discover/registry", json={"filters": filters, "limit": limit})
    assert response.status_code == 200, response.text
    return response.json()["candidates"]


def _names(candidates: list[dict], top: int) -> list[str]:
    return [candidate["name"] for candidate in candidates[:top]]


def _legal(candidate: dict) -> str:
    return str(candidate.get("legalCategory") or "")


# ── #2490 — « de l'aéronautique sur Toulouse, je veux Airbus » ──────────────


def test_aerospace_in_haute_garonne_puts_local_majors_first(client: TestClient, bench: _Registry) -> None:
    candidates = _run(client, {"nafCode": AEROSPACE, "department": "31", "departments": ["31"]})

    top = candidates[:5]
    # En tête : des sièges DANS la zone, recommandés — pas un réseau national
    # qui a un établissement dans le 31, ni une coquille sans salarié.
    assert [c["department"] for c in top] == ["31"] * 5, _names(candidates, 5)
    assert {c["qualification"]["verdict"] for c in top} == {"recommended"}, _names(candidates, 5)
    assert "AIRBUS" in _names(candidates, 5)
    # AIRBUS OPERATIONS (siège à Toulouse) n'est QU'EN PAGE 2 du registre : sans
    # le rappel, il n'est jamais montré.
    assert "AIRBUS OPERATIONS" in _names(candidates, 10), _names(candidates, 20)


def test_aerospace_in_the_city_of_toulouse_keeps_only_sieges_in_that_commune(
    client: TestClient, bench: _Registry
) -> None:
    """#2490.11 — « Toulouse » RÉSOLUE en commune (31555) : le registre est
    interrogé sur son code INSEE, et le conseil de qualification écarte les
    lignes dont le SIÈGE n'est pas dans cette commune précise — Blagnac (siège
    d'AIRBUS et de GIE ATR) est une commune voisine, pas Toulouse."""
    candidates = _run(client, {"nafCode": AEROSPACE, "city": "Toulouse"})

    # « CONSTRUCTIONS MECANIQUES TOULOUSE » (siège à Pau) n'est même plus
    # ramenée : le registre n'a plus été interrogé en plein-texte.
    assert "CONSTRUCTIONS MECANIQUES TOULOUSE" not in _names(candidates, 20), _names(candidates, 20)
    top = candidates[:5]
    assert {c["city"] for c in top} == {"TOULOUSE"}, [(c["name"], c["city"]) for c in top]
    assert {c["qualification"]["verdict"] for c in top} == {"recommended"}, _names(candidates, 5)
    assert any("AIRBUS" in name for name in _names(candidates, 3)), _names(candidates, 5)
    # AIRBUS (siège Blagnac) et GIE ATR (siège Blagnac) sont hors de la commune
    # demandée : ils n'ont pas leur place dans le haut de liste recommandé.
    assert "AIRBUS" not in _names(candidates, 5), _names(candidates, 5)


def test_a_city_that_does_not_resolve_falls_back_to_the_old_freetext_search(
    client: TestClient, bench: _Registry, monkeypatch
) -> None:
    """La résolution géo est une source LIBRE : si elle ne répond pas (réseau,
    nom introuvable), la ville repart en plein-texte — le comportement d'avant
    #2490.11, jamais une commune devinée ni une recherche qui se tait."""
    monkeypatch.setattr("app.routers.discover._resolve_city_commune", AsyncMock(return_value=None))

    candidates = _run(client, {"nafCode": AEROSPACE, "city": "Toulouse"})

    # « CONSTRUCTIONS MECANIQUES TOULOUSE » arrive en tête du registre parce que
    # son NOM contient la ville — siège à Pau, 6 à 9 salariés.
    assert "CONSTRUCTIONS MECANIQUES TOULOUSE" not in _names(candidates, 5), _names(candidates, 5)
    assert any("AIRBUS" in name for name in _names(candidates, 3)), _names(candidates, 5)


def test_freetext_does_not_rank_a_city_hall_or_a_caterer_first(client: TestClient, bench: _Registry) -> None:
    candidates = _run(client, {"freetext": "aéronautique Toulouse"})

    top = candidates[:5]
    names = _names(candidates, 5)
    # Ni la commune (le mot « Toulouse » est son LIEU, pas une activité), ni un
    # géant de la restauration collective que le mot-clé n'a atteint que par un
    # établissement…
    assert "COMMUNE DE TOULOUSE" not in names, names
    assert "SODEXO ENTREPRISES" not in names, names
    assert "COMPASS GROUP FRANCE" not in names, names
    # …ni une amicale ou un club sans salarié déclaré : personne à y placer. (Une
    # école d'ingénieurs publique de mille agents, elle, est une cible.)
    staffless_associations = [
        c["name"] for c in top if _legal(c).startswith("9") and c.get("headcountTranche") in (None, "NN", "00")
    ]
    assert not staffless_associations, names
    # #2490 — la demande est désormais LUE (aéronautique → 30.30Z, Toulouse →
    # commune 31555) au lieu de partir en plein-texte : en tête, les grands
    # industriels toulousains du secteur tapé — « je veux du Airbus ».
    assert "AIRBUS OPERATIONS" in _names(candidates, 2), names
    assert bench.calls[0][0] == frozenset({"30.30Z"}) and bench.calls[0][2] == "", bench.calls


def test_banking_in_paris_scores_the_requested_naf_code(client: TestClient, bench: _Registry) -> None:
    candidates = _run(client, {"nafCode": RETAIL_BANKING, "department": "75", "departments": ["75"]})

    names = _names(candidates, 5)
    assert "SOCIETE GENERALE (SG)" in names and "BNP PARIBAS (HELLO BANK!)" in names, names
    assert "CREDIT LYONNAIS (LCL)" not in names, "siège à Lyon : hors de la zone demandée"
    sg = next(c for c in candidates if c["siren"] == "552120222")
    # Le code 64.19Z fait partie des codes DEMANDÉS : c'est un NAF exact, pas
    # une liste qu'on compare en bloc à un code unique.
    assert "factors.nafExact" in {f.get("label_key") for f in sg["scoreFactors"]}, sg["scoreFactors"]


# ── #2489 — « que des trucs liés à la santé ou au public » ──────────────────


def _section(candidate: dict) -> str:
    from app.services.naf_sections import naf_section_of

    return naf_section_of(candidate.get("nafCode")) or "?"


def test_profile_sectors_all_show_up_not_only_the_biggest_networks(client: TestClient, bench: _Registry) -> None:
    candidates = _run(client, {"nafCode": PROFILE_SECTORS, "department": "31", "departments": ["31"]})

    top = candidates[:10]
    sections = {_section(c) for c in top}
    # Aéronautique (C) et éditeurs (J) sont dans le profil : ils doivent être
    # dans le haut de la liste, pas noyés sous les banques, l'État et la santé.
    assert {"C", "J"} <= sections, [(c["name"], _section(c)) for c in top]
    assert len(sections) >= 3, [(c["name"], _section(c)) for c in top]


def test_public_bodies_and_associations_never_outrank_companies(client: TestClient, bench: _Registry) -> None:
    candidates = _run(client, {"nafCode": PROFILE_SECTORS, "department": "31", "departments": ["31"]})

    recommended = [c for c in candidates if c["qualification"]["verdict"] == "recommended"]
    assert recommended, "le banc doit avoir des comptes recommandés à comparer"
    assert not [c["name"] for c in recommended if _legal(c).startswith(("7", "9"))]


def test_a_department_alone_only_returns_national_networks_and_says_so(client: TestClient, bench: _Registry) -> None:
    """TÉMOIN de la limite de la source : `departement=31` seul rend 25 sièges
    HORS du 31 (La Poste, EDF, la Croix-Rouge…). Aucun ne doit passer pour une
    cible recommandée de la zone."""
    candidates = _run(client, {"department": "31", "departments": ["31"]})

    assert candidates, "la page capturée n'est pas vide"
    assert not [c["name"] for c in candidates if c["qualification"]["verdict"] == "recommended"]
    assert {c["qualification"]["code"] for c in candidates} <= {"out_of_zone"}


def test_every_first_page_the_router_asks_for_was_captured(client: TestClient, bench: _Registry) -> None:
    """Le banc ne mesure rien s'il répond « vide » à une question qu'on n'a pas
    capturée : seules des secondes pages non capturées ont le droit de manquer."""
    for filters in (
        {"nafCode": AEROSPACE, "department": "31", "departments": ["31"]},
        {"nafCode": AEROSPACE, "city": "Toulouse"},
        {"freetext": "aéronautique Toulouse"},
        {"nafCode": RETAIL_BANKING, "department": "75", "departments": ["75"]},
        {"nafCode": PROFILE_SECTORS, "department": "31", "departments": ["31"]},
        {"department": "31", "departments": ["31"]},
    ):
        _run(client, filters)
    assert bench.calls, "le banc a bien été interrogé"
    # `page` est le DERNIER élément de la clé depuis que #2490.11 y ajoute la
    # commune (avant-dernier) — voir `_key`.
    assert [key for key in bench.misses if key[-1] != 2] == []
