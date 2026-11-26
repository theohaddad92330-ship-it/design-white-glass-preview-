"""#4429 (décision Louis 25/10/2026) — le barreau « 100 km » : sept cercles de 50 km.

## Pourquoi cette voie

`/near_point` (registre public) plafonne à 50 km (`recherche_entreprises.MAX_RADIUS_KM`, mesuré le 04/09/2026) :
un cercle de 100 km ne peut pas lui être demandé tel quel. Les autres voies écartées :

* « les départements dont le chef-lieu est à moins de 100 km » demande une table de coordonnées de chefs-lieux que le
  dépôt n'a pas (la recopier de mémoire serait une donnée devinée) ou un appel réseau neuf par département ;
* un département n'est pas un cercle : il déborderait, ou en manquerait, selon la ville.

Le recouvrement de 7 disques est le recouvrement OPTIMAL d'un disque par sept disques égaux (rayon = la moitié du grand) :
un disque au centre et six autour, à ``R·√3/2`` du centre, tous les 60°. Il ne demande que la position de la commune
RÉSOLUE (déjà lue par `geo_communes`), aucun point deviné, et le même endpoint, avec ses mêmes filtres.

Les sept cercles couvrent PLUS que 100 km (jusqu'à ~136 km dans l'axe d'un cercle périphérique) : l'appelant écarte donc
tout compte dont la distance MESURÉE dépasse 100 km, et ne range pas à « 100 km » un compte sans position trouvé par un
cercle périphérique (rien ne prouve qu'il est dans le rayon).
"""

from __future__ import annotations

import math

from app.services.zone_tiers import ZONE_TIER_RADIUS_KM

#: Le rayon du barreau, d'après la table des paliers (un seul endroit, GA-26).
COVER_RADIUS_KM: float = 100.0

#: Le rayon d'un disque du recouvrement : la moitié du grand — c'est aussi le plafond du registre (50 km).
DISC_RADIUS_KM: float = COVER_RADIUS_KM / 2

_EARTH_RADIUS_KM = 6371.0


def _destination(lat: float, lon: float, bearing_deg: float, km: float) -> tuple[float, float]:
    """Le point à ``km`` km de ``(lat, lon)`` dans la direction ``bearing_deg`` (sphère)."""
    phi1, lam1 = math.radians(lat), math.radians(lon)
    theta, delta = math.radians(bearing_deg), km / _EARTH_RADIUS_KM
    phi2 = math.asin(math.sin(phi1) * math.cos(delta) + math.cos(phi1) * math.sin(delta) * math.cos(theta))
    lam2 = lam1 + math.atan2(
        math.sin(theta) * math.sin(delta) * math.cos(phi1), math.cos(delta) - math.sin(phi1) * math.sin(phi2)
    )
    return math.degrees(phi2), (math.degrees(lam2) + 540) % 360 - 180


def cover_centres(latitude: float, longitude: float) -> list[tuple[float, float]]:
    """Les sept centres (le premier est la commune), dans l'ordre où on les interroge : du plus proche au plus loin."""
    offset = COVER_RADIUS_KM * math.sqrt(3) / 2
    ring = [_destination(latitude, longitude, bearing, offset) for bearing in range(0, 360, 60)]
    return [(latitude, longitude), *ring]
