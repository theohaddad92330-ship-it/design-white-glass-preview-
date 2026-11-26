"""#4429.2 (recette prod 23/10) — « /discover?city=Toulouse + react » : 1 compte, aucun palier de zone.

Seule la compétence s'élargissait. Sous 10 comptes, la ZONE s'élargit aussi, seule : Toulouse → Haute-Garonne →
Occitanie → France, les exacts en tête, les élargis étiquetés (`zone`), le palier dit (`zoneWidening`).
« Toulouse seule » (`zoneStrict`) coupe les paliers. Sources simulées : aucun appel réseau.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.services.discover_skill_offers import SkillAccounts

_TOULOUSE = {
    "code": "31555",
    "name": "Toulouse",
    "postalCodes": ["31000"],
    "department": "31",
    "departmentName": "Haute-Garonne",
    "region": "76",
    "latitude": 43.6045,
    "longitude": 1.4440,
}


def _account(siren: str, name: str, department: str, city: str) -> dict[str, Any]:
    return {
        "siren": siren,
        "name": name,
        "nafCode": "62.01Z",
        "sector": "Programmation informatique",
        "city": city,
        "department": department,
        "headcountRange": "50 à 99 salariés",
        "skillEvidence": {
            "skill": "React",
            "offerCount": 1,
            "latestOffer": {
                "title": "Développeur React",
                "city": city,
                "date": "2026-10-15",
                "url": None,
                "source": None,
            },
        },
    }


@pytest.fixture
def engine(monkeypatch):
    """Le moteur d'offres doublé par MAILLE : (ville filtrée ?, zone de lecture) → comptes."""
    calls: list[dict[str, Any]] = []
    by_scope: dict[str, list[dict]] = {"city": [], "department": [], "region": [], "france": []}

    async def fake(skills, zone, profile, *, deadline, city=None, centre=None, radius_km=None, commune_code=None, limit=None):
        calls.append({"skills": list(skills), "zone": list(zone), "city": city})
        if city:
            scope = "city"
        elif not zone:
            scope = "france"
        elif len(zone) == 1:
            scope = "department"
        else:
            scope = "region"
        accounts = list(by_scope[scope]) if list(skills) == ["React"] else []
        return SkillAccounts(accounts=accounts, intermediaries=[], info={"skills": list(skills), "emptyCause": None})

    monkeypatch.setattr("app.routers.discover.find_skill_accounts", fake)
    monkeypatch.setattr("app.routers.discover.search_communes", AsyncMock(return_value=[_TOULOUSE]))
    monkeypatch.setattr("app.routers.discover.call_claude", AsyncMock(return_value=({"angles": []}, None)))

    async def _no_signals(*args: Any, **kwargs: Any) -> list[dict]:
        return []

    for name in ("public_tenders", "it_job_signals", "legal_signals", "funding_signals", "_press_for",
                 "_ats_for_card", "_peek_shared_jobs", "_adzuna_for_card", "_page_volumes"):  # fmt: skip
        monkeypatch.setattr(f"app.routers.discover.{name}", _no_signals)
    return by_scope, calls


def _post(client, filters: dict[str, Any], **extra: Any) -> dict:
    response = client.post(
        "/discover/registry",
        json={"filters": {"technologiesObserved": ["React"], **filters}, "profile_data": {}, **extra},
    )
    assert response.status_code == 200, response.text
    return response.json()


def _scopes(engine):
    by_scope, _ = engine
    exact = [_account("552100001", "EXACT TLSE", "31", "TOULOUSE")]
    dept = exact + [_account(f"5521001{i:02d}", f"MURET {i}", "31", "MURET") for i in range(3)]
    region = dept + [_account(f"5521002{i:02d}", f"ALBI {i}", "81", "ALBI") for i in range(4)]
    france = region + [_account(f"5521003{i:02d}", f"PARIS {i}", "75", "PARIS") for i in range(12)]
    by_scope.update(city=exact, department=dept, region=region, france=france)


def test_un_seul_compte_a_toulouse_la_zone_s_elargit_par_paliers_jusqu_a_vingt_cinq(client, engine) -> None:
    _scopes(engine)
    _, calls = engine

    body = _post(client, {"city": "Toulouse"})

    assert body["zoneWidening"]["place"] == "Toulouse"
    # c144 (Louis 27/10 au soir) : département, région — un palier à la fois, chacun nommé ; l'automatique plafonne
    # à la région, même sous le seuil. La France (12 comptes parisiens) n'est JAMAIS lue.
    assert body["zoneWidening"]["tier"] == "region"
    assert "exhausted" not in body["zoneWidening"]
    assert body["zoneWidening"]["exactCount"] == 1
    sirens = [c["siren"] for c in body["candidates"]]
    assert sirens[0] == "552100001", "le compte exact reste en tête"
    assert "zone" not in body["candidates"][0]
    by_siren = {c["siren"]: c for c in body["candidates"]}
    # Le moteur d'offres lit des départements, pas un cercle : pas de barreau 100 km ici, le département vient d'abord.
    assert by_siren["552100100"]["zone"]["tier"] == "department"
    assert by_siren["552100200"]["zone"]["tier"] == "region"
    assert "552100300" not in by_siren
    assert body["zoneWidening"]["steps"] == ["department", "region"]
    reads = [call["zone"] for call in calls if call["skills"] == ["React"] and not call["city"]]
    assert reads[0] == ["31"], "le département d'abord"
    assert [] not in reads, "aucune lecture sans zone (le pays) : l'élargissement automatique s'arrête à la région"


def test_le_palier_s_arrete_des_que_vingt_cinq_comptes_sont_la(client, engine) -> None:
    by_scope, calls = engine
    exact = [_account("552100001", "EXACT TLSE", "31", "TOULOUSE")]
    by_scope["city"] = exact
    by_scope["department"] = exact + [_account(f"5521001{i:02d}", f"MURET {i}", "31", "MURET") for i in range(25)]

    body = _post(client, {"city": "Toulouse"})

    assert body["zoneWidening"]["tier"] == "department"
    assert body["zoneWidening"]["steps"] == ["department"]
    assert body["zoneWidening"]["area"] == "Haute-Garonne"
    reads = [call["zone"] for call in calls if call["skills"] == ["React"] and not call["city"]]
    assert reads == [["31"]], "ni la région ni la France ne sont lues quand le département suffit"


def test_toulouse_seule_ne_tente_aucun_palier_de_zone(client, engine) -> None:
    _scopes(engine)
    _, calls = engine

    body = _post(client, {"city": "Toulouse", "zoneStrict": True})

    assert not body.get("zoneWidening")
    assert [c["siren"] for c in body["candidates"]] == ["552100001"]
    assert all(call["city"] for call in calls if call["skills"] == ["React"])


def test_vingt_cinq_exacts_aucun_palier_de_zone(client, engine) -> None:
    by_scope, calls = engine
    by_scope["city"] = [_account(f"5521000{i:02d}", f"TLSE {i}", "31", "TOULOUSE") for i in range(25)]

    body = _post(client, {"city": "Toulouse"}, limit=25)

    assert not body.get("zoneWidening")
    assert len([c for c in calls if c["skills"] == ["React"]]) == 1
