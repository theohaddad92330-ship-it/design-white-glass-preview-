"""#3223 (#3198.5, lot E12) — la réponse de Laura cite-t-elle ce que la mémoire marché a rendu ?

« Market Memory appelée mais non citée » est une alerte de QUALITÉ du raisonnement : l'outil a lu
du marché, la réponse n'en dit rien. Deux codes OBSERVATIONNELS (jamais un motif de réparation)
rejoignent ``reasoning_trace.verifier_reasons`` : le dénominateur est le tour où la mémoire a
rendu au moins une entreprise, pas tous les tours vérifiés. Sans entreprise rendue — outil non
appelé, erreur, corpus vide — rien n'est décidable : aucun code, jamais « non citée » par défaut.
"""

from __future__ import annotations

import json
import unicodedata
from collections.abc import Iterable

MARKET_MEMORY_CITED = "memoire_marche_citee"
MARKET_MEMORY_UNCITED = "memoire_marche_non_citee"


def _norm(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", text.casefold()) if unicodedata.category(c) != "Mn")


def _returned_companies(tool_outputs: Iterable[str]) -> list[str]:
    names: list[str] = []
    for raw in tool_outputs:
        if '"methodological_limits"' not in raw:
            continue
        try:
            data = json.loads(raw)
        except (TypeError, ValueError):
            continue
        matches = data.get("matches") if isinstance(data, dict) else None
        for row in matches if isinstance(matches, list) else []:
            name = row.get("company_name") if isinstance(row, dict) else None
            if isinstance(name, str) and name.strip():
                names.append(name.strip())
    return names


def market_memory_citation_codes(text: str, tool_outputs: Iterable[str]) -> tuple[str, ...]:
    """``(cité,)`` / ``(non cité,)`` quand la mémoire marché a rendu une entreprise, sinon ``()``."""
    companies = _returned_companies(tool_outputs)
    if not companies:
        return ()
    lowered = _norm(text)
    return (MARKET_MEMORY_CITED,) if any(_norm(name) in lowered for name in companies) else (MARKET_MEMORY_UNCITED,)
