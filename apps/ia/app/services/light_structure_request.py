"""#4408.1 (recette prod 26/10) — « des petites structures sans gros process achat » : Laura demandait le territoire,
puis sur « toute la France » répondait qu'il manquait « une tranche d'effectif, un secteur, un département ou une
raison sociale » (0 compte sur 10).

Doctrine « Laura AGIT, elle ne demande pas » (Louis 21/10, épopée #4433) : le périmètre qui manque se prend au profil
(``geoZone``), sinon c'est la France ; il se DIT en une ligne, jamais en question. Même geste que
``skill_accounts_request`` (#4434.3) ; l'outil pose lui-même la tranche d'effectif de départ
(``DEFAULT_LIGHT_HEADCOUNT``) quand aucun critère n'est donné, et l'élargissement par paliers existant fait le reste.

Ce module n'écrit que la consigne du tour ; l'orchestrateur retire l'outil de clarification.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

from app.services.discover_request_reading import read_request
from app.services.geo_labels import department_label, region_label
from app.services.skill_accounts_request import _profile_regions

#: La tranche de départ d'une demande « petite structure » sans aucun critère : la plus large qui reste « petite »
#: au sens du filtre d'achat (`purchasing_process_filter` : ≥ 250 salariés = ETI, process structuré).
DEFAULT_LIGHT_HEADCOUNT = "50-249"


def light_scope_note(message: str | None, profile: Mapping[str, Any] | None) -> str:
    """La consigne du tour : l'appel exact, le périmètre posé ET dit, aucune question."""
    asked = read_request(message or "")
    args: dict[str, Any] = {"purchasing_process": "light", "limit": 10}
    if asked.region or asked.department:
        if asked.region:
            args["region"] = [asked.region]
            perimeter = region_label(asked.region)
        else:
            args["department"] = asked.department
            perimeter = department_label(str(asked.department))
    elif regions := _profile_regions(profile):
        args["region"] = regions
        perimeter = ", ".join(region_label(code) for code in regions) + " (ton profil)"
    else:
        perimeter = "toute la France (aucune zone dans ton profil)"
    return (
        "\n\nCETTE DEMANDE CHERCHE DES PETITES STRUCTURES SANS GROS PROCESS D'ACHAT (#4408.1). Tu ne poses AUCUNE "
        "question, ni sur le territoire ni sur l'élargissement (l'outil de clarification t'est retiré) : appelle "
        f"`run_account_search` avec {json.dumps(args, ensure_ascii=False)}. Écris en tête, en une ligne : "
        f"« Périmètre : {perimeter}. » L'outil pose lui-même la tranche d'effectif de départ si tu n'en donnes pas "
        "et la DIT (`default_scope`) ; il élargit par paliers : nomme chaque palier. Sous le volume, dis combien et "
        "pourquoi, et liste les écartés par critère (`heavy_purchasing_excluded`, `group_attached_excluded`) — "
        "jamais un zéro muet, jamais « il manque une tranche d'effectif », jamais « tu veux élargir ? »."
    )
