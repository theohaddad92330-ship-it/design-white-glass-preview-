"""#5069 (lot 777) — « Lille à 25 km » : le rayon tient VRAIMENT, même quand le site ne publie pas sa position.

Constat prod (02/11) : ``city=Lille&cityRadiusKm=25`` rendait Lille, Lesquin et Mouvaux (à moins de 25 km) comme
« élargis au département » SANS distance, donc sous « Au-delà de 25 km ». Cause : un compte du palier département
dont le registre ne publie pas la position n'avait aucune distance (``_row_distance_km`` → ``None``). La distance se
mesure désormais depuis la COMMUNE du compte, lue au référentiel (nom exact + même département) — jamais devinée.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.test_4429_zone_tiers import _post, _row, stub  # noqa: F401  (fixture `stub`)

_COMMUNES = {
    "lille": {"code": "59350", "name": "Lille", "postalCodes": ["59000"], "department": "59",
              "departmentName": "Nord", "region": "32", "latitude": 50.6292, "longitude": 3.0573},
    "lesquin": {"code": "59328", "name": "Lesquin", "postalCodes": ["59810"], "department": "59",
                "departmentName": "Nord", "region": "32", "latitude": 50.5895, "longitude": 3.1129},
    "mouvaux": {"code": "59421", "name": "Mouvaux", "postalCodes": ["59420"], "department": "59",
                "departmentName": "Nord", "region": "32", "latitude": 50.7000, "longitude": 3.1400},
    "aubigny-au-bac": {"code": "59018", "name": "Aubigny-au-Bac", "postalCodes": ["59265"], "department": "59",
                       "departmentName": "Nord", "region": "32", "latitude": 50.3200, "longitude": 3.1500},
}


async def _communes(query: str, **_: Any) -> list[dict]:
    key = query.strip().lower()
    return [dict(_COMMUNES[key])] if key in _COMMUNES else []


def test_un_compte_du_departement_sans_position_est_mesure_depuis_sa_commune(client: TestClient, stub, monkeypatch) -> None:  # noqa: F811
    dept = [
        _row(1, city="LILLE", department="59"),
        _row(2, city="LESQUIN", department="59"),
        _row(3, city="MOUVAUX", department="59"),
        _row(4, city="AUBIGNY-AU-BAC", department="59"),
        _row(5, city="VILLE INCONNUE", department="59"),
    ]
    stub({"department": dept})
    monkeypatch.setattr("app.routers.discover.search_communes", _communes)

    body = _post(client, {"city": "Lille", "radiusKm": 25, "zoneCeiling": "department"}, limit=25)

    zones = {c["name"]: c["zone"] for c in body["candidates"] if "zone" in c}
    assert zones["SOCIETE 001 SAS"]["distanceKm"] == pytest.approx(0.0, abs=0.5)
    assert zones["SOCIETE 002 SAS"]["distanceKm"] == pytest.approx(6.0, abs=1.0)
    assert zones["SOCIETE 003 SAS"]["distanceKm"] == pytest.approx(10.0, abs=2.0)
    assert zones["SOCIETE 004 SAS"]["distanceKm"] > 25  # Aubigny-au-Bac, réellement au-delà
    # Commune introuvable : aucune distance inventée (jamais « 0 »).
    assert "distanceKm" not in zones["SOCIETE 005 SAS"]
    assert all("latitude" not in c for c in body["candidates"])
