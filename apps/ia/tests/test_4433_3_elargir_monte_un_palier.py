"""#4433.3 (recette prod 01/11) — le geste « Élargir la zone » MONTE d'un palier, il ne retire pas la ville.

Recette : « Élargir la zone » retirait la ville (URL ?freetext seul) au lieu de monter un palier, et aucune ligne ne
portait « Élargi à ». Le geste pose maintenant ``zoneRaise`` (département, puis région) : le serveur tente les paliers
JUSQU'À celui-là, UN palier par geste (jamais « tout d'un coup »), et chaque compte ajouté porte son palier. Jamais la
France (c144 : un geste de zone ne dépasse pas la région) — un ``zoneRaise`` à ``france`` est refusé (422).
"""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from tests import test_4429_echelle_100km as echelle
from tests.test_4429_echelle_100km import _at, _row

stub = echelle.stub


def _post(client: TestClient, filters: dict[str, Any]) -> Any:
    return client.post("/discover/registry", json={"filters": filters, "limit": 25})


def test_zone_raise_department_stops_at_the_department_and_labels_the_added_accounts(client: TestClient, stub) -> None:
    """Sans le geste, 3 comptes au département (< seuil) font monter jusqu'à la région : avec lui, UN palier."""
    near = [_row(500 + i, city="ROUBAIX", department="59") for i in range(3)]
    gouv = stub(
        {
            "radius_50": [_at(i, 20) for i in range(2)],
            "department": near,
            "region": [_row(900, city="AMIENS", department="80")],
        }
    )

    response = _post(client, {"city": "Lille", "radiusKm": 25, "zoneRaise": "department"})
    assert response.status_code == 200, response.text
    body = response.json()

    assert "department" in gouv.zones()
    assert "region" not in gouv.zones(), "UN palier par geste : la région n'est pas tentée"
    assert body["zoneWidening"]["tier"] == "department"
    widened = [c for c in body["candidates"] if c.get("zone")]
    # Louis 02/11 (#4429) : 25 km → 50 km → département — le 50 km est franchi avant le palier demandé, chacun nommé.
    assert widened and {c["zone"]["tier"] for c in widened} == {"radius_50", "department"}, (
        "chaque compte ajouté porte son palier"
    )


def test_zone_raise_region_goes_through_the_department_first_never_to_france(client: TestClient, stub) -> None:
    gouv = stub(
        {
            "radius_50": [_at(i, 20) for i in range(2)],
            "department": [_row(500, city="ROUBAIX", department="59")],
            "region": [_row(900, city="AMIENS", department="80")],
            "france": [_row(990, city="NICE", department="06")],
        }
    )

    body = _post(client, {"city": "Lille", "radiusKm": 25, "zoneRaise": "region"}).json()

    assert "department" in gouv.zones() and "region" in gouv.zones()
    assert "france" not in gouv.zones(), "DIT NON : un geste de zone ne monte jamais à la France (c144)"
    assert body["zoneWidening"]["tier"] == "region"


def test_zone_raise_climbs_even_when_the_city_already_has_enough(client: TestClient, stub) -> None:
    gouv = stub(
        {
            "radius_50": [_at(i, 20) for i in range(30)],
            "department": [_row(500, city="ROUBAIX", department="59")],
            "region": [_row(900, city="AMIENS", department="80")],
        }
    )

    _post(client, {"city": "Lille", "radiusKm": 25, "zoneRaise": "department"})

    assert "department" in gouv.zones(), "le palier demandé est tenté même à volume suffisant"
    assert "region" not in gouv.zones()


def test_without_zone_raise_a_full_city_stays_the_city(client: TestClient, stub) -> None:
    gouv = stub({"radius_50": [_at(i, 20) for i in range(30)], "department": [_row(500, city="ROUBAIX")]})

    body = _post(client, {"city": "Lille", "radiusKm": 100}).json()

    assert set(gouv.zones()) == {"radius_50"}
    assert not body.get("zoneWidening")


def test_zone_raise_france_is_refused(client: TestClient, stub) -> None:
    stub({"city": []})
    assert _post(client, {"city": "Lille", "zoneRaise": "france"}).status_code == 422
