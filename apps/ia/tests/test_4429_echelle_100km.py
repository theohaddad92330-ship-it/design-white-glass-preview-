"""#4429 (décision Louis 25/10/2026) — l'échelle automatique est ville → 50 km → département → région, UN barreau à la fois.
Louis 02/11/2026 (QCM) : le barreau 100 km est RETIRÉ de l'échelle automatique (il reste un réglage manuel, servi par
les sept cercles de `zone_cover`) ; l'arrêt à la région (c144) tient.

Mesuré le 25/10 : « 0 compte à Lille » devenait « 12 comptes dans toute la France » en un seul saut. Ces tests savent
dire NON à ce saut : avec 0 résultat sur la ville, le premier élargissement est 100 km, jamais le pays ; chaque barreau
ne s'ouvre que si le précédent est sous le seuil ; le registre public plafonne `/near_point` à 50 km, donc le cercle de
100 km est couvert par SEPT cercles de 50 km (`zone_cover`), les comptes mesurés hors des 100 km étant écartés.
Sans réseau : la source gouv.fr est remplacée par un faux qui trace chaque appel.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.services import zone_cover, zone_tiers
from app.services.zone_tiers import distance_km

_LILLE = {
    "code": "59350",
    "name": "Lille",
    "postalCodes": ["59000"],
    "department": "59",
    "departmentName": "Nord",
    "region": "32",
    "latitude": 50.6292,
    "longitude": 3.0573,
}

Rows = list[dict] | Callable[[Any], list[dict]]


def _row(index: int, city: str = "LILLE", department: str = "59", **over: Any) -> dict:
    return {
        "name": f"SOCIETE {index:03d} SAS",
        "siren": f"{500000000 + index}",
        "nafCode": "62.02A",
        "sector": "Conseil en systèmes et logiciels informatiques",
        "city": city,
        "department": department,
        "headcountRange": "50 à 99 salariés",
        "headcountTranche": "21",
        "legalCategory": "5710",
        **over,
    }


def _at(index: int, km_north: float, **over: Any) -> dict:
    """Un compte à ``km_north`` km au nord de Lille (position publiée par le registre)."""
    return _row(
        index, city="ARRAS", latitude=_LILLE["latitude"] + km_north / 111.19, longitude=_LILLE["longitude"], **over
    )


class _Gouv:
    """La source gouv.fr par maille ; une clé peut porter une fonction du filtre (pour répondre par centre de cercle)."""

    def __init__(self, by_zone: dict[str, Rows]) -> None:
        self.by_zone = by_zone
        self.calls: list[Any] = []

    @staticmethod
    def zone_of(filters: Any) -> str:
        if filters.radius_km:
            return f"radius_{int(filters.radius_km)}"
        if filters.commune_code:
            return "city"
        if filters.department or filters.departments:
            return "department"
        if filters.region or filters.regions:
            return "region"
        return "france"

    async def __call__(self, filters: Any, limit: int, degraded: Any = None, *, page: int = 1) -> list[dict]:
        self.calls.append(filters)
        rows = self.by_zone.get(self.zone_of(filters), [])
        rows = rows(filters) if callable(rows) else rows
        return [dict(row) for row in rows][:limit]

    def zones(self) -> list[str]:
        return [self.zone_of(f) for f in self.calls]


async def _no_pappers(filters: Any, limit: int, degraded: Any = None) -> list[dict]:
    return []


@pytest.fixture
def stub(monkeypatch: pytest.MonkeyPatch):
    def install(by_zone: dict[str, Rows]) -> _Gouv:
        source = _Gouv(by_zone)
        monkeypatch.setattr("app.routers.discover._registry_search", _no_pappers)
        monkeypatch.setattr("app.routers.discover._fallback_search", source)
        monkeypatch.setattr("app.routers.discover._fallback_search_page", source)
        monkeypatch.setattr("app.routers.discover.call_claude", AsyncMock(return_value=({"angles": []}, None)))
        monkeypatch.setattr("app.routers.discover.search_communes", AsyncMock(return_value=[_LILLE]))

        async def _no_signals(*args: Any, **kwargs: Any) -> list[dict]:
            return []

        for name in ("public_tenders", "it_job_signals", "legal_signals", "funding_signals", "_press_for",
                     "_ats_for_card", "_peek_shared_jobs", "_adzuna_for_card", "_page_volumes"):  # fmt: skip
            monkeypatch.setattr(f"app.routers.discover.{name}", _no_signals)
        return source

    return install


def _post(client: TestClient, filters: dict) -> dict:
    response = client.post("/discover/registry", json={"filters": filters, "limit": 30})
    assert response.status_code == 200, response.text
    return response.json()


# ── L'échelle, à UN seul endroit ────────────────────────────────────────────


def test_l_echelle_est_ville_50_km_departement_region() -> None:
    # c144 (Louis 27/10 au soir) — l'échelle AUTOMATIQUE plafonne à la région ; `france` reste nommable.
    assert zone_tiers.ZONE_TIERS == ("city", "radius_50", "department", "region", "france")
    assert zone_tiers.zone_tiers_after("city") == ("radius_50", "department", "region")
    assert zone_tiers.ZONE_TIER_RADIUS_KM == {"radius_50": 50}
    assert "radius_100" not in zone_tiers.ZONE_TIERS  # DIT NON : aucun barreau 100 km dans l'échelle automatique


def test_le_rayon_manuel_reste_un_reglage_de_l_utilisateur() -> None:
    # 100 km reste un réglage MANUEL (curseur), hors échelle automatique.
    assert zone_tiers.MANUAL_RADIUS_KM == (10, 25, 50, 100)


# ── Critère 1 — AUCUN SAUT ──────────────────────────────────────────────────


def test_zero_a_lille_le_premier_elargissement_est_50_km_jamais_la_france(client: TestClient, stub) -> None:
    around = [_at(i, 20 + i // 2) for i in range(30)]
    gouv = stub(
        {
            "city": [],
            "radius_50": around,
            "france": [_row(900 + i, city="MARSEILLE", department="13") for i in range(12)],
        }
    )

    body = _post(client, {"city": "Lille"})

    assert body["zoneWidening"]["tier"] == "radius_50"
    assert body["zoneWidening"]["steps"] == ["radius_50"]
    assert {c["siren"] for c in body["candidates"]} <= {r["siren"] for r in around}
    assert "france" not in gouv.zones(), "le pays n'est jamais interrogé quand 50 km suffit"
    assert "region" not in gouv.zones()


def test_le_saut_lille_france_est_interdit_meme_quand_la_france_a_des_comptes(client: TestClient, stub) -> None:
    gouv = stub({"city": [], "radius_50": [], "department": [], "region": [_row(i, city="AMIENS", department="80") for i in range(11)],
                 "france": [_row(900 + i, city="NICE", department="06") for i in range(40)]})  # fmt: skip

    body = _post(client, {"city": "Lille"})

    assert body["zoneWidening"]["tier"] == "region"
    assert body["zoneWidening"]["steps"] == ["radius_50", "department", "region"]
    assert "france" not in gouv.zones(), "la région suffit : le pays n'est pas tenté"
    sirens = {c["siren"] for c in body["candidates"]}
    assert not any(s.startswith("5000009") for s in sirens), "aucun compte niçois : le pays n'a pas été tenté"


# ── Critère 2 — un par un, on s'arrête au seuil ─────────────────────────────


def test_les_barreaux_s_enchainent_dans_l_ordre_et_la_region_arrive_en_dernier(client: TestClient, stub) -> None:
    gouv = stub({"city": [], "radius_50": [], "region": [_row(1, city="AMIENS", department="80")],
                 "france": [_row(900 + i, city="NICE", department="06") for i in range(12)]})  # fmt: skip

    body = _post(client, {"city": "Lille"})

    # c144 — sous le seuil après la région, le pays n'est JAMAIS tenté : la région est le dernier barreau.
    assert body["zoneWidening"]["tier"] == "region"
    assert body["zoneWidening"]["steps"] == ["radius_50", "department", "region"]
    assert "exhausted" not in body["zoneWidening"]
    zones = gouv.zones()
    assert zones[0] == "city"
    assert zones.index("radius_50") < zones.index("department") < zones.index("region")
    assert zones.count("france") == 0


def test_seuil_atteint_a_50_km_la_region_n_est_pas_interrogee(client: TestClient, stub) -> None:
    gouv = stub(
        {"city": [_row(1)], "radius_50": [_at(i, 30) for i in range(30)], "region": [_row(70 + i) for i in range(20)]}
    )

    body = _post(client, {"city": "Lille"})

    assert body["zoneWidening"]["tier"] == "radius_50"  # 50 km suffit avant le département
    assert "region" not in gouv.zones() and "france" not in gouv.zones()


def test_dit_non_assez_de_comptes_sur_la_ville_aucun_elargissement(client: TestClient, stub) -> None:
    """#3876 : une ville ne devient jamais silencieusement son département (ni son rayon)."""
    gouv = stub({"city": [_row(i) for i in range(30)], "radius_50": [_at(100 + i, 40) for i in range(40)]})

    body = _post(client, {"city": "Lille"})

    assert not body.get("zoneWidening")
    # 25 lignes = une page pleine du registre : la page 2 de la commune se lit aussi, d'où `set`.
    assert set(gouv.zones()) == {"city"}


# ── Le mécanisme des cercles ─────────────────────────────────────────────────


def test_le_registre_plafonne_a_50_km_donc_jamais_un_appel_au_dela(client: TestClient, stub) -> None:
    gouv = stub({"city": [], "radius_50": [_at(i, 20) for i in range(3)], "region": [], "france": []})

    _post(client, {"city": "Lille"})

    circles = [f for f in gouv.calls if f.radius_km]
    assert circles and all(f.radius_km <= 50 for f in circles)
    assert len({(round(f.latitude, 4), round(f.longitude, 4)) for f in circles}) == 1, "50 km = le cercle central seul"


def test_un_compte_mesure_au_dela_de_50_km_est_ecarte_un_compte_a_40_km_est_etiquete(client: TestClient, stub) -> None:
    near, far = _at(1, 40), _at(2, 80)
    stub({"city": [], "radius_50": lambda f: [near, far], "region": [], "france": []})

    body = _post(client, {"city": "Lille"})

    sirens = [c["siren"] for c in body["candidates"]]
    assert near["siren"] in sirens and far["siren"] not in sirens
    zone = next(c["zone"] for c in body["candidates"] if c["siren"] == near["siren"])
    assert zone["tier"] == "radius_50" and zone["distanceKm"] == pytest.approx(40, abs=1)


# ── La géométrie, sans réseau ───────────────────────────────────────────────


def test_sept_cercles_de_50_km_couvrent_le_cercle_de_100_km() -> None:
    centres = zone_cover.cover_centres(_LILLE["latitude"], _LILLE["longitude"])
    assert len(centres) == 7 and centres[0] == (_LILLE["latitude"], _LILLE["longitude"])
    uncovered = 0
    for ring in range(0, 21):
        for step in range(0, 72):
            r, theta = 100 * ring / 20, math.radians(step * 5)
            lat = _LILLE["latitude"] + r * math.cos(theta) / 111.19
            lon = _LILLE["longitude"] + r * math.sin(theta) / (111.19 * math.cos(math.radians(_LILLE["latitude"])))
            if min(distance_km(lat, lon, c_lat, c_lon) for c_lat, c_lon in centres) > 50.5:
                uncovered += 1
    assert uncovered == 0


def test_le_recouvrement_dit_non_a_une_aire_que_les_sept_cercles_ne_couvrent_pas() -> None:
    centres = zone_cover.cover_centres(_LILLE["latitude"], _LILLE["longitude"])
    lat = _LILLE["latitude"] + 150 / 111.19
    assert min(distance_km(lat, _LILLE["longitude"], c_lat, c_lon) for c_lat, c_lon in centres) > 50.5


# ── Le geste qui revient au barreau précédent ───────────────────────────────


def test_le_plafond_de_zone_ne_depasse_pas_le_barreau_demande(client: TestClient, stub) -> None:
    gouv = stub({"city": [], "radius_50": [_at(1, 30)], "region": [_row(70 + i) for i in range(20)]})

    body = _post(client, {"city": "Lille", "zoneCeiling": "radius_50"})

    assert body["zoneWidening"]["tier"] == "radius_50"  # 50 km suffit avant le département
    assert "region" not in gouv.zones()


def test_revenir_a_la_ville_seule_ne_tente_aucun_barreau(client: TestClient, stub) -> None:
    gouv = stub({"city": [_row(0)], "radius_50": [_at(i, 30) for i in range(20)]})

    body = _post(client, {"city": "Lille", "zoneStrict": True})

    assert not body.get("zoneWidening")
    # 25 lignes = une page pleine du registre : la page 2 de la commune se lit aussi, d'où `set`.
    assert set(gouv.zones()) == {"city"}


# ── Laura : même échelle, même implémentation ───────────────────────────────


def test_laura_dit_le_barreau_50_km_avec_les_mots_de_l_ecran() -> None:
    widening = {"place": "Lille", "tier": "radius_50"}
    assert zone_tiers.zone_widening_headline(widening) == "Peu de comptes à Lille : recherche élargie à 50 km"
    assert zone_tiers.laura_zone_line(widening, 3, 9) == "J'ai élargi à 50 km : 3 comptes à Lille, 9 autour"


def test_laura_n_a_pas_sa_propre_echelle() -> None:
    """Une seule implémentation (GA-26) : l'outil de Laura ne redéfinit ni barreau ni rayon d'élargissement."""
    from pathlib import Path

    source = (Path(__file__).resolve().parents[1] / "app/services/chat_tools.py").read_text(encoding="utf-8")
    assert "radius_100" not in source and "radius_50" not in source and "radius_25" not in source
    assert "LAURA_RADIUS_KM" in source and "ZONE_TIER_RADIUS_KM" not in source
