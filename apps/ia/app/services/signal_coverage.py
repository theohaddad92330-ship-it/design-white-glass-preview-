"""Couverture de la recherche de signaux (#3668.8).

« Aucun signal récent trouvé dans les sources consultées » n'est vrai que si les
sources ont RÉPONDU. Une source en panne n'a pas dit « rien » : elle n'a rien dit.
Ce module sépare les trois états et nomme ce qui n'a pas pu être consulté — une
recherche non concluante garde sa couverture et ses limites, elle ne devient pas
« aucun projet ».
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping

#: Sources de signaux datés collectées par la phase 1 (clés de ``record_degradation``).
SIGNAL_SOURCES: tuple[str, ...] = (
    "brave_news", "france_travail", "apec", "welcome_to_the_jungle", "ats_boards", "bodacc", "boamp", "decp",
)

STATUS_FOUND = "found"
STATUS_NONE_FOUND = "none_found"
STATUS_INCOMPLETE = "incomplete"


def signal_coverage(
    signal_count: int,
    degradations: Iterable[Mapping[str, object]] | None,
) -> dict[str, object]:
    """``found`` (≥1 signal), ``none_found`` (sources consultées, rien), ``incomplete``
    (au moins une source injoignable ET aucun signal — on ne conclut pas à l'absence)."""
    down = []
    seen: set[str] = set()
    for entry in degradations or []:
        src = str(entry.get("source") or "")
        if src in SIGNAL_SOURCES and src not in seen:
            seen.add(src)
            down.append({"source": src, "reason": str(entry.get("reason") or "")})
    consulted = [s for s in SIGNAL_SOURCES if s not in seen]
    if signal_count > 0:
        status = STATUS_FOUND
    elif down:
        status = STATUS_INCOMPLETE
    else:
        status = STATUS_NONE_FOUND
    return {"status": status, "consulted": consulted, "unreachable": down}
