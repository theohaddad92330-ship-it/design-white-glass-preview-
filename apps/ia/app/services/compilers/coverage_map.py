"""#2308 (LAU-FINAL-049) — le compilateur de la carte de couverture du chat.

Mesuré le 18/09/2026 : ``chat_tools.py`` porte 34 fonctions et aucune
n'ASSEMBLE quoi que ce soit vers un écran de chat — les ingrédients existaient
(le pont ``bellum_api``, le calcul ``CoverageService
.computeChatCoverageMapForAccount`` côté NestJS, les classificateurs
``buying_committee``/``decision_role``), le plat n'existait pas.

Ce module ne RECALCULE rien (GA-26, un calcul à un seul endroit) : il prend la
réponse brute du pont — déjà la forme de
``@bellum/contracts::chatCoverageMapResponseSchema`` — et compose ce que Laura
DIT sur le gap PRINCIPAL (#2308.44). Doctrine GA-259 câblée ici aussi : un gap
absent ne produit JAMAIS de titre inventé, et le tri (bloque_action d'abord)
reste celui que l'API a déjà fait — ce compilateur ne retrie jamais.
"""

from __future__ import annotations

from typing import Any


def build_gap_headline(gaps: list[dict[str, Any]]) -> str | None:
    """#2308.44 — un message synthétique sur le gap PRINCIPAL, celui que
    `CoverageService.computeChatCoverageMapForAccount` a déjà classé en
    premier (catégorie "bloque l'action" d'abord). `None` quand il n'y a
    aucun gap exploitable — jamais une phrase inventée sur du vide, jamais un
    second tri qui pourrait diverger du premier.
    """
    if not gaps:
        return None
    top = gaps[0]
    label = top.get("label")
    reason = top.get("reason")
    if not isinstance(label, str) or not label.strip() or not isinstance(reason, str) or not reason.strip():
        return None
    return f"Le principal trou de couverture : {label} — {reason}"


def compile_chat_coverage_map(raw: dict[str, Any]) -> dict[str, Any]:
    """Assemble la réponse du pont vers ce que l'outil de chat rend : les
    trois axes NOMMÉS tels quels (jamais retriés, jamais recalculés) plus le
    titre du gap principal. Une liste absente du payload devient `[]`, jamais
    une valeur inventée — même contrat que le reste de ce fichier.
    """
    gaps = raw.get("gaps")
    gaps_list: list[dict[str, Any]] = gaps if isinstance(gaps, list) else []
    return {
        "account_id": raw.get("account_id"),
        "meaning": raw.get("meaning"),
        "role_families": raw.get("role_families") or [],
        "perimeters": raw.get("perimeters") or [],
        "sales_stages": raw.get("sales_stages") or [],
        "gaps": gaps_list,
        "headline": build_gap_headline(gaps_list),
    }
