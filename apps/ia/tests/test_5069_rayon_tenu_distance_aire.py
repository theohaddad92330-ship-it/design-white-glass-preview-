"""#5069 — « Lille à 25 km » : un compte élargi au département porte sa distance MESURÉE quand le site publie sa position.

Constat prod (02/11) : ``city=Lille&cityRadiusKm=25`` rendait une boulangerie à ~40 km sous « Élargi au département ».
Le rayon 25 km reste élargissable (décision Louis 27/10 : plafond automatique = région), mais l'écran doit pouvoir
séparer ce qui sort du rayon : la distance voyage donc aussi sur une ligne d'AIRE. Sans position : aucune distance inventée.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from tests.test_4429_zone_tiers import _post, _row, stub  # noqa: F401  (fixture `stub`)


def test_une_ligne_elargie_au_departement_porte_sa_distance_mesuree(client: TestClient, stub) -> None:  # noqa: F811
    exact = [_row(i) for i in range(2)]
    # Blagnac publie sa position (~5,6 km de Toulouse) ; Muret n'en publie aucune.
    dept = exact + [
        _row(20, city="BLAGNAC", latitude=43.6370, longitude=1.3900),
        _row(21, city="MURET"),
    ]
    stub({"city": exact, "radius_50": exact, "department": dept})

    body = _post(client, {"city": "Toulouse", "radiusKm": 25, "zoneCeiling": "department"}, limit=25)

    zones = {c["name"]: c["zone"] for c in body["candidates"] if "zone" in c}
    assert zones["SOCIETE 020 SAS"]["tier"] == "department"
    assert zones["SOCIETE 020 SAS"]["area"] == "Haute-Garonne"
    assert zones["SOCIETE 020 SAS"]["distanceKm"] == pytest.approx(5.6, abs=0.5)
    # Sans position publiée : le département se nomme, aucune distance n'est inventée (jamais « 0 »).
    assert zones["SOCIETE 021 SAS"] == {"tier": "department", "area": "Haute-Garonne"}
    assert all("latitude" not in c for c in body["candidates"])
