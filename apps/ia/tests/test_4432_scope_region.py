"""#4432.4 — un dossier cadré sur une ZONE (région(s), département(s)) range les contacts de la zone
d'abord et écarte, NOMMÉS « hors zone », ceux dont le lieu dit explicitement ailleurs.

Retour client du 21/10 : « Découvrir aéronautique, Occitanie → Safran » rendait des contacts
parisiens. Avant ce point, `geo_perimeter = region` se lisait comme `france` : il n'écartait que
l'étranger. Le lieu se lit sur la LOCALISATION de la fiche (jamais sur le titre : « Directeur Nord »
n'est pas le département du Nord) ; un lieu absent ne prouve rien — gardé, rangé après.
"""

from __future__ import annotations

from app.services.scope_filter import filter_recommended_path, zone_departments

OCCITANIE = {"geo_perimeter": "region", "geo_areas": ["Occitanie"]}


def test_les_libelles_de_zone_se_resolvent_en_departements() -> None:
    assert {"31", "34", "81"} <= zone_departments(["Occitanie"])
    assert zone_departments(["Haute-Garonne"]) == frozenset({"31"})
    assert {"33", "31"} <= zone_departments(["Nouvelle-Aquitaine", "Occitanie"])
    assert zone_departments(["Atlantide"]) == frozenset()


def test_contacts_de_la_zone_d_abord_hors_zone_ecartes_et_nommes() -> None:
    people = [
        {"name": "A", "title": "DSI", "location": "Paris, Île-de-France, France"},
        {"name": "B", "title": "Directeur Nord", "location": ""},
        {"name": "C", "title": "Responsable usine", "location": "Blagnac 31700"},
        {"name": "D", "title": "Head of IT", "location": "Toulouse, Occitanie, France"},
    ]
    kept, dropped = filter_recommended_path(people, OCCITANIE)
    assert [p["name"] for p in kept] == ["C", "D", "B"]
    assert [p["name"] for p in dropped] == ["A"]
    assert dropped[0]["excludedReason"] == "hors zone (Occitanie)"


def test_dit_non_sans_zone_rien_n_est_ecarte_ni_reordonne() -> None:
    people = [
        {"name": "A", "location": "Paris, Île-de-France, France"},
        {"name": "B", "location": "Toulouse, Occitanie, France"},
    ]
    kept, dropped = filter_recommended_path(people, {"geo_perimeter": "france"})
    assert [p["name"] for p in kept] == ["A", "B"]
    assert dropped == []
    kept, dropped = filter_recommended_path(people, None)
    assert [p["name"] for p in kept] == ["A", "B"]


def test_l_etranger_reste_ecarte_en_region() -> None:
    kept, dropped = filter_recommended_path([{"name": "E", "location": "Madrid, Spain"}], OCCITANIE)
    assert kept == [] and dropped[0]["name"] == "E"
