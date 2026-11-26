"""Lot S (recette prod 01/11/2026, #4429 / #4515) — l'échelle part de 25 km et passe par 50 km AVANT le reste.

Ville (25 km par défaut, #4515) → 50 km → département → région (Louis 02/11 : aucun barreau 100 km) : UN barreau à la fois, chacun nommé, arrêt
dès que le seuil est atteint. La recette du 01/11 avait mesuré qu'aucun palier 50 km ne précédait le département.
Les tests COMPTENT les appels au registre : lire le résultat ne prouve pas qu'un barreau a été sauté.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.routers import discover as router
from app.services import zone_tiers
from tests.test_4429_echelle_100km import _at, _post, _row, stub  # noqa: F401  (fixture `stub`)


def _steps(gouv) -> list[str]:
    """Les mailles interrogées dans l'ordre, sans les pages suivantes d'une même maille (un appel de plus, pas un barreau)."""
    out: list[str] = []
    for zone in gouv.zones():
        if not out or out[-1] != zone:
            out.append(zone)
    return out


def test_l_echelle_part_de_25_km_et_passe_par_50_km() -> None:
    assert zone_tiers.DEFAULT_CITY_RADIUS_KM == 25
    assert zone_tiers.ZONE_TIERS == ("city", "radius_50", "department", "region", "france")
    assert zone_tiers.zone_tiers_after("city") == ("radius_50", "department", "region")
    assert zone_tiers.ZONE_TIER_RADIUS_KM == {"radius_50": 50}
    assert router._tiers_to_try(router.DiscoverFilters(city="Lille", radiusKm=25)) == (
        "radius_50",
        "department",
        "region",
    )
    # Un rayon de 50 km DEMANDÉ a déjà couvert le premier barreau : il ne se rejoue pas.
    assert router._tiers_to_try(router.DiscoverFilters(city="Lille", radiusKm=50)) == ("department", "region")


def test_aucun_barreau_100_km_dans_l_echelle_automatique() -> None:
    """Louis 02/11/2026 (QCM) : DIT NON — ni dans les paliers, ni dans la table des rayons, ni dans l'échelle tentée."""
    assert "radius_100" not in zone_tiers.ZONE_TIERS
    assert "radius_100" not in zone_tiers.ZONE_TIER_RADIUS_KM
    assert "radius_100" not in router._tiers_to_try(router.DiscoverFilters(city="Lille", radiusKm=25))


def test_zero_a_25_km_ne_saute_jamais_a_la_region_les_barreaux_s_enchainent(client: TestClient, stub) -> None:  # noqa: F811
    gouv = stub({"radius_25": [], "radius_50": [], "department": [], "region": [], "france": []})

    body = _post(client, {"city": "Lille", "radiusKm": 25})

    zones = gouv.zones()
    # Ordre exact : 25 km, 50 km, le département, la région — jamais la France, jamais 100 km.
    assert zones[0] == "radius_25"
    assert zones.index("radius_50") < zones.index("department") < zones.index("region")
    assert zones[-2:] == ["department", "region"]
    assert "france" not in zones
    assert body["zoneWidening"]["steps"] == ["radius_50", "department", "region"]


def test_le_barreau_50_km_suffit_ni_100_km_ni_departement(client: TestClient, stub) -> None:  # noqa: F811
    near = [_at(i, 30) for i in range(30)]
    gouv = stub({"radius_25": [_row(1)], "radius_50": near, "department": [_row(70)], "region": [_row(71)]})

    body = _post(client, {"city": "Lille", "radiusKm": 25})

    widening = body["zoneWidening"]
    assert widening["tier"] == "radius_50" and widening["steps"] == ["radius_50"]
    assert _steps(gouv) == ["radius_25", "radius_50"], "arrêt dès que le seuil est atteint"
    assert all(c["zone"]["tier"] == "radius_50" for c in body["candidates"] if c.get("zone"))


def test_au_dessus_du_seuil_la_requete_reste_la_ville_a_25_km(client: TestClient, stub) -> None:  # noqa: F811
    gouv = stub({"radius_25": [_at(i, 10) for i in range(30)], "radius_50": [_row(70)], "department": [_row(71)]})

    body = _post(client, {"city": "Lille", "radiusKm": 25})

    assert not body.get("zoneWidening"), "#3876 : une ville ne s'élargit pas en silence"
    assert _steps(gouv) == ["radius_25"], "DIT NON : aucun barreau au-dessus du seuil"


def test_revenir_a_toulouse_seule_ne_tente_aucun_barreau(client: TestClient, stub) -> None:  # noqa: F811
    gouv = stub({"radius_25": [_row(1)], "radius_50": [_at(i, 30) for i in range(30)]})

    body = _post(client, {"city": "Lille", "radiusKm": 25, "zoneStrict": True})

    assert not body.get("zoneWidening")
    assert "radius_50" not in gouv.zones()


def test_revenir_a_50_km_borne_l_echelle(client: TestClient, stub) -> None:  # noqa: F811
    gouv = stub({"radius_25": [], "radius_50": [_at(1, 30)], "department": [_row(70 + i) for i in range(30)]})

    body = _post(client, {"city": "Lille", "radiusKm": 25, "zoneCeiling": "radius_50"})

    assert body["zoneWidening"]["tier"] == "radius_50"
    assert "department" not in gouv.zones(), "le geste borne l'échelle au barreau nommé"


def test_le_barreau_50_km_n_interroge_que_le_cercle_central(client: TestClient, stub) -> None:  # noqa: F811
    gouv = stub({"radius_25": [], "radius_50": [], "department": [], "region": []})

    _post(client, {"city": "Lille", "radiusKm": 25})

    circles = [z for z in gouv.zones() if z == "radius_50"]
    assert len(circles) == 1, "le barreau 50 km = le cercle central seul, jamais rejoué"


def test_laura_nomme_le_barreau_50_km() -> None:
    line = zone_tiers.laura_zone_line({"tier": "radius_50", "place": "Toulouse"}, 3, 5)
    assert line == "J'ai élargi à 50 km : 3 comptes à Toulouse, 5 autour"
