"""#4432.7 / #4432.8 — un dossier lancé avec une ZONE (sélection par région) met en avant ce qui est dans la zone.

Retour client du 21/10 : « Safran en Occitanie » ne filtrait les filiales que pour France/site. Décision
Louis 21/10/2026 : les filiales ET établissements situés dans la zone passent en tête ; ceux hors zone
RESTENT, classés après (on ne masque pas ce qu'on a) ; un lieu inconnu n'est jamais compté « dans la
zone » (on n'affiche pas ce qu'on n'a pas). Les offres de recrutement de la zone remontent en tête.
"""

from __future__ import annotations

from app.models.research import ResearchRequest
from app.routers.phase1_research import _rank_and_keep_run_jobs, _scope_directive_for_request
from app.services.zone_dossier import dossier_zone, zone_first

OCCITANIE = {"geo_perimeter": "region", "geo_areas": ["Occitanie"]}


def test_pas_de_zone_sans_cadrage_region_ou_avec_zone_inconnue() -> None:
    assert dossier_zone(None) is None
    assert dossier_zone({"geo_perimeter": "france"}) is None
    assert dossier_zone({"geo_perimeter": "region", "geo_areas": []}) is None
    assert dossier_zone({"geo_perimeter": "region", "geo_areas": ["Atlantide"]}) is None
    zone = dossier_zone(OCCITANIE)
    assert zone and {"31", "34"} <= zone.departments and zone.areas == ("Occitanie",)


def test_filiales_et_etablissements_de_la_zone_en_tete_hors_zone_restent_apres() -> None:
    zone = dossier_zone(OCCITANIE)
    entities = [
        {"name": "Safran Paris", "region": "Île-de-France"},
        {"name": "Safran Inconnu"},
        {"name": "Safran Toulouse", "region": "Toulouse, Occitanie"},
        {"name": "Safran Bordeaux", "city": "Mérignac", "region": "Nouvelle-Aquitaine"},
    ]
    ordered = zone_first(entities, zone)
    assert [e["name"] for e in ordered] == ["Safran Toulouse", "Safran Inconnu", "Safran Paris", "Safran Bordeaux"]
    assert len(ordered) == len(entities), "rien n'est masqué"
    status = {e["name"]: e.get("zoneStatus") for e in ordered}
    assert status == {
        "Safran Toulouse": "in_zone",
        "Safran Inconnu": None,
        "Safran Paris": "out_of_zone",
        "Safran Bordeaux": "out_of_zone",
    }


def test_une_offre_sans_localisation_n_est_jamais_dans_la_zone() -> None:
    zone = dossier_zone(OCCITANIE)
    offers = [
        {"title": "Dev Java", "location": "Paris (75)", "department": "75"},
        {"title": "Dev sans lieu"},
        {"title": "Dev vide", "location": "", "city": None},
        {"title": "Dev .NET", "city": "Blagnac", "department": "31"},
        {"title": "Dev Python", "location": "31 - TOULOUSE"},
    ]
    ordered = zone_first(offers, zone)
    assert [o["title"] for o in ordered[:2]] == ["Dev .NET", "Dev Python"]
    assert all(o.get("zoneStatus") == "in_zone" for o in ordered[:2])
    assert [o["title"] for o in ordered[2:4]] == ["Dev sans lieu", "Dev vide"]
    assert all("zoneStatus" not in o for o in ordered[2:4])
    assert ordered[4]["zoneStatus"] == "out_of_zone"


def test_dit_non_sans_zone_rien_ne_bouge() -> None:
    items = [{"name": "A", "region": "Paris"}, {"name": "B", "region": "Toulouse"}]
    assert zone_first(items, None) == items
    assert all("zoneStatus" not in i for i in zone_first(items, None))


def test_les_offres_du_dossier_zone_remontent_en_tete() -> None:
    req = ResearchRequest(company_name="Safran", cadrage=OCCITANIE)
    jobs = [
        {"title": "A", "location": "Paris", "department": "75"},
        {"title": "B", "city": "Toulouse", "department": "31"},
    ]
    assert [j["title"] for j in _rank_and_keep_run_jobs(jobs, None, req)] == ["B", "A"]
    neutral = ResearchRequest(company_name="Safran")
    assert [j["title"] for j in _rank_and_keep_run_jobs(jobs, None, neutral)] == ["A", "B"]


def test_la_consigne_de_zone_dit_de_garder_le_hors_zone_apres() -> None:
    req = ResearchRequest(company_name="Safran", cadrage=OCCITANIE)
    directive = _scope_directive_for_request(req) or ""
    assert "Occitanie" in directive and "hors zone" in directive
    assert _scope_directive_for_request(ResearchRequest(company_name="Safran")) is None


# --- #4432.9 — zone SANS entité : on élargit seul au palier suivant, et on le DIT ---------------------------------

from app.services.zone_dossier import zone_widening, zone_widening_headline  # noqa: E402
from app.services.zone_tiers import ZONE_TIERS  # noqa: E402


def test_zone_avec_entites_rien_ne_s_elargit() -> None:
    zone = dossier_zone(OCCITANIE)
    lists = {"entitiesExhaustive": [{"name": "Safran Toulouse", "region": "Occitanie"}]}
    assert zone_widening(zone, lists) is None


def test_region_sans_entite_s_elargit_a_france_et_le_dit() -> None:
    zone = dossier_zone(OCCITANIE)
    lists = {
        "entitiesExhaustive": [{"name": "Safran Paris", "region": "Île-de-France"}],
        "sitesFrance": [{"city": "Mérignac", "region": "Nouvelle-Aquitaine"}],
    }
    widening = zone_widening(zone, lists)
    assert widening == {"requested": ["Occitanie"], "tier": "france"}
    # RENVERSEMENT daté, assumé — lot DÉCOUVRIR-ZONE (#4641, Louis 27/10/2026) : l'échelle de la RECHERCHE
    # remonte par paliers nommés jusqu'à LA FRANCE et ne s'arrête JAMAIS (#4433 : Laura agit). Ça renverse
    # l'arrêt à la grande région posé le matin même par #4640, que cette garde exigeait — l'arrêt à la région
    # a été livré une fois, c'est écrit pour être lu, pas effacé (`app/services/zone_tiers.py`).
    # Le palier « france » existe donc des DEUX côtés : le dossier d'un compte ET la recherche.
    assert ZONE_TIERS == ("city", "radius_50", "department", "region", "france")
    assert zone_widening_headline(widening, "fr") == "Aucune entité du groupe en Occitanie — élargi à toute la France"
    assert zone_widening_headline(widening, "en") == "No group entity in Occitanie — widened to all of France"


def test_departement_sans_entite_monte_a_sa_region_si_elle_en_a() -> None:
    zone = dossier_zone({"geo_perimeter": "region", "geo_areas": ["Gers"]})
    lists = {"entitiesExhaustive": [{"name": "Safran Toulouse", "city": "Toulouse"}]}
    widening = zone_widening(zone, lists)
    assert widening and widening["tier"] == "region" and widening["area"] == "Occitanie"
    assert zone_widening_headline(widening, "fr") == "Aucune entité du groupe en Gers — élargi à la région (Occitanie)"


def test_lieu_inconnu_ne_compte_jamais_comme_entite_de_la_zone() -> None:
    zone = dossier_zone(OCCITANIE)
    widening = zone_widening(zone, {"entitiesExhaustive": [{"name": "Safran Inconnu"}]})
    assert widening and widening["tier"] == "france"


def test_sans_zone_pas_d_elargissement() -> None:
    assert zone_widening(None, {"entitiesExhaustive": []}) is None


def test_le_routeur_pose_la_mention_d_elargissement() -> None:
    import inspect

    from app.routers import phase1_research

    source = inspect.getsource(phase1_research)
    assert 'result["dossierZoneWidening"] = _widening' in source


# ── #4432.10 — le dossier dit de quels critères il est né ─────────────────────


def test_born_from_names_the_criteria_and_the_zone():
    from app.services.zone_dossier import dossier_born_from

    out = dossier_born_from(
        {"discover_origin_criteria": ["Secteur : aéronautique", " ", "Zone : Occitanie"]},
        {"geo_perimeter": "region", "geo_areas": ["Occitanie", "Nouvelle-Aquitaine"]},
    )
    assert out == {
        "criteria": ["Secteur : aéronautique", "Zone : Occitanie"],
        "areas": ["Occitanie", "Nouvelle-Aquitaine"],
    }


def test_born_from_is_none_without_criteria_nor_zone():
    from app.services.zone_dossier import dossier_born_from

    assert dossier_born_from(None, None) is None
    assert dossier_born_from({"discover_origin_criteria": []}, {"geo_perimeter": "france"}) is None
