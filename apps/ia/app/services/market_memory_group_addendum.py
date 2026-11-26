"""#3225 (Y14 02/10) — la lecture de groupe se DIT entité par entité, même quand le modèle l'oublie.

Trois recettes de suite ont constaté que Laura redit « je n'ai pas mesuré les filiales
séparément » alors que l'outil rend ``per_entity`` (une ligne « lue (N chemins) » / « rien
observé » par entité) : une consigne de prompt n'est pas une garantie. Même mécanisme que
``commercial_verifier.repair_addendum`` : une précision DÉTERMINISTE posée sous une réponse déjà
diffusée, sans jamais répéter ce que le texte dit déjà, ni inventer — chaque ligne vient telle
quelle de la sortie de l'outil.
"""

from __future__ import annotations

import json
from collections.abc import Iterable

_NO_SUBSIDIARY = {
    "fr": "Aucune filiale déclarée sur ce compte — à renseigner pour élargir la lecture.",
    "en": "No subsidiary declared on this account — fill it in to widen the reading.",
}
_NO_SUBSIDIARY_MARKERS = ("aucune filiale déclarée", "no subsidiary declared")


def _line(row: dict, lang: str) -> str:
    paths = row.get("market_paths")
    if isinstance(paths, int):
        if lang == "en":
            return f"read ({paths} path{'s' if paths != 1 else ''})"
        return f"lue ({paths} chemin{'s' if paths != 1 else ''})"
    return "nothing observed" if lang == "en" else "rien observé"


def group_reading_addendum(text: str, tool_outputs: Iterable[str], language: str = "fr") -> str:
    """Les lignes par entité que ``text`` ne porte pas, ``""`` si rien ne manque."""
    lang = language if language in ("fr", "en") else "fr"
    lowered = text.casefold()
    lines: list[str] = []
    no_subsidiary = False
    seen: set[str] = set()
    for raw in tool_outputs:
        if '"per_entity"' not in raw:
            continue
        try:
            data = json.loads(raw)
        except (TypeError, ValueError):
            continue
        rows = data.get("per_entity") if isinstance(data, dict) else None
        if not isinstance(rows, list):
            continue
        no_subsidiary = no_subsidiary or data.get("no_declared_subsidiaries") is True
        for row in rows:
            if not isinstance(row, dict) or not isinstance(row.get("company_name"), str):
                continue
            name = row["company_name"].strip()
            line = _line(row, lang)
            key = f"{name.casefold()}|{line}"
            if key in seen:
                continue
            seen.add(key)
            # Dit déjà : le nom ET son verdict figurent dans le texte.
            if name.casefold() in lowered and (line in lowered or str(row.get("line") or "") in lowered):
                continue
            lines.append(f"- {name} — {line}")
    if no_subsidiary and not any(marker in lowered for marker in _NO_SUBSIDIARY_MARKERS):
        lines.append(_NO_SUBSIDIARY[lang])
    return "\n\n" + "\n".join(lines) if lines else ""
