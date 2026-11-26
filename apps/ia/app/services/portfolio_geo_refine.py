"""#3769.2 (lot M06, recette prod 09/10) — « priorise mes comptes » puis
« seulement en Occitanie » : Laura reposait une question (« revoir les comptes
prioritaires ou rechercher… ? ») au lieu de filtrer.

Le filtre vit dans l'outil (`get_portfolio_priorities`, `region`/`departments`,
appliqué sur le siège réel). Ce module ne fait que RECONNAÎTRE le raffinement :
la liste précédente du fil est une priorisation, et la demande nomme une zone
lisible sans réseau (`discover_request_reading.read_request` — mêmes régions,
mêmes numéros de département que Découvrir, GA-26). Une ville seule n'est pas
résolue ici : elle reste au modèle et à l'outil de recherche, jamais devinée.
"""

from __future__ import annotations

import json

from app.services.discover_request_reading import read_request
from app.services.geo_labels import department_label, region_label

_PRIORITIES_TOOL = "get_portfolio_priorities"


def portfolio_geo_refinement(user_message: str | None, last_list_tool: str | None) -> dict[str, object] | None:
    """Les arguments géographiques à passer à `get_portfolio_priorities`, ou ``None``
    quand la liste précédente n'est pas une priorisation ou qu'aucune zone n'est lisible."""
    if last_list_tool != _PRIORITIES_TOOL:
        return None
    reading = read_request(user_message or "")
    if reading.region:
        return {"region": reading.region}
    if reading.department:
        return {"departments": [reading.department]}
    return None


def portfolio_geo_refine_note(arguments: dict[str, object]) -> str:
    """La consigne du tour : l'appel exact, jamais une nouvelle question."""
    region = arguments.get("region")
    departments = arguments.get("departments")
    zone = region_label(str(region)) if region else department_label(",".join(map(str, departments or [])))
    return (
        "\n\nCETTE DEMANDE RESSERRE LA PRIORISATION QUE TU VIENS DE RENDRE sur une zone "
        f"({zone}) — #3769.2. Rappelle `{_PRIORITIES_TOOL}` avec "
        f"{json.dumps(arguments, ensure_ascii=False)} et rends la MÊME carte, restreinte à cette zone : "
        "ne redemande pas ce qu'il faut faire, ne lance pas une recherche de nouveaux comptes, "
        "et ne filtre jamais toi-même la liste précédente. Les comptes de `geoFilter.unlocated` "
        "ont un siège non renseigné : nomme-les ainsi, jamais comme hors zone."
    )
