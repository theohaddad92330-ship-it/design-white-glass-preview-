"""BEL-SC-226 (#3255) — le signal de méthode DISCRET du reçu de réponse.

La spec (section TRANSPARENCE) demande une ligne courte, jamais un document :
« Méthode utilisée : ouverture de compte fermé / 5P incomplet ». Ce module
dérive la moitié « 5P incomplet » à partir de la projection déjà posée par
l'API sur ``account_data["strategy5p"]`` (BEL-SC-225 — ``readiness`` +
``next_action_dimension``, la maison canonique `AccountStrategy5P`, jamais
recalculée ici). La moitié « ouverture de compte fermé » (mouvement de
réouverture déterministe, `app/services/opening_movement.py`) dépend du
triplet SalesContext (archétype × relation × stade), qui n'est aujourd'hui
câblé QUE côté pipeline d'analyse — pas encore reçu par `/chat` — donc elle
reste hors de ce lot : voir l'épopée #3255. **#3285** : l'API pose désormais
``account_data["relationship_state"]`` (même lecture que la fiche compte,
``readRelationshipState``) et ``resolve_opening_method_signal`` nomme la moitié
« ouverture de compte fermé ».

``""`` quand rien à dire (compte absent, 5P prêt, forme non reconnue) — jamais
une ligne devinée. Une valeur de ``readiness`` hors de l'énumération connue du
contrat (`accountStrategy5PReadinessSchema`) se lit comme absente : un contrat
non vérifiable ne se devine pas (doctrine).
"""

from __future__ import annotations

from typing import Any

from app.services.opening_movement import recommend_commercial_route

_DIMENSION_LABELS: dict[str, str] = {
    "perimeter": "périmètre",
    "problem": "problème",
    "people": "personnes",
    "proof": "preuve",
    "passage": "passage",
}

# Miroir de `ACCOUNT_STRATEGY_5P_READINESS_STATES` (account-strategy-5p.ts) —
# READY_TO_ACT n'y figure pas : c'est justement l'état qui ne produit AUCUN
# signal (rien à signaler quand les cinq P sont prêts).
_INCOMPLETE_READINESS_STATES = frozenset({"READY_TO_VERIFY", "INCOMPLETE", "BLOCKED", "NO_GO"})


def resolve_5p_method_signal(strategy5p: Any) -> str:
    """Le libellé « 5P incomplet (…) », ou ``""`` quand il n'y a rien à dire."""
    if not isinstance(strategy5p, dict):
        return ""

    readiness = strategy5p.get("readiness")
    if readiness not in _INCOMPLETE_READINESS_STATES:
        return ""

    dimension = strategy5p.get("next_action_dimension")
    label = _DIMENSION_LABELS.get(dimension) if isinstance(dimension, str) else None
    if label:
        return f"5P incomplet ({label} à cadrer en premier)"
    return "5P incomplet"


def resolve_opening_method_signal(relationship_state: Any) -> str:
    """« ouverture de compte fermé » quand l'état de relation du compte mène à
    la route ``reactivation`` (dormant, ancien client) — dérivé de
    ``recommend_commercial_route``, jamais une seconde liste d'états. ``""``
    sinon, y compris pour un état inconnu ou absent : rien n'est deviné."""
    if not isinstance(relationship_state, str) or not relationship_state:
        return ""
    route = recommend_commercial_route(None, None, relationship_state)["route"]
    return "ouverture de compte fermé" if route == "reactivation" else ""
