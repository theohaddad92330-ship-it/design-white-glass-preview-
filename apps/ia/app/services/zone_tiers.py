"""#4429.2 — LES paliers de zone, côté service IA (miroir de `packages/contracts/src/schemas/zone-tiers.ts`).

⚠️ RÈGLE FINALE — Louis, 27/10/2026 au soir (c144, ratifie #4640) : une ville cherche dans 100 km (#4641) ; si ça ne
suffit pas, l'élargissement AUTOMATIQUE monte par paliers NOMMÉS — le département, PUIS LA RÉGION — et s'ARRÊTE là,
même quand la région rend 0 compte : « peu de comptes » est une réponse, c'est le filtre de zone qui a raison. Aucune
requête « France » ne part d'un élargissement automatique. La recherche France entière reste un geste EXPLICITE
(aucune ville posée) ; ``france`` reste dans ``ZONE_TIERS`` (ordre de tri, vocabulaire d'étiquettes, payloads déjà
rendus) mais SORT de l'échelle automatique : ``ZONE_AUTO_MAX_TIER`` est le plafond, ``zone_tiers_after`` ne le dépasse
jamais.

Historique des renversements — écrit ici pour être lu, pas effacé :
  21/10 : 25 km → 50 km → département → région (#4419) ;
  25/10 (#4429) : 100 km → département → région, arrêt à la région ;
  27/10 matin (#4640) : l'arrêt à la région est confirmé ;
  27/10 lot DÉCOUVRIR-ZONE (c143) : renversé — département, région, PUIS la France, sans jamais s'arrêter ;
  27/10 soir (c144) : renversé à son tour — l'automatique plafonne à la région.
L'arrêt à la région a donc été livré DEUX fois et renversé deux fois en trois jours : c'est un NOM gardé des deux côtés,
plus une opinion.

Un barreau à la fois : le suivant n'est tenté que quand le courant rend MOINS de ``ZONE_WIDEN_MIN_RESULTS`` comptes ;
au-dessus, rien ne s'élargit (#3876 : une ville ne devient jamais son département en silence — chaque palier se DIT).
Le rayon MANUEL (10 / 25 / 50 / 100 km) est un réglage de l'utilisateur, hors échelle. Louis 02/11/2026 (QCM, #4429) : l'échelle automatique est 25 km (départ) → 50 km → département → région ; AUCUN
barreau 100 km (le curseur manuel peut le proposer, hors échelle).

## Pourquoi c'est une COPIE et non un import

La racine Railway du service IA est `apps/ia` : `packages/` n'est pas dans son contexte de build.
Même contrainte que `ingestion_guard.py`. Les constantes voyagent en JSON
(`packages/contracts/src/schemas/zone-tiers.constants.json`) ; `tests/test_4429_zone_tiers.py`
rougit dès que ce fichier et le JSON s'écartent, et le test TypeScript voisin fait de même côté
contrat. Les gabarits de phrase sont partagés : Laura dit le palier avec les mots de l'écran.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from typing import Any

from app.services.criteria_referential import CRITERIA_WIDEN_MIN_RESULTS

ZONE_TIERS: tuple[str, ...] = ("city", "radius_50", "department", "region", "france")

#: c144 (Louis 27/10/2026 au soir) — le DERNIER barreau que l'élargissement AUTOMATIQUE tente. ``france`` n'y est pas :
#: elle se nomme, elle se cherche à la main, elle ne s'ajoute jamais seule. Miroir : `ZONE_AUTO_MAX_TIER` (contrat).
ZONE_AUTO_MAX_TIER = "region"

#: Sous ce nombre de comptes, le palier suivant est tenté. Le seuil est CELUI des critères (GA-26 : un seul endroit).
ZONE_WIDEN_MIN_RESULTS = CRITERIA_WIDEN_MIN_RESULTS

ZONE_TIER_RADIUS_KM: dict[str, int] = {"radius_50": 50}

#: Les barreaux qui sont une AIRE nommée (« au département (Nord) »). La France n'a pas d'aire à nommer.
_AREA_TIERS: frozenset[str] = frozenset({"department", "region"})

#: Les rayons que l'UTILISATEUR choisit (Découvrir, Laura) — un réglage, pas un barreau de l'échelle automatique.
#: #4641 — 100 km en fait partie : au-delà de 50 km, le registre ne le sert que par le recouvrement de `zone_cover`.
MANUAL_RADIUS_KM: tuple[int, ...] = (10, 25, 50, 100)

#: Louis 01/11/2026 (#4515, RÉVISE #4641 : 100 km) — 25 km par défaut ; l'échelle automatique monte ensuite à 100 km. Le rayon qu'une ville seule porte PAR DÉFAUT, à Découvrir comme chez Laura (web :
#: `DEFAULT_CITY_RADIUS_KM`, `discover-types.ts`). Il est le point de départ : l'échelle automatique part de là.
DEFAULT_CITY_RADIUS_KM = 25

#: Ceux que Laura accepte quand on lui en demande un (« autour de Lille, 100 km »).
LAURA_RADIUS_KM: tuple[int, ...] = (25, 50, 100)

_HEADLINES: dict[str, dict[str, str]] = {
    "fr": {
        "radius": "Peu de comptes à {place} : recherche élargie à {km} km",
        "department": "Peu de comptes à {place} : recherche élargie au département ({area})",
        "region": "Peu de comptes à {place} : recherche élargie à la région ({area})",
        "france": "Peu de comptes à {place} : recherche élargie à toute la France",
        # 2710N — le barreau a été PARCOURU et n'a rien ajouté : aucun élargissement n'est promis.
        "searched": "Peu de comptes à {place} : cherché jusqu'à {area}, sans compte de plus.",
        "searchedNoArea": "Peu de comptes à {place} : cherché jusqu'à la région, sans compte de plus.",
    },
    "en": {
        "radius": "Few accounts in {place}: search widened to {km} km",
        "department": "Few accounts in {place}: search widened to the department ({area})",
        "region": "Few accounts in {place}: search widened to the region ({area})",
        "france": "Few accounts in {place}: search widened to all of France",
        "searched": "Few accounts in {place}: searched up to {area}, with no further account.",
        "searchedNoArea": "Few accounts in {place}: searched up to the region, with no further account.",
    },
}

#: #4657 (recette prod 27/10/2026) — le palier d'une LIGNE élargie, nommé sur la ligne (miroir de `ZONE_ROW_LABELS`).
_ROW_LABELS: dict[str, dict[str, str]] = {
    "fr": {"department": "Élargi au département", "region": "Élargi à la région", "france": "Élargi à toute la France"},
    "en": {
        "department": "Widened to the department",
        "region": "Widened to the region",
        "france": "Widened to all of France",
    },
}

#: Ce que le JSON partagé doit dire, octet pour octet (comparé par le test de parité).
ZONE_TIERS_CONSTANTS: dict[str, Any] = {
    "tiers": list(ZONE_TIERS),
    "autoMaxTier": ZONE_AUTO_MAX_TIER,
    "minResults": ZONE_WIDEN_MIN_RESULTS,
    "radiusKm": ZONE_TIER_RADIUS_KM,
    "headlines": _HEADLINES,
    "rowLabels": _ROW_LABELS,
}


def zone_tiers_after(tier: str) -> tuple[str, ...]:
    """Les paliers AUTOMATIQUES à tenter APRÈS ``tier``, dans l'ordre — jamais au-delà de ``ZONE_AUTO_MAX_TIER``."""
    return ZONE_TIERS[ZONE_TIERS.index(tier) + 1 : ZONE_TIERS.index(ZONE_AUTO_MAX_TIER) + 1]


def needs_zone_widening(count: int, target: int = ZONE_WIDEN_MIN_RESULTS) -> bool:
    """Le palier courant rend-il trop peu de comptes ? À partir du seuil : non.
    #4673.1 — ``target`` = le volume demandé (``widen_target(limit)``) ; 25 par défaut."""
    return count < target


def is_search_stop_only(widening: Mapping[str, Any]) -> bool:
    """2710N — l'échelle automatique est allée jusqu'à son plafond SANS ajouter un compte : le bandeau le DIT (« cherché
    jusqu'à… »), sans promettre d'élargissement. ``autoCapReached`` est un fait sur ce qui a été TENTÉ ; ``tier`` reste
    ce qui a été TROUVÉ."""
    return widening.get("autoCapReached") is True and not widening.get("widenedCount")


def auto_cap_reached(steps: Sequence[str], total_shown: int, target: int = ZONE_WIDEN_MIN_RESULTS) -> bool:
    """2710N — vrai SEULEMENT quand le barreau plafond (``ZONE_AUTO_MAX_TIER``) a bien été tenté — pas coupé par le
    temps, ni borné plus bas par l'utilisateur — et que le total affichable reste sous le seuil."""
    return ZONE_AUTO_MAX_TIER in steps and needs_zone_widening(total_shown, target)


def zone_widening_headline(widening: Mapping[str, Any], locale: str = "fr") -> str:
    """« Peu de comptes à Toulouse : recherche élargie à 100 km » — la phrase de l'écran, et de Laura."""
    templates = _HEADLINES["en" if locale == "en" else "fr"]
    tier = str(widening.get("tier") or "")
    place = str(widening.get("place") or "")
    area = str(widening.get("area") or "")
    if is_search_stop_only(widening):
        return templates["searched" if area else "searchedNoArea"].format(place=place, area=area)
    if tier in ZONE_TIER_RADIUS_KM:
        return templates["radius"].format(place=place, km=ZONE_TIER_RADIUS_KM[tier])
    if tier == "france":
        return templates["france"].format(place=place)
    # Une aire inconnue ne se nomme pas : le gabarit sans parenthèse.
    key = "department" if tier == "department" else "region"
    return templates[key].format(place=place, area=area).replace(" ()", "")


def zone_widening_of_list(
    widening: Mapping[str, Any], candidates: Sequence[Mapping[str, Any]]
) -> dict[str, Any] | None:
    """#4627 — le bandeau de zone se recompte sur la liste RENDUE, jamais sur ce que le registre a ramené.

    ``exactCount`` / ``widenedCount`` étaient fixés à la collecte : un compte élargi que la qualification écarte
    (doublon, cessé…) ou que la coupe à ``limit`` retire restait annoncé (« 25 ajoutés » au-dessus de 6 lignes). Ici
    ils sortent des candidats non écartés, ceux que l'écran montre. Aucun compte élargi rendu : ``None`` (le
    bandeau ne promet rien) — sauf ``autoCapReached`` (2710N : l'échelle est allée jusqu'à son plafond), dit sans ajout. Le barreau dit est le plus lointain que porte une ligne rendue — pas celui qui a été
    tenté puis coupé — et son aire ne reste que si ce barreau est une aire (département, région)."""
    shown = [c for c in candidates if (c.get("qualification") or {}).get("verdict") != "excluded"]
    reached = {
        str(zone.get("tier"))
        for c in shown
        if isinstance(zone := c.get("zone"), Mapping) and zone.get("tier") not in (None, "city")
    }
    widened = sum(1 for c in shown if isinstance(c.get("zone"), Mapping) and c["zone"].get("tier") in reached)
    # 2710N — l'arrêt au plafond est un fait sur ce qui a été TENTÉ : il ne se recalcule pas sur les lignes rendues, et
    # c'est la seule raison de rendre le bandeau sans compte élargi.
    stopped = widening.get("autoCapReached") is True
    if not widened and not stopped:
        return None
    tier = max(reached, key=ZONE_TIERS.index) if widened else str(widening.get("tier") or ZONE_AUTO_MAX_TIER)
    steps = [step for step in (widening.get("steps") or []) if ZONE_TIERS.index(step) <= ZONE_TIERS.index(tier)]
    out: dict[str, Any] = {
        **{k: v for k, v in widening.items() if k not in ("area", "steps", "autoCapReached")},
        "tier": tier,
        "exactCount": len(shown) - widened,
        "widenedCount": widened,
    }
    if steps:
        out["steps"] = steps
    if tier in _AREA_TIERS and widening.get("area"):
        out["area"] = widening["area"]
    if stopped:
        out["autoCapReached"] = True
    return out


def laura_zone_line(widening: Mapping[str, Any], exact: int, widened: int) -> str:
    """#4429.3 (recette 23/10) — la ligne UNIQUE de Laura : « J'ai élargi à 100 km : 2 comptes à Toulouse, 6 autour ».

    Les nombres sont ceux de la liste RENDUE (pas ceux du registre avant filtres). Propre à Laura : la phrase de
    l'écran (``zone_widening_headline``) reste celle du contrat partagé."""
    tier = str(widening.get("tier") or "")
    area = str(widening.get("area") or "").strip()
    if tier in ZONE_TIER_RADIUS_KM:
        reach = f"à {ZONE_TIER_RADIUS_KM[tier]} km"
    elif tier == "france":
        reach = "à toute la France"
    elif tier == "department":
        reach = f"au département ({area})" if area else "au département"
    else:
        reach = f"à la région ({area})" if area else "à la région"
    place = str(widening.get("place") or "")
    count = lambda n: f"{n} compte" if n == 1 else f"{n} comptes"  # noqa: E731
    if widened == 0 and widening.get("autoCapReached") is True:
        # 2710N — l'échelle est allée jusqu'à son plafond sans rien ajouter : Laura le dit comme l'écran.
        return f"J'ai cherché jusqu'à {reach[2:]} sans compte de plus : {count(exact)} à {place}"
    if widened == 0:
        # Le palier a été tenté, rien d'élargi ne reste : on le dit, on ne le tait pas.
        return f"J'ai élargi {reach} sans rien trouver de plus : {count(exact)} à {place}"
    # Lot DÉCOUVRIR-ZONE (Louis 27/10) — le palier atteint se DIT ; jamais « tu veux élargir ? » (#4433).
    return f"J'ai élargi {reach} : {count(exact)} à {place}, {widened} autour"


def laura_reach_line(place: str, radius_km: int | None, count: int) -> str:
    """#4429.3 (re-recette prod 26/10) — la zone CHERCHÉE quand rien n'a été élargi : « Zone cherchée : 25 km autour de
    Toulouse, 7 comptes. » Le rayon est celui réellement posé (demandé, ou le défaut de 100 km) ; sans rayon, la ville
    seule. Le nombre est celui de la liste RENDUE. Jamais écrite à côté de ``laura_zone_line`` : un palier dit a sa
    propre phrase."""
    reach = f"{radius_km} km autour de {place}" if radius_km else f"{place} seule"
    return f"Zone cherchée : {reach}, {count} compte{'' if count == 1 else 's'}."


def candidate_zone_label(zone: Mapping[str, Any] | None, place: str) -> str | None:
    """« à 38 km de Toulouse », « Haute-Garonne » — l'étiquette d'un compte élargi, ou ``None``.

    Même lecture que `candidateZoneLabel` (contrat) : un compte exact ne porte rien, une aire
    inconnue ne s'invente pas.
    """
    if not isinstance(zone, Mapping):
        return None
    tier = str(zone.get("tier") or "")
    if tier in ZONE_TIER_RADIUS_KM:
        distance = zone.get("distanceKm")
        # #4433.3 — « à N km de X » seulement sur une distance MESURÉE et DANS le rayon du palier ; sinon le
        # critère d'entrée, jamais une proximité qu'on n'a pas mesurée (même lecture que le contrat).
        if (
            isinstance(distance, (int, float))
            and not isinstance(distance, bool)
            and distance <= ZONE_TIER_RADIUS_KM[tier]
        ):
            # #4433.3 (re-recette 26/10) — le palier se NOMME aussi sur la ligne (« élarg* » = 0 occurrence au DOM).
            return f"Élargi à {ZONE_TIER_RADIUS_KM[tier]} km · à {round(distance)} km de {place}"
        return "Ajouté par l'élargissement de zone"
    if tier in _AREA_TIERS or tier == "france":
        # #4657 — le palier se NOMME toujours (jamais une ligne muette) ; son département s'y ajoute quand il est
        # connu, inconnu rien ne s'invente.
        area = str(zone.get("area") or "").strip()
        named = _ROW_LABELS["fr"][tier]
        return f"{named} · {area}" if area else named
    return None


def published_position(row: Mapping[str, Any]) -> dict[str, float]:
    """#4515 (lot DÉCOUVRIR-MOTEUR, 27/10) — ``{latitude, longitude}`` quand une source les PUBLIE (deux nombres) ;
    sinon ``{}``. Un seul lecteur pour les offres (France Travail ``lieuTravail``, agrégateur) : le rayon d'une ville
    s'y mesure, une position absente ne se devine jamais."""
    lat, lon = row.get("latitude"), row.get("longitude")
    if isinstance(lat, (int, float)) and isinstance(lon, (int, float)) and not isinstance(lat, bool):
        return {"latitude": float(lat), "longitude": float(lon)}
    return {}


def distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance à vol d'oiseau (haversine), en km — pour « à 38 km de Toulouse »."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi, d_lambda = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(a))
