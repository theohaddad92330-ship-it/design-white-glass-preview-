"""#3777 / #3717.7 — l'identifiant d'exécution PARTAGÉ (décision Louis 11/10/2026).

Le plan multi-semaines et « Prochaines actions » sont produits par le MÊME passage de la phase 4 :
ils portent donc le même `executionId`, l'identifiant de corrélation de l'analyse. Laura le restitue
quand elle lit le dossier (`build_account_briefing`) : de l'analyse à la réponse, une seule piste.

Jamais inventé : sans identifiant de corrélation, le plan n'en reçoit pas. Jamais écrasé : un plan
déjà estampillé garde son identifiant d'origine.
"""

from __future__ import annotations

from typing import Any


def stamp_execution_id(plan: dict[str, Any], correlation_id: str | None) -> dict[str, Any]:
    """Pose `executionId` sur le plan rendu ; renvoie le même dictionnaire."""
    cid = (correlation_id or "").strip()
    if cid and not plan.get("executionId"):
        plan["executionId"] = cid
    return plan
