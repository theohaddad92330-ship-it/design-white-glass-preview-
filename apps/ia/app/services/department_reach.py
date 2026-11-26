"""#4675 (L3) — les départements qu'un CERCLE recouvre, pour les sources qui ne lisent qu'un département.

Une ville + un rayon dessinent un cercle ; une source sans maille fine ne lit que des départements. Un département
est ajouté à la zone lue quand SA PRÉFECTURE est dans le cercle : c'est une PREUVE que le cercle y entre, jamais une
géographie devinée. Un département dont la préfecture est hors du cercle (même si un coin y entre) n'est pas ajouté —
l'offre manquée est le prix de ne rien inventer ; le filtre de cercle reste le juge final de chaque offre.

Source : coordonnées des préfectures (chefs-lieux, données publiques IGN/INSEE), métropole et Corse."""

from __future__ import annotations

from collections.abc import Sequence

from app.services.zone_tiers import distance_km

#: ``code département → (latitude, longitude)`` de la préfecture.
DEPARTMENT_PREFECTURES: dict[str, tuple[float, float]] = {
    "01": (46.205, 5.226), "02": (49.564, 3.620), "03": (46.566, 3.334), "04": (44.092, 6.236),
    "05": (44.559, 6.079), "06": (43.710, 7.262), "07": (44.735, 4.599), "08": (49.762, 4.720),
    "09": (42.965, 1.605), "10": (48.297, 4.074), "11": (43.213, 2.349), "12": (44.350, 2.575),
    "13": (43.296, 5.370), "14": (49.182, -0.371), "15": (44.926, 2.440), "16": (45.649, 0.156),
    "17": (46.160, -1.152), "18": (47.081, 2.399), "19": (45.267, 1.768), "21": (47.322, 5.041),
    "22": (48.514, -2.760), "23": (46.171, 1.871), "24": (45.184, 0.722), "25": (47.238, 6.024),
    "26": (44.933, 4.892), "27": (49.027, 1.151), "28": (48.447, 1.489), "29": (47.996, -4.102),
    "2A": (41.919, 8.739), "2B": (42.697, 9.451), "30": (43.837, 4.360), "31": (43.605, 1.444),
    "32": (43.646, 0.586), "33": (44.838, -0.579), "34": (43.611, 3.877), "35": (48.117, -1.678),
    "36": (46.811, 1.694), "37": (47.394, 0.684), "38": (45.189, 5.725), "39": (46.675, 5.555),
    "40": (43.890, -0.500), "41": (47.586, 1.335), "42": (45.440, 4.387), "43": (45.043, 3.885),
    "44": (47.218, -1.553), "45": (47.903, 1.909), "46": (44.448, 1.441), "47": (44.203, 0.616),
    "48": (44.518, 3.499), "49": (47.478, -0.563), "50": (49.116, -1.090), "51": (48.957, 4.363),
    "52": (48.111, 5.139), "53": (48.070, -0.770), "54": (48.693, 6.184), "55": (48.773, 5.161),
    "56": (47.658, -2.760), "57": (49.119, 6.176), "58": (46.990, 3.159), "59": (50.629, 3.057),
    "60": (49.430, 2.081), "61": (48.432, 0.091), "62": (50.292, 2.781), "63": (45.777, 3.087),
    "64": (43.295, -0.371), "65": (43.233, 0.073), "66": (42.699, 2.895), "67": (48.573, 7.752),
    "68": (48.079, 7.358), "69": (45.764, 4.836), "70": (47.620, 6.155), "71": (46.307, 4.829),
    "72": (48.006, 0.200), "73": (45.564, 5.917), "74": (45.899, 6.129), "75": (48.857, 2.352),
    "76": (49.443, 1.100), "77": (48.540, 2.660), "78": (48.801, 2.130), "79": (46.324, -0.459),
    "80": (49.894, 2.296), "81": (43.929, 2.148), "82": (44.018, 1.355), "83": (43.124, 5.928),
    "84": (43.949, 4.806), "85": (46.670, -1.426), "86": (46.580, 0.340), "87": (45.833, 1.261),
    "88": (48.173, 6.450), "89": (47.798, 3.567), "90": (47.640, 6.863), "91": (48.629, 2.430),
    "92": (48.892, 2.207), "93": (48.909, 2.439), "94": (48.790, 2.455), "95": (49.051, 2.101),
}


def circle_departments(
    zone: Sequence[str], centre: tuple[float, float] | None, radius_km: float | None
) -> list[str]:
    """``zone`` + les départements dont la préfecture est dans le cercle ``(centre, radius_km)``, triés.
    Sans cercle : la zone telle quelle. Une zone vide (lecture nationale) reste vide : rien à élargir."""
    if not zone or not centre or not radius_km:
        return sorted(zone)
    covered = {
        code
        for code, (lat, lon) in DEPARTMENT_PREFECTURES.items()
        if distance_km(centre[0], centre[1], lat, lon) <= radius_km
    }
    return sorted({*zone, *covered})
