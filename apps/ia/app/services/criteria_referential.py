"""#4434 / #4435 / #4436 (épopée #4433, Louis 21/10/2026) — le référentiel des critères, côté IA.

Les DONNÉES ne sont pas écrites ici : elles vivent dans ``packages/contracts/src/schemas/criteria-referential.ts``
(un seul endroit, GA-26) et arrivent par un MIROIR GÉNÉRÉ, ``app/knowledge/criteria_referential.json`` — la
garde ``criteria-referential.mirror.test.ts`` échoue s'il diverge du module TS. Ce module ne porte que les
fonctions pures qui le lisent : la canonique d'une compétence, et les PALIERS d'élargissement des trois axes
(exact → voisin 1 → voisin 2), déclenchés sous ``CRITERIA_WIDEN_MIN_RESULTS`` résultats.

Ce qu'il ne fait pas : il n'infère aucune compétence, ne devine aucun voisinage d'un terme inconnu, et ne donne
aucune tranche à un effectif non publié (jamais « 0 », GA-18/19).
"""

from __future__ import annotations

import json
import re
import unicodedata
from collections.abc import Iterable, Mapping, Sequence
from functools import cache
from pathlib import Path
from typing import Any

_MIRROR = Path(__file__).resolve().parent.parent / "knowledge" / "criteria_referential.json"


@cache
def referential() -> Mapping[str, Any]:
    """Le miroir généré, lu une fois."""
    return json.loads(_MIRROR.read_text(encoding="utf-8"))


#: Sous ce nombre de résultats exacts, la recherche s'élargit d'un palier ; au-dessus, jamais (miroir du TS).
CRITERIA_WIDEN_MIN_RESULTS: int = int(referential()["minResults"])


def widen_target(limit: int | None) -> int:
    """#4673.1 (Louis 31/10) — l'élargissement vise le volume DEMANDÉ : ``max(25, limit)``, revient sur le seuil fixe
    de #4673 (25 pour tous). Palier par palier, toujours dit, toujours plafonné à la région en automatique (c144)."""
    return max(CRITERIA_WIDEN_MIN_RESULTS, int(limit or 0))


def normalise_skill_text(value: object) -> str:
    """Même normalisation que ``normaliseSkillText`` (TS) : accents retirés, casse basse, ``+ # . /`` gardés."""
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn").lower()
    return " ".join(re.sub(r"[^a-z0-9+#./]+", " ", text).split())


@cache
def _canonical_by_alias() -> dict[str, str]:
    table: dict[str, str] = {}
    for canonical, entry in referential()["skills"].items():
        table.setdefault(normalise_skill_text(canonical), canonical)
        for alias in entry.get("aliases") or []:
            table.setdefault(normalise_skill_text(alias), canonical)
    return table


def canonical_skill(value: object) -> str | None:
    """La canonique d'une écriture libre, ou ``None`` — mêmes trois passes que ``canonicalSkill`` (TS)."""
    key = normalise_skill_text(value)
    if not key:
        return None
    table = _canonical_by_alias()
    if key in table:
        return table[key]
    for part in re.split(r"[/,;|&+]", key):
        found = table.get(part.strip())
        if found:
            return found
    for word in re.split(r"[\s/|&,;]+", key):
        found = table.get(word)
        if found:
            return found
    return None


@cache
def _expertise_by_label() -> dict[str, tuple[str, ...]]:
    table: dict[str, tuple[str, ...]] = {}
    for entry in referential().get("expertiseTrades") or []:
        for label in entry.get("labels") or []:
            table.setdefault(normalise_skill_text(label), tuple(entry.get("tradeTerms") or ()))
    return table


def expertise_trade_terms(value: object) -> list[str] | None:
    """#4519.19 — les MÉTIERS qu'une expertise du catalogue recrute (« Data & IA » → data engineer, data
    scientist…), ou ``None`` : une compétence (« Vue ») ou une expertise sans métier déclaré n'est pas traduite."""
    key = normalise_skill_text(value)
    terms = _expertise_by_label().get(key) if key else None
    return list(terms) if terms else None


def skill_written_forms(value: object) -> list[str]:
    """#4579 — les AUTRES écritures d'une compétence dans une annonce (« vue » → vue.js, vuejs, vue 3), saisie exclue.

    Écritures seulement : ni écosystème ni proximité (celle-ci a ses paliers, ``skill_widening_tiers``). Seule une
    saisie qui EST une compétence du référentiel (canonique ou alias exact) se décline : « vue java » (deux mots),
    une compétence inconnue → ``[]``, cherchée telle quelle, jamais devinée. La normalisation est celle du module."""
    key = normalise_skill_text(value)
    canonical = _canonical_by_alias().get(key)
    forms: Sequence[str] = referential().get("skillWrittenForms", {}).get(canonical or "", ())
    return [form for form in dict.fromkeys(forms) if normalise_skill_text(form) != key]


def skill_widening_tiers(value: object) -> list[tuple[int, list[tuple[str, str]]]]:
    """Les paliers d'une compétence : ``[(1, [(code, terme cherché)…]), (2, […])]``.

    1 = les autres compétences de sa FAMILLE (code = la compétence, « proche : JavaScript ») ;
    2 = son DOMAINE (code = le domaine, « proche : développement web »). Inconnue → le seul palier 2 du domaine web."""
    data = referential()
    canonical = canonical_skill(value)
    skills: Mapping[str, Any] = data["skills"]
    entry = skills.get(canonical or "")
    if not canonical or not entry:
        # #4433.2 — hors référentiel, la compétence tombe au domaine « développement web » : jamais zéro palier.
        web = data["skillDomains"]["web"]
        return [(2, [("web", term) for term in web["searchTerms"]])] if normalise_skill_text(value) else []
    family = entry["family"]
    siblings = [
        (key, other["label"]) for key, other in skills.items() if key != canonical and other["family"] == family
    ]
    domain_key = data["skillFamilies"].get(family, {}).get("domain")
    domain = data["skillDomains"].get(domain_key or "")
    tiers: list[tuple[int, list[tuple[str, str]]]] = []
    if siblings:
        tiers.append((1, siblings))
    if domain_key and domain:
        tiers.append((2, [(domain_key, term) for term in domain["searchTerms"]]))
    return tiers


def sector_widening_tiers(codes: Iterable[str]) -> list[tuple[int, list[str]]]:
    """Les paliers de secteurs demandés : 1 = voisins directs, 2 = le reste de leurs groupes. Jamais un secteur
    déjà demandé ni déjà proposé ; un code inconnu n'ajoute rien."""
    data = referential()
    groups: Mapping[str, str] = data["sectorGroups"]
    asked = [code for code in dict.fromkeys(str(c or "").strip().lower() for c in codes) if code in groups]
    if not asked:
        return []
    first: list[str] = []
    for code in asked:
        for neighbour in data["sectorNeighbours"].get(code, []):
            if neighbour not in asked and neighbour not in first:
                first.append(neighbour)
    asked_groups = {groups[code] for code in asked}
    second = [
        code for code, group in groups.items() if group in asked_groups and code not in asked and code not in first
    ]
    tiers: list[tuple[int, list[str]]] = []
    if first:
        tiers.append((1, first))
    if second:
        tiers.append((2, second))
    return tiers


def size_bands() -> Sequence[Mapping[str, Any]]:
    """Les tailles maison (décision #4362.4), bornes INCLUSIVES, ``max`` ``None`` = sans plafond."""
    return referential()["sizeBands"]


def size_band_of(headcount: int | None) -> str | None:
    """La tranche maison d'un effectif connu ; ``None`` pour un effectif non publié — jamais « 0 »."""
    if headcount is None or headcount < 0:
        return None
    for band in size_bands():
        if headcount >= band["min"] and (band["max"] is None or headcount <= band["max"]):
            return str(band["code"])
    return None


def size_widening_tiers(ranges: Sequence[tuple[int, int | None]]) -> list[tuple[int, list[Mapping[str, Any]]]]:
    """Les paliers de tranches demandées : 1 = tranches à ± 1, 2 = à ± 2 (les bandes elles-mêmes)."""
    bands = list(size_bands())
    asked = {
        index
        for index, band in enumerate(bands)
        if any(
            (band["max"] is None or low <= band["max"]) and (high is None or high >= band["min"])
            for low, high in ranges
        )
    }
    if not asked:
        return []
    taken = set(asked)
    tiers: list[tuple[int, list[Mapping[str, Any]]]] = []
    for distance in (1, 2):
        picked = [i for i in range(len(bands)) if i not in taken and any(abs(a - i) == distance for a in asked)]
        taken.update(picked)
        if picked:
            tiers.append((distance, [bands[i] for i in picked]))
    return tiers


def widened_label_fr(widened: Mapping[str, Any] | None) -> str | None:
    """L'étiquette d'un résultat élargi, en français (Laura) : « proche : JavaScript », « secteur voisin :
    défense », « taille voisine : GC » — « taille non publiée » quand l'effectif manque, jamais « 0 »."""
    from app.services.application_sectors import APPLICATION_SECTOR_LABELS_FR

    if not isinstance(widened, Mapping):
        return None
    axis, code = widened.get("axis"), widened.get("code")
    data = referential()
    if axis == "skill" and code:
        skill = data["skills"].get(code)
        domain = data["skillDomains"].get(code)
        named = skill["label"] if skill else (domain["labelFr"] if domain else None)
        return f"proche : {named}" if named else None
    if axis == "sector" and code:
        label = APPLICATION_SECTOR_LABELS_FR.get(str(code))
        return f"secteur voisin : {label.lower()}" if label else None
    if axis == "size":
        return f"taille voisine : {code}" if code else "taille non publiée"
    return None
