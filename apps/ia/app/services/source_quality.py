"""Qualité de source — écarter les sources faibles/bruitées des RECOMMANDATIONS
(Théo #2 : "éviter d'utiliser des sources faibles ou bruitées dans les recos").

Une source « reconstruite par l'IA » (``ia_reconstruction``) n'est pas une preuve :
un play / un message ne doit pas s'appuyer dessus tant qu'une vraie source existe.
Déterministe, réutilisable (plays, messages)."""

from __future__ import annotations

from app.config.knowledge_config import get_config


def is_weak_source(source: object) -> bool:
    """True quand la source est faible/reconstruite (à éviter en recommandation).
    La liste vit dans la config knowledge (niveau 1, override-able)."""
    return str(source or "").strip().lower() in set(get_config().sources.weak_sources)
