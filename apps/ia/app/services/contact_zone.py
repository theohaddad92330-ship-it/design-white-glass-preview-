"""LUD.6 — la zone d'où un compte a été ouvert PASSE DEVANT, sans rien exclure.

Un compte ouvert depuis une recherche de zone (Découvrir, Laura — région ou département) veut d'abord
les décideurs qui y travaillent. Le filtre géographique d'Apollo (``scope.geographies``) EXCLUT ; ici
c'est une PRÉFÉRENCE : les décideurs du siège restent dans la liste, ceux de la zone sont classés devant.

Un contact dont la région n'est pas connue n'est jamais présenté comme « dans la zone » : il garde son
rang après ceux dont la zone est prouvée.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Sequence

from app.services.discover_scoring import _REGION_DEPARTMENTS
from app.services.geo_labels import _DEPARTMENT_LABELS, _REGION_LABELS, CITY_DEPARTMENTS, region_departments


def _fold(value: str) -> str:
    stripped = "".join(c for c in unicodedata.normalize("NFD", value.lower()) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", stripped).strip()


def _departments_from_text(text: str) -> frozenset[str]:
    """LUD.6 bis — une zone écrite en toutes lettres : une région par son nom, une ville connue.

    Ce qu'on ne sait pas nommer rend ``∅`` : jamais une zone devinée.
    """
    key = _fold(text)
    if not key:
        return frozenset()
    for code, label in _REGION_LABELS.items():
        if _fold(label) == key:
            return region_departments(code)
    if cities := CITY_DEPARTMENTS.get(key):
        return frozenset(cities)
    # KEVIN-FIX K.6 — « 59 — Nord », « Nord (59) », « Nord » : le libellé que l'écran propose en choix.
    coded = re.match(r"^(2[ab]|\d{2,3})\b", key)
    if coded and (coded.group(1).upper() in _DEPARTMENT_LABELS):
        return frozenset({coded.group(1).upper()})
    tail = re.search(r"\b(2[ab]|\d{2,3})$", key)
    if tail and tail.group(1).upper() in _DEPARTMENT_LABELS:
        return frozenset({tail.group(1).upper()})
    named = {code for code, label in _DEPARTMENT_LABELS.items() if _fold(label) == key}
    return frozenset(named)


def zone_departments(zone: Sequence[str] | None) -> frozenset[str]:
    """Les départements d'une zone : codes région INSEE (``84``, ``27``…) ou codes département (``69``).

    Deux chiffres seuls sont ambigus (``84`` = Vaucluse OU AURA) : un code qui est AUSSI une région connue
    se lit comme région, ce que fait la zone de Découvrir ; un département se passe en ``dept:69``.
    """
    out: set[str] = set()
    for raw in zone or ():
        code = str(raw or "").strip()
        if code.lower().startswith("dept:"):
            out.add(code[5:].strip().upper())
        elif region_departments(code):
            out |= set(region_departments(code))
        elif by_name := _departments_from_text(code):
            out |= by_name
        elif re.fullmatch(r"[0-9][0-9AB]{1,2}", code.upper()):
            out.add(code.upper())
    return frozenset(out)


def _state_departments(state: str) -> frozenset[str]:
    key = _fold(state)
    for name, departments in _REGION_DEPARTMENTS.items():
        if name == key:
            return frozenset(departments)
    return frozenset()


def in_zone(hit_state: str | None, departments: frozenset[str]) -> bool:
    """La région du contact recoupe-t-elle la zone ? Région inconnue ⇒ ``False`` (non prouvé)."""
    if not departments:
        return False
    return bool(_state_departments(hit_state or "") & departments)


def prefer_zone[T](hits: Sequence[T], zone: Sequence[str] | None) -> list[T]:
    """Les contacts de la zone d'abord, les autres ensuite — ordre relatif conservé, aucun retiré."""
    departments = zone_departments(zone)
    if not departments:
        return list(hits)
    inside = [h for h in hits if in_zone(getattr(h, "state", ""), departments)]
    inside_ids = {id(h) for h in inside}
    return [*inside, *(h for h in hits if id(h) not in inside_ids)]


_HOME_COUNTRIES = frozenset({"france", "fr", "fra"})


def annotate_zone(seed: dict, zone: Sequence[str] | None) -> dict:
    """Lot 755 — ajoute ``zoneNote`` quand le PAYS prouve que le contact est hors d'une zone française.

    Pays inconnu ⇒ aucune note (non prouvé : ni « dans la zone » ni « hors zone »). Aucune zone ⇒ inchangé.
    """
    if not zone_departments(zone):
        return seed
    country = str(seed.get("country") or "").strip()
    if country and _fold(country) not in _HOME_COUNTRIES:
        return {**seed, "zoneNote": f"hors zone : pays {country}"}
    return seed


def prefer_zone_seeds(seeds: Sequence[dict], zone: Sequence[str] | None) -> list[dict]:
    """Les graines hors zone PROUVÉE (pays étranger) passent derrière, ordre relatif conservé, aucune retirée."""
    if not zone_departments(zone):
        return list(seeds)
    annotated = [annotate_zone(s, zone) for s in seeds]
    return [*(s for s in annotated if "zoneNote" not in s), *(s for s in annotated if "zoneNote" in s)]
