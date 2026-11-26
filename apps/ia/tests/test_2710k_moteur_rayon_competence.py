"""Lot DÉCOUVRIR-MOTEUR (27/10) — #4515 / #4419 : le rayon AFFICHÉ est APPLIQUÉ sur le chemin compétence.

Mesure de production du 27/10 (commit servi 8b6d99fc3d) : ``?city=Lille&technologiesObserved=vue,java`` rendait
11 comptes, le rayon affichait « 100 km », et le chemin compétence ne lisait que la commune exacte de l'offre — le
rayon n'y entrait jamais. Règle FINALE (Louis 27/10) : une ville cherche dans 100 km par défaut. Sur ce chemin, le
lieu filtre sur le LIEU DE TRAVAIL de l'offre (jamais le siège de l'employeur), mesuré sur sa position publiée ;
une offre sans position ne se prouve pas dans le cercle (jamais une proximité devinée).
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, patch

from app.services import discover_skill_offers as skill
from tests.test_competence_trouve import REGISTRY, _offer, _post, registry, sources  # noqa: F401 — fixtures

LILLE = (50.6365, 3.0635)
VILLENEUVE = {"latitude": 50.6233, "longitude": 3.1450}  # ~6 km
PARIS = {"latitude": 48.8566, "longitude": 2.3522}  # ~205 km


def test_offer_in_reach_reads_the_offer_position_and_says_no() -> None:
    near = {"city": "Villeneuve-d'Ascq", **VILLENEUVE}
    far = {"city": "Paris", **PARIS}
    unplaced = {"city": "Villeneuve-d'Ascq"}
    assert skill.offer_in_reach(near, "Lille", centre=LILLE, radius_km=100)
    assert not skill.offer_in_reach(far, "Lille", centre=LILLE, radius_km=100)
    # Sans position : pas de proximité devinée — seule la commune exacte passe.
    assert not skill.offer_in_reach(unplaced, "Lille", centre=LILLE, radius_km=100)
    assert skill.offer_in_reach({"city": "59 - LILLE"}, "Lille", centre=LILLE, radius_km=100)
    # Sans rayon (« Lille seule ») : la commune, rien d'autre.
    assert not skill.offer_in_reach(near, "Lille", centre=None, radius_km=None)


def test_france_travail_and_adzuna_offers_carry_their_published_position(monkeypatch) -> None:
    from app.services.data_sources import job_aggregators

    _, adz = job_aggregators._adzuna_row(
        {"company": {"display_name": "EXOTEC"}, "location": {"display_name": "Wasquehal"}, "title": "Dev Vue",
         "latitude": 50.67, "longitude": 3.13}
    )
    assert (adz["latitude"], adz["longitude"]) == (50.67, 3.13)
    _, bare = job_aggregators._adzuna_row({"company": {"display_name": "X"}, "title": "Dev"})
    assert "latitude" not in bare and "longitude" not in bare


def _lille(monkeypatch) -> None:
    commune: dict[str, Any] = {"name": "Lille", "code": "59350", "department": "59", "region": "32",
                               "latitude": LILLE[0], "longitude": LILLE[1]}
    monkeypatch.setattr(
        "app.routers.discover._resolve_place_within_share", AsyncMock(return_value=(commune, "Lille", False))
    )


def test_skill_search_keeps_offers_within_100_km_and_reads_the_offer_not_the_headquarters(
    client, sources, registry, monkeypatch  # noqa: F811
) -> None:
    monkeypatch.setitem(
        REGISTRY, "EXOTEC", {"siren": "811111114", "name": "EXOTEC", "nafCode": "28.22Z", "city": "WASQUEHAL", "department": "59"}
    )
    monkeypatch.setitem(
        REGISTRY, "PARISCORP", {"siren": "822222225", "name": "PARISCORP", "nafCode": "58.29C", "city": "PARIS", "department": "75"}
    )
    monkeypatch.setitem(
        REGISTRY, "LOINCORP", {"siren": "833333336", "name": "LOINCORP", "nafCode": "58.29C", "city": "LILLE", "department": "59"}
    )
    near = _offer("EXOTEC", "Développeur Vue", days_ago=2, city="59 - WASQUEHAL", dept="59", source="france_travail")
    # Siège à Paris, offre à Roubaix : le lieu de TRAVAIL est dans le cercle — le compte y recrute.
    hq_far = _offer("PARISCORP", "Développeur Vue", days_ago=1, city="59 - ROUBAIX", dept="59", source="france_travail")
    # Siège à Lille, offre publiée à 130 km (position mesurée) : hors du cercle, jamais « à Lille ».
    far = _offer("LOINCORP", "Développeur Vue", days_ago=1, city="59 - FOURMIES", dept="59", source="france_travail")
    sources.ft = [
        {**near, "latitude": 50.67, "longitude": 3.13},
        {**hq_far, "latitude": 50.69, "longitude": 3.18},
        {**far, "latitude": 50.0167, "longitude": 5.0},
    ]
    _lille(monkeypatch)

    with patch("app.routers.discover.call_claude", new_callable=AsyncMock, return_value=({"angles": []}, None)):
        body = client.post(
            "/discover/registry",
            json={"filters": {"city": "Lille", "radiusKm": 100, "keywords": ["Vue"]}, "profile_data": {}, "strictCriteria": True},
        ).json()

    names = [c["name"] for c in body["candidates"]]
    assert names[:2] == ["EXOTEC", "PARISCORP"] or names[:2] == ["PARISCORP", "EXOTEC"]
    assert "LOINCORP" not in names
    assert body["query"]["skillSearch"]["radiusKm"] == 100


def test_lille_seule_reads_the_city_only(client, sources, registry, monkeypatch) -> None:  # noqa: F811
    monkeypatch.setitem(
        REGISTRY, "EXOTEC", {"siren": "811111114", "name": "EXOTEC", "nafCode": "28.22Z", "city": "WASQUEHAL", "department": "59"}
    )
    near = _offer("EXOTEC", "Développeur Vue", days_ago=2, city="59 - WASQUEHAL", dept="59", source="france_travail")
    sources.ft = [{**near, "latitude": 50.67, "longitude": 3.13}]
    _lille(monkeypatch)
    # « Lille seule » (zoneStrict) : la ville stricte, aucun cercle.
    body = _post(client, {"city": "Lille", "radiusKm": 100, "keywords": ["Vue"], "zoneStrict": True}).json()
    assert [c["name"] for c in body["candidates"]] == []
    assert "radiusKm" not in body["query"]["skillSearch"]


def test_france_travail_reading_carries_the_offer_position(monkeypatch) -> None:
    import asyncio

    from app.services.data_sources import france_travail

    async def rows(*_: Any, **__: Any) -> list[dict]:
        return [{"name": "EXOTEC", "city": "WASQUEHAL", "department": "59", "latitude": 50.67, "longitude": 3.13,
                 "signal": {"label": "Offre — Dev Vue", "date": "2026-10-20"}},
                {"name": "SANSPOS", "city": "LILLE", "department": "59", "signal": {"label": "Offre — Dev"}}]

    monkeypatch.setattr(france_travail, "list_hiring_companies", rows)
    offers = asyncio.run(skill._france_travail_read("vue", "59", {}, 0))
    assert (offers[0]["latitude"], offers[0]["longitude"]) == (50.67, 3.13)
    assert "latitude" not in offers[1]
