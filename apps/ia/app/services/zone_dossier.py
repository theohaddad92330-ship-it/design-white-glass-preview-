"""#4432.7 / #4432.8 — un dossier lancé avec une ZONE met en avant ce qui est dans la zone.

Retour client du 21/10 (« Safran en Occitanie ») : `phase1_research` ne filtrait les filiales que pour
« france » et « site ». Décision Louis 21/10/2026 :

- les filiales et établissements situés dans la zone passent EN TÊTE ;
- ceux hors zone RESTENT, classés après — on ne masque pas ce qu'on a ;
- un lieu inconnu n'est JAMAIS compté « dans la zone » — on n'affiche pas ce qu'on n'a pas ;
- les offres de recrutement de la zone remontent en tête (même règle).

Même lecture du lieu que les contacts (#4432.4, `scope_filter.py`) : les tables de régions, de
départements et de grandes villes sont celles du dépôt (GA-26), jamais une copie. Sans cadrage de zone,
la liste est rendue telle quelle, sans annotation.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from app.services.scope_filter import place_departments, zone_departments
from app.services.zone_tiers import ZONE_TIERS

#: Les clés d'une entité, d'un site ou d'une offre qui DISENT un lieu. Jamais le nom ni le titre :
#: « Safran Nord » n'est pas le département du Nord.
_LOCATION_KEYS = ("location", "city", "ville", "region", "headquarters", "lieu", "site")
_DEPARTMENT_CODE = re.compile(r"^(?:\d{2}|2[AB]|97\d)$", re.IGNORECASE)
#: « 31 - TOULOUSE » : le libellé de lieu des offres publiques porte le code en préfixe.
_CODE_PREFIX = re.compile(r"^\s*(\d{2}|2[AB]|97\d)\s*-", re.IGNORECASE)


@dataclass(frozen=True)
class DossierZone:
    areas: tuple[str, ...]
    departments: frozenset[str]


def dossier_zone(cadrage: Mapping[str, Any] | None) -> DossierZone | None:
    """La zone d'un cadrage « région(s) / département(s) », ou ``None`` (analyse nationale, comme avant).

    Un libellé inconnu ne se devine pas : sans aucun département résolu, il n'y a pas de zone.
    """
    if not isinstance(cadrage, Mapping) or cadrage.get("geo_perimeter") != "region":
        return None
    raw = cadrage.get("geo_areas")
    areas = tuple(str(a).strip() for a in raw if str(a).strip()) if isinstance(raw, (list, tuple)) else ()
    if not areas:
        return None
    departments = zone_departments(areas)
    return DossierZone(areas, departments) if departments else None


def zone_status(item: Mapping[str, Any], zone: DossierZone) -> str | None:
    """``in_zone`` | ``out_of_zone`` | ``None`` (lieu inconnu : ni l'un ni l'autre)."""
    text = " ".join(str(item.get(key) or "") for key in _LOCATION_KEYS if not isinstance(item.get(key), (dict, list)))
    located = set(place_departments(text))
    prefix = _CODE_PREFIX.match(str(item.get("location") or ""))
    if prefix:
        located.add(prefix.group(1).upper())
    code = str(item.get("department") or "").strip()
    if _DEPARTMENT_CODE.match(code):
        located.add(code.upper())
    if not located:
        return None
    return "in_zone" if located & zone.departments else "out_of_zone"


def zone_first(items: Sequence[Any], zone: DossierZone | None) -> list[Any]:
    """Tri STABLE : dans la zone, lieu inconnu, hors zone. Rien n'est retiré ; seuls les éléments dont le
    lieu est connu portent ``zoneStatus``. Sans zone, la liste est rendue telle quelle."""
    if zone is None:
        return list(items)
    rank = {"in_zone": 0, None: 1, "out_of_zone": 2}
    annotated: list[tuple[int, Any]] = []
    for item in items:
        if not isinstance(item, Mapping):
            annotated.append((rank[None], item))
            continue
        status = zone_status(item, zone)
        annotated.append((rank[status], {**item, "zoneStatus": status} if status else item))
    annotated.sort(key=lambda pair: pair[0])
    return [item for _, item in annotated]


#: Les listes du dossier où l'on cherche UNE entité de la zone (filiale, établissement, offre).
_WIDENING_LISTS = ("entitiesExhaustive", "meaningfulSubsidiaries", "sitesFrance", "itJobSignals")

_HEADLINES: dict[str, dict[str, str]] = {
    "fr": {
        "region": "Aucune entité du groupe en {zone} — élargi à la région ({area})",
        "france": "Aucune entité du groupe en {zone} — élargi à toute la France",
    },
    "en": {
        "region": "No group entity in {zone} — widened to the region ({area})",
        "france": "No group entity in {zone} — widened to all of France",
    },
}


def _has_entity_in(zone: DossierZone, lists: Mapping[str, Any]) -> bool:
    for key in _WIDENING_LISTS:
        items = lists.get(key)
        if isinstance(items, Sequence) and not isinstance(items, str):
            if any(isinstance(i, Mapping) and zone_status(i, zone) == "in_zone" for i in items):
                return True
    return False


def zone_widening(zone: DossierZone | None, lists: Mapping[str, Any]) -> dict[str, Any] | None:
    """#4432.9 — le groupe n'a AUCUNE entité dans la zone : on élargit SEUL au palier suivant et on le dit.

    Décision Louis 22/10/2026 : jamais « tu veux élargir ? », jamais un dossier vide muet. Mêmes paliers que
    `zone_tiers.ZONE_TIERS` (ville → 100 km → région → France). Les paliers en km ne se tentent pas ici : une
    entité du dossier porte un lieu, pas des coordonnées — un rayon ne se devine pas (GA-26 : pas de distance
    inventée). Une zone qui a au moins une entité (lieu CONNU ; un lieu inconnu ne compte jamais) ne bouge pas.
    Rend ``{"requested", "tier"[, "area"]}`` ou ``None``.
    """
    if zone is None or _has_entity_in(zone, lists):
        return None
    from app.services.discover_request_reading import _REGIONS
    from app.services.geo_labels import region_departments

    requested = list(zone.areas)
    for tier in ZONE_TIERS[ZONE_TIERS.index("region") :]:
        if tier == "france":
            return {"requested": requested, "tier": "france"}
        seen: set[str] = set()
        for _words, code, label in _REGIONS:
            departments = region_departments(code)
            if label in seen or not departments & zone.departments or departments <= zone.departments:
                continue
            seen.add(label)
            wider = DossierZone(zone.areas, zone.departments | departments)
            if _has_entity_in(wider, lists):
                return {"requested": requested, "tier": "region", "area": label}
    return {"requested": requested, "tier": "france"}


def zone_widened(zone: DossierZone, widening: Mapping[str, Any] | None) -> DossierZone:
    """La zone SERVIE après élargissement : la région (ses départements) ; France : toute zone, donc inchangée."""
    if not widening or widening.get("tier") != "region":
        return zone
    from app.services.discover_request_reading import _REGIONS
    from app.services.geo_labels import region_departments

    extra = [region_departments(code) for _w, code, label in _REGIONS if label == widening.get("area")]
    return DossierZone(zone.areas, zone.departments.union(*extra)) if extra else zone


def zone_widening_headline(widening: Mapping[str, Any], locale: str = "fr") -> str:
    """« Aucune entité du groupe en Occitanie — élargi à toute la France » — la mention de l'écran."""
    templates = _HEADLINES["en" if locale == "en" else "fr"]
    zone = ", ".join(str(a) for a in widening.get("requested") or [])
    if widening.get("tier") == "region":
        return templates["region"].format(zone=zone, area=str(widening.get("area") or "")).replace(" ()", "")
    return templates["france"].format(zone=zone)


def dossier_born_from(
    seller_hypotheses: Mapping[str, Any] | None, cadrage: Mapping[str, Any] | None
) -> dict[str, Any] | None:
    """#4432.10 — « de quels critères le dossier est né » : les lignes de critères de la sélection Découvrir ou
    de la carte de Laura, et la zone du cadrage. Rien de posé ⇒ ``None`` (jamais une ligne vide, jamais devinée)."""
    raw = seller_hypotheses.get("discover_origin_criteria") if isinstance(seller_hypotheses, Mapping) else None
    criteria = [t for t in (str(c).strip()[:1200] for c in (raw[:10] if isinstance(raw, list) else [])) if t]
    zone = dossier_zone(cadrage)
    if not criteria and zone is None:
        return None
    return {"criteria": criteria, "areas": list(zone.areas) if zone else []}
