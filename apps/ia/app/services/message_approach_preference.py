"""#4060 — la préférence « approche directe » des messages, lue dans le sac `user_preferences`.

COPIE du contrat TypeScript `packages/contracts/src/schemas/message-approach-preference.ts` (le service
IA n'a pas ce paquet à l'exécution ; `test_4060_message_approach_preference.py` relit le contrat).

Posée par un geste de l'utilisateur (Réglages › Mémoire de Laura), réversible. Elle ne s'applique qu'en
l'absence d'un objectif CHOISI dans le composer : un choix explicite gagne toujours. Distincte de
`replyTone` (la forme des réponses de Laura, jamais le message écrit à un tiers). Aucun signal ajouté :
l'objectif `approche_directe` porte déjà ses règles (`message_brief.py`).
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

MESSAGE_APPROACH_PREFERENCE_KEY = "messageApproach"
MESSAGE_APPROACH_VALUES = ("direct",)

_DIRECT_OBJECTIVE = "approche_directe"


def read_message_approach_preference(bag: Any) -> str | None:
    """Lecture tolérante : absente ou inconnue ⇒ `None`, jamais une valeur devinée."""
    if not isinstance(bag, dict):
        return None
    value = bag.get(MESSAGE_APPROACH_PREFERENCE_KEY)
    return value if isinstance(value, str) and value in MESSAGE_APPROACH_VALUES else None


def apply_message_approach_preference(parameters: dict[str, str], bag: Any) -> dict[str, str]:
    """Les paramètres du message, `objective` posé à `approche_directe` si la préférence est enregistrée
    ET qu'aucun objectif n'est choisi. Rend un nouveau dict, ne modifie pas l'entrée."""
    if parameters.get("objective") or read_message_approach_preference(bag) != "direct":
        return parameters
    return {**parameters, "objective": _DIRECT_OBJECTIVE}


async def load_message_approach_bag(sb: Any, user_id: str) -> dict[str, Any] | None:
    """Le sac de préférences de la personne. Échec de lecture ⇒ `None` : la préférence est un bonus,
    jamais un bloqueur (le message part alors exactement comme avant)."""
    try:
        res = await sb.table("user_preferences").select("preferences").eq("user_id", user_id).maybe_single().aexecute()
        row = getattr(res, "data", None) or {}
        bag = row.get("preferences") if isinstance(row, dict) else None
        return bag if isinstance(bag, dict) else None
    except Exception as exc:  # noqa: BLE001
        logger.warning("Préférence d'approche des messages illisible: %s", exc)
        return None
