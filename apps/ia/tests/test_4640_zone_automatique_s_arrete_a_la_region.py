"""#4640 — l'élargissement AUTOMATIQUE de zone s'arrête à la RÉGION (Louis, 27/10/2026 au soir, c144).

⚠️ Ça RENVERSE c143 (lot DÉCOUVRIR-ZONE, livré le matin même : département, région, PUIS la France, sans jamais
s'arrêter). Écrit pour être lu, pas effacé : l'arrêt à la région est livré, renversé, livré, renversé — DEUX fois en
trois jours. Cette fois le plafond est un NOM (``ZONE_AUTO_MAX_TIER``), gardé des deux côtés.

« Peu de comptes » est une RÉPONSE : c'est le filtre de zone qui a raison. Aucune requête « France » ne part d'un
élargissement automatique, même quand le dernier barreau rend 0 compte. La recherche France entière reste un geste
EXPLICITE (aucune ville posée) et ``france`` reste un palier NOMMABLE (``ZONE_TIERS``).

Louis 02/11/2026 (QCM) : l'échelle part de 25 km → 50 km → département → région ; le barreau 100 km est RETIRÉ.

Les tests COMPTENT les appels au registre : lire le résultat ne prouve pas qu'aucune requête France n'est partie.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.routers import discover as router
from app.services import zone_tiers
from tests import test_4429_echelle_100km as echelle
from tests.test_4429_echelle_100km import _LILLE, _at, _row

stub = echelle.stub

_FAR = [
    _row(801, city="SAINT-JEAN-DE-LUZ", department="64"),
    _row(802, city="MONTPELLIER", department="34"),
    _row(803, city="NEVERS", department="58"),
    _row(804, city="ARCACHON", department="33"),
    _row(805, city="CALVI", department="2B"),
]


def _post(client: TestClient, filters: dict[str, Any]) -> dict:
    response = client.post("/discover/registry", json={"filters": filters, "limit": 30})
    assert response.status_code == 200, response.text
    return response.json()


# ── L'échelle, à UN seul endroit ────────────────────────────────────────────


def test_france_reste_un_palier_nommable_mais_sort_de_l_echelle_automatique() -> None:
    assert zone_tiers.ZONE_TIERS == ("city", "radius_50", "department", "region", "france")
    assert zone_tiers.ZONE_AUTO_MAX_TIER == "region"
    assert zone_tiers.zone_tiers_after("city") == ("radius_50", "department", "region")
    assert "france" not in zone_tiers.zone_tiers_after("city"), "DIT NON : aucun palier au-delà du plafond"
    assert zone_tiers.zone_tiers_after("region") == ()
    assert zone_tiers.ZONE_TIERS_CONSTANTS["autoMaxTier"] == "region"
    assert "france" in zone_tiers.ZONE_TIERS_CONSTANTS["headlines"]["fr"], "une recherche France explicite se nomme"


def test_depuis_25_km_les_paliers_sont_50_km_departement_region_jamais_100_km() -> None:
    assert router._tiers_to_try(router.DiscoverFilters(city="Lille", radiusKm=25)) == (
        "radius_50",
        "department",
        "region",
    )
    assert router._tiers_to_try(router.DiscoverFilters(city="Lille", radiusKm=50)) == ("department", "region")
    assert router._tiers_to_try(router.DiscoverFilters(city="Lille")) == ("radius_50", "department", "region")


# ── Le dernier barreau rend 0 : AUCUNE requête France, on compte les appels ─


def test_zero_compte_a_la_region_aucune_requete_france_n_est_emise(client: TestClient, stub) -> None:
    france = [_row(900 + i, city="NICE", department="06") for i in range(40)]
    gouv = stub({"radius_50": [], "department": [], "region": [], "france": france})

    body = _post(client, {"city": "Lille", "radiusKm": 25})

    zones = gouv.zones()
    assert zones.count("france") == 0, f"un élargissement automatique n'émet JAMAIS d'appel France : {zones}"
    assert "region" in zones, "la région, elle, est bien tentée"
    # 2710N — « rien d'ajouté » ne veut pas dire « rien à dire » : la recherche S'EST arrêtée à la région, l'écran le DIT.
    widening = body["zoneWidening"]
    assert widening["widenedCount"] == 0 and widening["autoCapReached"] is True
    assert widening["tier"] == "region" and widening["steps"] == ["radius_50", "department", "region"]
    assert not {r["siren"] for r in france} & {c["siren"] for c in body["candidates"]}


def test_region_sous_le_seuil_le_bandeau_s_arrete_a_la_region(client: TestClient, stub) -> None:
    gouv = stub({"radius_50": [], "department": [], "region": [_row(1, city="AMIENS", department="80")], "france": []})

    body = _post(client, {"city": "Lille", "radiusKm": 25})

    assert "france" not in gouv.zones()
    widening = body["zoneWidening"]
    assert widening["tier"] == "region"
    assert widening["steps"] == ["radius_50", "department", "region"]


def test_le_departement_suffit_ni_region_ni_france(client: TestClient, stub) -> None:
    gouv = stub(
        {"radius_50": [], "department": [_row(10 + i, city="DOUAI") for i in range(30)], "region": [], "france": []}
    )

    body = _post(client, {"city": "Lille", "radiusKm": 25})

    assert body["zoneWidening"]["tier"] == "department"
    assert body["zoneWidening"]["area"] == "Nord"
    assert "region" not in gouv.zones() and "france" not in gouv.zones()


def test_le_palier_departement_cherche_le_departement_de_la_ville(client: TestClient, stub) -> None:
    gouv = stub({"radius_50": [], "department": [_row(10 + i, city="DOUAI") for i in range(12)]})

    _post(client, {"city": "Lille", "radiusKm": 25})

    departments = [f.department for f in gouv.calls if gouv.zone_of(f) == "department"]
    assert departments == ["59"]


def test_assez_de_comptes_a_25_km_aucun_palier(client: TestClient, stub) -> None:
    gouv = stub({"radius_25": [_at(i, 20) for i in range(30)], "department": [_row(70)], "france": [_row(71)]})

    body = _post(client, {"city": "Lille", "radiusKm": 25})

    assert not body.get("zoneWidening")
    assert set(gouv.zones()) == {"radius_25"}


# ── Le geste « revenir au palier d'avant » (#4627.1) ────────────────────────


def test_revenir_a_50_km_ne_tente_aucun_palier_au_dela_et_garde_les_comptes(client: TestClient, stub) -> None:
    near = [_at(i, 30) for i in range(3)]
    gouv = stub({"radius_50": near, "department": [_row(70 + i) for i in range(20)]})

    body = _post(client, {"city": "Lille", "radiusKm": 25, "zoneCeiling": "radius_50"})

    assert body["zoneWidening"]["tier"] == "radius_50"
    assert {r["siren"] for r in near} <= {c["siren"] for c in body["candidates"]}, "jamais zéro en resserrant"
    assert "department" not in gouv.zones()


def test_revenir_au_departement_borne_l_echelle(client: TestClient, stub) -> None:
    gouv = stub({"radius_50": [], "department": [_row(10, city="DOUAI")], "region": [_row(70 + i) for i in range(20)]})

    body = _post(client, {"city": "Lille", "radiusKm": 25, "zoneCeiling": "department"})

    assert body["zoneWidening"]["tier"] == "department"
    assert "region" not in gouv.zones() and "france" not in gouv.zones()


# ── Le rayon AFFICHÉ est le rayon APPLIQUÉ (mesure de prod du 27/10) ─────────


def test_une_source_qui_ignore_la_ville_ne_remplit_pas_le_rayon(client: TestClient, stub, monkeypatch) -> None:
    """La source gratuite ne trouve rien dans les cercles ; la source qui ignore la ville rend la France entière.
    Aucune de ces lignes ne sort comme « dans les 100 km de Lille »."""
    gouv = stub({"radius_50": [], "department": [_row(10 + i, city="ROUBAIX") for i in range(12)]})

    async def _pappers_ignores_city(filters: Any, limit: int, degraded: Any = None) -> list[dict]:
        if filters.radius_km or filters.commune_code:
            return [dict(row) for row in [*_FAR, _row(806, city="LILLE")]]
        return []

    monkeypatch.setattr("app.routers.discover._registry_search", _pappers_ignores_city)

    body = _post(client, {"city": "Lille", "radiusKm": 25})

    sirens = {c["siren"] for c in body["candidates"]}
    assert not sirens & {r["siren"] for r in _FAR}, "Saint-Jean-de-Luz, Montpellier, Nevers, Arcachon, Calvi : non"
    assert _row(806)["siren"] in sirens, "un compte DE la ville est dans tout rayon autour d'elle"
    assert "department" in gouv.zones(), "le rayon n'a pas suffi : on élargit au département, on ne remplit pas"
    assert not any("city" in (d.get("fields") or []) for d in body.get("degraded") or []), (
        "la ville a été appliquée : l'écran ne dit plus « non appliqué »"
    )


def test_une_source_qui_ignore_la_region_ne_rend_que_ses_departements() -> None:
    base = router.CompanyDiscoveryFilters(region="32")
    rows = [{"siren": "1", "department": "59"}, {"siren": "2", "department": "06"}, {"siren": "3", "department": None}]
    kept = router._kept_in_requested_zone(rows, base, None, ["region"])
    assert [r["siren"] for r in kept] == ["1"]


def test_une_ville_exacte_garde_les_lignes_de_la_commune_seule() -> None:
    base = router.CompanyDiscoveryFilters(commune_code="59350")
    rows = [{"siren": "1", "city": "Lille"}, {"siren": "2", "city": "CALVI"}, {"siren": "3", "city": None}]
    kept = router._kept_in_requested_zone(rows, base, _LILLE, ["city"])
    assert [r["siren"] for r in kept] == ["1"]


# ── Les mots de l'écran et de Laura ─────────────────────────────────────────


def test_chaque_palier_se_nomme_en_francais_et_en_anglais() -> None:
    dept = {"place": "Lille", "tier": "department", "area": "Nord"}
    france = {"place": "Lille", "tier": "france"}
    assert zone_tiers.zone_widening_headline(dept) == "Peu de comptes à Lille : recherche élargie au département (Nord)"
    assert zone_tiers.zone_widening_headline(france) == "Peu de comptes à Lille : recherche élargie à toute la France"
    assert (
        zone_tiers.zone_widening_headline(dept, "en")
        == "Few accounts in Lille: search widened to the department (Nord)"
    )
    assert zone_tiers.zone_widening_headline(france, "en") == "Few accounts in Lille: search widened to all of France"


def test_laura_dit_le_palier_atteint_sans_rien_demander() -> None:
    assert (
        zone_tiers.laura_zone_line({"place": "Lille", "tier": "france"}, 0, 12)
        == "J'ai élargi à toute la France : 0 comptes à Lille, 12 autour"
    )
    line = zone_tiers.laura_zone_line({"place": "Lille", "tier": "department", "area": "Nord"}, 2, 9)
    assert line == "J'ai élargi au département (Nord) : 2 comptes à Lille, 9 autour"
    assert "?" not in line


def test_l_etiquette_d_un_compte_ajoute_par_la_france_est_son_departement() -> None:
    # #4657 (recette prod 27/10) — la ligne NOMME son palier ; son département s'y ajoute, connu ou pas elle parle.
    assert zone_tiers.candidate_zone_label({"tier": "france", "area": "Alpes-Maritimes"}, "Lille") == (
        "Élargi à toute la France · Alpes-Maritimes"
    )
    assert (
        zone_tiers.candidate_zone_label({"tier": "department", "area": "Nord"}, "Lille")
        == "Élargi au département · Nord"
    )
    assert zone_tiers.candidate_zone_label({"tier": "region"}, "Lille") == "Élargi à la région"


# ── 2710N — l'arrêt à la région se DIT, même sans un compte de plus (#4640) ──────────────────────────────────────


def test_la_region_n_ajoute_rien_tier_departement_ET_arret_dit(client: TestClient, stub) -> None:
    """Défaut 1 : ``tier`` = ce qui a été TROUVÉ (le département), ``autoCapReached`` = ce qui a été TENTÉ (la région).
    Les deux dans la même assertion — l'un ne remplace pas l'autre."""
    stub({"radius_50": [], "department": [_row(10 + i, city="DOUAI") for i in range(2)], "region": [], "france": []})

    widening = _post(client, {"city": "Lille", "radiusKm": 25})["zoneWidening"]

    assert (widening["tier"], widening["autoCapReached"]) == ("department", True)
    assert widening["widenedCount"] == 2
    assert widening["steps"] == ["radius_50", "department"], "les barreaux franchis jusqu'au trouvé, jamais au-delà (#4627)"


def test_aucun_barreau_n_ajoute_rien_le_bandeau_existe_et_dit_cherche_jusqu_a(client: TestClient, stub) -> None:
    """Défaut 2 : le cas le plus fréquent (3 comptes à Lille, rien au département ni à la région) ne se tait plus."""
    stub({"radius_50": [], "department": [], "region": [], "france": []})

    widening = _post(client, {"city": "Lille", "radiusKm": 25})["zoneWidening"]

    assert widening["widenedCount"] == 0 and widening["autoCapReached"] is True
    assert widening["tier"] == "region" and widening["area"] == "Hauts-de-France"
    headline = zone_tiers.zone_widening_headline(widening)
    assert headline == "Peu de comptes à Lille : cherché jusqu'à Hauts-de-France, sans compte de plus."
    assert "élargie" not in headline, "aucun élargissement n'est promis"


def test_la_boucle_s_arrete_sur_le_temps_avant_la_region_l_arret_n_est_pas_dit(
    stub, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Le test qui dit NON : un ``deadline`` qui coupe la boucle avant le plafond n'est PAS « arrêté à la région »."""
    import asyncio
    import time as real_time

    clock = [0.0]

    class _Clock:
        def __getattr__(self, name: str) -> Any:
            return getattr(real_time, name)

        @staticmethod
        def monotonic() -> float:
            return clock[0]

    def _department_eats_the_time(filters: Any) -> list[dict]:
        clock[0] = 100.0
        return []

    gouv = stub({"department": _department_eats_the_time, "region": [_row(1, city="AMIENS", department="80")]})
    monkeypatch.setattr(router, "time", _Clock())
    zone_out: dict[str, Any] = {}

    asyncio.run(
        router._widen_by_zone_tiers(
            router.DiscoverFilters(city="Lille", radiusKm=100), _LILLE, [], 30, [], 50.0, 50.0, zone_out, {}
        )
    )

    assert "region" not in gouv.zones(), "le temps a coupé la boucle avant la région"
    assert not zone_out.get("autoCapReached"), "rien ne dit « arrêté à la région » : la région n'a pas été tentée"


def test_au_dessus_du_seuil_aucun_bandeau_aucun_arret(client: TestClient, stub) -> None:
    """#3876 tient : assez de comptes, la ville reste la ville — ni bandeau, ni ``autoCapReached``."""
    stub({"radius_25": [_at(i, 20) for i in range(30)], "department": [], "region": []})

    body = _post(client, {"city": "Lille", "radiusKm": 25})

    assert "zoneWidening" not in body or not body["zoneWidening"]


def test_le_plafond_demande_plus_bas_n_est_pas_un_arret_a_la_region(client: TestClient, stub) -> None:
    stub({"radius_50": [], "department": [], "region": []})

    body = _post(client, {"city": "Lille", "radiusKm": 25, "zoneCeiling": "department"})

    assert not body.get("zoneWidening"), "borné au département par l'utilisateur : la région n'a pas été tentée"


def test_zone_widening_of_list_preserve_l_arret_et_rend_sans_compte_elargi() -> None:
    widening = {
        "place": "Lille",
        "tier": "region",
        "steps": ["department", "region"],
        "area": "Hauts-de-France",
        "exactCount": 3,
        "widenedCount": 0,
        "autoCapReached": True,
    }
    rows = [{"zone": None, "qualification": {"verdict": "match"}} for _ in range(3)]

    out = zone_tiers.zone_widening_of_list(widening, rows)

    assert out is not None and out["autoCapReached"] is True and out["widenedCount"] == 0 and out["exactCount"] == 3
    assert zone_tiers.zone_widening_of_list({**widening, "autoCapReached": False}, rows) is None
    assert zone_tiers.zone_widening_of_list({k: v for k, v in widening.items() if k != "autoCapReached"}, rows) is None


def test_la_phrase_cherche_sans_aire_et_en_anglais() -> None:
    base = {"place": "Lille", "tier": "region", "widenedCount": 0, "autoCapReached": True}
    assert (
        zone_tiers.zone_widening_headline(base)
        == "Peu de comptes à Lille : cherché jusqu'à la région, sans compte de plus."
    )
    assert (
        zone_tiers.zone_widening_headline({**base, "area": "Hauts-de-France"}, "en")
        == "Few accounts in Lille: searched up to Hauts-de-France, with no further account."
    )
    # Un barreau gagnant garde SA phrase, arrêt dit ou non.
    won = {**base, "tier": "department", "widenedCount": 2, "area": "Nord"}
    assert zone_tiers.zone_widening_headline(won).endswith("élargie au département (Nord)")


def test_trois_comptes_a_lille_rien_au_dessus_le_bandeau_existe(client: TestClient, stub) -> None:
    """Le cas de Louis : 3 comptes à Lille, le département et la région n'ajoutent rien — avec des LIGNES rendues."""
    stub({"radius_25": [_at(i, 20) for i in range(3)], "department": [], "region": [], "france": []})

    body = _post(client, {"city": "Lille", "radiusKm": 25})

    assert len(body["candidates"]) == 3
    widening = body["zoneWidening"]
    assert (widening["widenedCount"], widening["exactCount"], widening["autoCapReached"]) == (0, 3, True)
