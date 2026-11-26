"""KEVIN-FIX K.10 (recette prod 20/10) — « Cadrage appliqué : Ville/site Lille » ne cadrait rien.

Les sites (`sitesFrance`) sortaient tous « moyenne » hors siège, dans l'ordre du registre : le site
lillois noyé parmi sept sites franciliens. Le cadrage ville/site ORDONNE (site dans la zone d'abord) et
NOMME ce qui n'est pas dans la zone — il ne retire rien (un siège hors zone reste un fait).
"""

from __future__ import annotations

from app.services.insee_sirene import order_sites_for_zone
from app.services.scope_filter import filter_recommended_path


def _site(city: str, *, siege: bool = False) -> dict:
    return {
        "city": city,
        "type": "siège" if siege else "établissement",
        "importance": "strategique" if siege else "moyenne",
        "estimated_headcount": "",
        "notes": "CP 00000 · source officielle",
    }


SITES = [_site("PARIS", siege=True), _site("NANTERRE"), _site("LILLE"), _site("LYON")]


def test_k10_le_site_dans_la_zone_passe_en_tete_et_monte_en_priorite() -> None:
    ordered = order_sites_for_zone(SITES, "Lille")
    assert [s["city"] for s in ordered][0] == "LILLE"
    assert ordered[0]["importance"] == "haute"
    assert "dans la zone (Lille)" in ordered[0]["notes"]


def test_k10_ce_qui_n_est_pas_dans_la_zone_se_nomme_hors_site_et_rien_n_est_retire() -> None:
    ordered = order_sites_for_zone(SITES, "Lille")
    assert len(ordered) == len(SITES)
    siege = next(s for s in ordered if s["type"] == "siège")
    assert "hors site (Lille)" in siege["notes"]
    assert siege["importance"] == "strategique"  # un siège hors zone reste stratégique : un fait, pas un rang
    nanterre = next(s for s in ordered if s["city"] == "NANTERRE")
    assert nanterre["importance"] == "basse"
    assert "hors site (Lille)" in nanterre["notes"]


def test_k10_la_comparaison_ignore_casse_et_accents() -> None:
    ordered = order_sites_for_zone([_site("SAINT-ETIENNE"), _site("PARIS")], "Saint-Étienne")
    assert ordered[0]["city"] == "SAINT-ETIENNE"


def test_k10_sans_ville_la_liste_est_rendue_telle_quelle() -> None:
    # La garde sait dire NON : sans zone nommée, rien n'est ordonné ni marqué.
    assert order_sites_for_zone(SITES, None) == SITES
    assert order_sites_for_zone(SITES, "  ") == SITES


def test_k10_aucun_site_dans_la_zone_ne_marque_rien_de_faux() -> None:
    # La source ne prouve aucun site à Brest : on ne prétend pas « dans la zone », on garde l'ordre.
    ordered = order_sites_for_zone(SITES, "Brest")
    assert [s["city"] for s in ordered] == [s["city"] for s in SITES]
    assert all("dans la zone" not in s["notes"] for s in ordered)


def test_k10_les_contacts_du_site_passent_avant_ceux_dont_le_lieu_n_est_pas_dit() -> None:
    people = [
        {"name": "C"},  # aucun libellé : pas une preuve d'être hors site, il reste
        {"name": "B", "title": "Responsable infrastructure", "location": "Lille"},
        {"name": "A", "title": "DSI", "location": "Paris"},  # un AUTRE lieu dit : « hors site »
    ]
    kept, dropped = filter_recommended_path(people, {"geo_perimeter": "city", "geo_areas": ["Lille"]})
    assert [p["name"] for p in kept] == ["B", "C"]
    assert [p["name"] for p in dropped] == ["A"]
    assert dropped[0]["excludedReason"] == "hors site (Lille)"


def test_k10_sans_cadrage_ville_l_ordre_des_contacts_est_inchange() -> None:
    people = [{"name": "C"}, {"name": "B", "location": "Lille"}]
    kept, _ = filter_recommended_path(people, {"geo_perimeter": "france"})
    assert [p["name"] for p in kept] == ["C", "B"]
