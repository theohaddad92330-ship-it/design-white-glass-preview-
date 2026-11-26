"""#4515.1 / #4515.4 (Louis 24/10), RÉVISÉ par #4641 (Louis 27/10 : 100 km au lieu de 25) — une ville seule part au
rayon par défaut, et s'élargit ensuite. Revient sur #4429 (« ville stricte d'abord ») ; garde #3876 : le palier atteint
est DIT, jamais silencieux.

Le web envoie ``radiusKm: 100`` par défaut avec une ville. Ce rayon-là est le POINT DE DÉPART, pas une maille choisie :
il s'élargit encore, à la grande région (jamais la France, #4640). Un autre rayon (10, 25, 50) reste la maille voulue et
ne s'élargit pas.
"""

from __future__ import annotations

from app.routers import discover as router
from app.services.zone_tiers import zone_tiers_after

COMMUNE = {"name": "Lille", "code": "59350", "department": "59", "region": "32", "latitude": 50.63, "longitude": 3.06}


def _filters(**overrides):
    return router.DiscoverFilters(**{"city": "Lille", **overrides})


def test_le_rayon_par_defaut_s_elargit_encore() -> None:
    # Louis 01/11 (#4515) — le défaut est 25 km (100 km du 27/10, #4641, révisé).
    assert router.DEFAULT_CITY_RADIUS_KM == 25
    assert router._widenable_city(_filters(radiusKm=25), COMMUNE)


def test_un_rayon_choisi_autre_que_le_defaut_reste_la_maille() -> None:
    # La garde dit NON : 10, 25 ou 50 km choisis ne s'élargissent pas, « ville seule » (zoneStrict) non plus.
    assert not router._widenable_city(_filters(radiusKm=10), COMMUNE)
    assert not router._widenable_city(_filters(radiusKm=10), COMMUNE)
    assert not router._widenable_city(_filters(radiusKm=50), COMMUNE)
    assert not router._widenable_city(_filters(radiusKm=100), COMMUNE), "100 km choisi à la main = la maille (Louis 02/11)"
    assert not router._widenable_city(_filters(radiusKm=25, zoneStrict=True), COMMUNE)


def test_le_rayon_par_defaut_ne_saute_pas_a_la_france() -> None:
    # Sans rayon, l'échelle part de 25 km : 50 km, département, région (Louis 02/11 : aucun barreau 100 km). Elle
    # s'arrête à la RÉGION : la France n'est plus un barreau automatique (c144, Louis 27/10 au soir, qui renverse
    # c143 — l'arrêt à la région de #4640 revient). Ce test garde donc les DEUX : aucun saut, et aucun pays.
    assert router._tiers_to_try(_filters()) == ("radius_50", "department", "region")
    assert router._tiers_to_try(_filters())[0] == zone_tiers_after("city")[0] == "radius_50"
    assert router._tiers_to_try(_filters(radiusKm=100)) == ("department", "region")
    assert "france" not in router._tiers_to_try(_filters()), "DIT NON : l'automatique ne monte jamais au pays"
