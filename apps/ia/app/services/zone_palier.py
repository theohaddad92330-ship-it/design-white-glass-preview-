"""#4421.3 / #4408.2 — le palier de zone « région » d'une liste de départements, nommé.

Un seul endroit (GA-26) : la table des régions est celle de `discover_scoring` (portée de similar-scoring.ts) ;
les libellés sont ceux de `geo_labels`. Une zone qui couvre déjà sa région entière n'a pas de palier plus large
(``None``) ; un département hors table ne se devine pas."""

from __future__ import annotations

from collections.abc import Sequence


def widen_zone_to_region(departments: Sequence[str]) -> tuple[str, list[str]] | None:
    """``(libellé de la région, tous ses départements)`` quand elle est plus large que ``departments``, sinon ``None``.

    Plusieurs régions touchées : la plus représentée dans la zone donne le libellé, tous leurs départements sont rendus."""
    from app.services.discover_scoring import _REGION_DEPARTMENTS
    from app.services.geo_labels import _REGIONS

    given = {str(d).strip().upper() for d in departments if str(d).strip()}
    if not given:
        return None
    touched = [(name, set(codes)) for name, codes in _REGION_DEPARTMENTS.items() if given & set(codes)]
    if not touched:
        return None
    wide: set[str] = set().union(*(codes for _, codes in touched))
    if wide <= given:
        return None
    name = max(touched, key=lambda item: len(given & item[1]))[0]
    labels = {" ".join(words): label for words, _, label in _REGIONS}
    label = labels.get(name)
    if not label:
        return None
    return label, sorted(wide)
