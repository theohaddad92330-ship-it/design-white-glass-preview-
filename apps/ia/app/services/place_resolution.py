"""#4429.6 — une commune tapée est résolue sur le référentiel de communes, et ce qu'on a fait se DIT.

Avant : un nom sans correspondance EXACTE partait en plein texte d'adresse sans un mot (« Tolouse »
→ 14 résultats hors sujet) ; un homonyme prenait la première commune venue. Décision Louis
21/10/2026 :

- mal orthographiée → correction par proximité sur le référentiel déjà utilisé par la zone,
  appliquée ET nommée (« Toulouse (corrigé depuis « Tolouse ») ») ;
- homonyme → la plus peuplée, dite, et les autres candidates nommées (département) ;
- aucune correspondance → dite, jamais de repli muet.

La proximité n'est tentée que pour une ville TAPÉE comme telle (``fuzzy=True``) : un mot d'une phrase
(« cybersécurité ») ne devient jamais une commune. Le seuil est haut : « Toulan » ne devient pas
« Toulouse » — proposer une commune à 750 km sans le dire est le défaut que #3876 interdit.
"""

from __future__ import annotations

import difflib
from collections.abc import Mapping, Sequence
from typing import Any

from app.services.text_norm import normalize_name

#: Ratio de proximité minimal (difflib, noms pliés) : « Tolouse »/« Toulouse » = 0,93 ; « Toulan »/« Toulouse » = 0,80.
PLACE_FUZZY_MIN_RATIO = 0.85


def _fold(name: object) -> str:
    return normalize_name(name).replace("-", " ").replace("'", " ")


def _population(commune: Mapping[str, Any]) -> int:
    value = commune.get("population")
    return int(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else 0


def _area(commune: Mapping[str, Any]) -> str:
    return str(commune.get("departmentName") or commune.get("department") or "").strip()


def resolve_place(
    typed: str, candidates: Sequence[Mapping[str, Any]], *, fuzzy: bool
) -> tuple[dict | None, dict | None]:
    """``(commune, note)`` — ``note`` est ``None`` quand rien n'est à dire (nom exact et unique).

    ``note.kind`` : ``corrected`` | ``homonym`` | ``none``. ``none`` n'est rendu que pour une ville
    tapée comme telle (``fuzzy=True``) : sans cela l'appelant ne sait pas si c'est un lieu.
    """
    folded = _fold(typed)
    ranked = sorted(candidates, key=_population, reverse=True)
    exact = [c for c in ranked if _fold(c.get("name")) == folded]
    if len(exact) == 1:
        return dict(exact[0]), None
    if exact:
        chosen = exact[0]
        others = [{"name": str(c.get("name") or ""), "department": _area(c)} for c in exact[1:]]
        note = {
            "kind": "homonym",
            "typed": typed,
            "chosen": str(chosen.get("name") or ""),
            "department": _area(chosen),
            "alternatives": others,
        }
        return dict(chosen), note
    if not fuzzy:
        return None, None
    scored = [(difflib.SequenceMatcher(None, folded, _fold(c.get("name"))).ratio(), c) for c in ranked]
    scored = [(ratio, c) for ratio, c in scored if ratio >= PLACE_FUZZY_MIN_RATIO]
    if not scored:
        return None, {"kind": "none", "typed": typed}
    best = max(ratio for ratio, _ in scored)
    chosen = next(c for ratio, c in scored if ratio == best)
    note = {"kind": "corrected", "typed": typed, "chosen": str(chosen.get("name") or ""), "department": _area(chosen)}
    return dict(chosen), note


_LINES: dict[str, dict[str, str]] = {
    "fr": {
        "corrected": "{chosen} (corrigé depuis « {typed} »)",
        "homonym": "Plusieurs communes nommées « {typed} » : la plus peuplée retenue ({department}). Autres : {others}",
        "none": "Aucune commune « {typed} » trouvée : recherche en texte libre sur l'adresse",
    },
    "en": {
        "corrected": "{chosen} (corrected from “{typed}”)",
        "homonym": "Several towns named “{typed}”: the most populous kept ({department}). Others: {others}",
        "none": "No town “{typed}” found: free-text address search",
    },
}


def place_resolution_line(note: Mapping[str, Any], locale: str = "fr") -> str:
    """La phrase que l'écran et Laura disent — les mêmes mots."""
    templates = _LINES["en" if locale == "en" else "fr"]
    kind = str(note.get("kind") or "")
    if kind not in templates:
        return ""
    others = ", ".join(
        str(a.get("department") or a.get("name") or "")
        for a in note.get("alternatives") or []
        if isinstance(a, Mapping)
    )
    return templates[kind].format(
        typed=note.get("typed") or "",
        chosen=note.get("chosen") or "",
        department=note.get("department") or "",
        others=others,
    )
