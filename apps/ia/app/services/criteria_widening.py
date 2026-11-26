"""#4433 (épopée, Louis 21/10/2026) — les PALIERS d'une recherche : exact → voisin 1 → voisin 2.

Une recherche qui ramène moins de ``CRITERIA_WIDEN_MIN_RESULTS`` résultats exacts s'élargit, axe par axe, au
palier suivant du référentiel partagé (``criteria_referential``) ; au-dessus du seuil, RIEN n'est élargi.
L'élargissement se fait dans le CODE — Laura ne demande jamais « tu veux élargir ? » — et chaque résultat
élargi porte son étiquette ``widenedBy`` (``{axis, tier, code}``) ; la réponse le DIT au-dessus de la liste
(``query.widening``). Les résultats exacts restent en tête.

Ce module ne cherche rien lui-même : l'appelant (Découvrir, donc aussi l'outil de recherche de comptes de
Laura, qui passe par ``discover_registry``) lui donne, par palier, une fonction qui va chercher et nomme ce
qu'elle a trouvé. Une ligne dont on ne sait pas nommer le voisin n'est pas ajoutée : on n'invente pas.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable, Sequence
from typing import Any

from app.services.criteria_referential import CRITERIA_WIDEN_MIN_RESULTS

#: Une fonction de palier : les lignes trouvées, chacune avec le code de ce qui l'a fait remonter.
WideningFetch = Callable[[], Awaitable[list[tuple[dict[str, Any], str | None]]]]


async def widen_rows(
    exact: Sequence[dict[str, Any]],
    steps: Sequence[tuple[str, int, WideningFetch]],
    *,
    key: Callable[[dict[str, Any]], str],
    min_results: int = CRITERIA_WIDEN_MIN_RESULTS,
    has_time: Callable[[], bool] = lambda: True,
) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    """Les lignes exactes, puis celles des paliers tant qu'on reste sous ``min_results``.

    ``steps`` = ``[(axe, palier, chercher)]`` dans l'ordre où les essayer. Rend ``(lignes, élargissement)`` ;
    l'élargissement vaut ``None`` quand rien n'a été ajouté — et toujours quand l'exact atteint le seuil."""
    rows = list(exact)
    if len(rows) >= min_results:
        return rows, None
    seen = {key(row) for row in rows}
    done: list[dict[str, Any]] = []
    for axis, tier, fetch in steps:
        if len(rows) >= min_results or not has_time():
            break
        added = 0
        codes: list[str] = []
        for row, code in await fetch():
            row_key = key(row)
            if not row_key or row_key in seen:
                continue
            seen.add(row_key)
            rows.append({**row, "widenedBy": {"axis": axis, "tier": tier, "code": code}})
            added += 1
            if code and code not in codes:
                codes.append(code)
        if added:
            done.append({"axis": axis, "tier": tier, "codes": codes, "added": added})
    if not done:
        return rows, None
    return rows, {"minResults": min_results, "exactCount": len(exact), "steps": done}


def exact_first(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Tri STABLE : l'exact en tête, puis le palier 1, puis le palier 2 — l'ordre d'avant départage."""
    return sorted(candidates, key=lambda c: int((c.get("widenedBy") or {}).get("tier") or 0))
