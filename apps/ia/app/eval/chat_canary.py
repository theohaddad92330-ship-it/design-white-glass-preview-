"""#2443.9 (#2899) — LA COHORTE CANARY, avant généralisation.

─────────────────────────────────────────────────────────────────────────────
CE QUE CE MODULE EST, ET CE QU'IL N'EST PAS
─────────────────────────────────────────────────────────────────────────────
#2443 demande, avant de généraliser un changement de prompt ou de modèle :
cohortes internes, démo, quelques workspaces bêta, shadow mode, comparaison,
validation humaine — un dispositif de ROLLOUT complet. Ce module livre la
pièce qui se construit et se teste sans dépendre des autres : LA DÉCISION
« cet espace de travail est-il dans la cohorte canary ? », bornée par un
réglage explicite plutôt que devinée.

Même forme que `DISCOVER_ALERT_RECIPIENT_ALLOWLIST` (agent_docs/env-reference.md) :
une liste d'identifiants, séparés par virgules ou retours à la ligne, comparée
espace/casse normalisés. **Vide ou absente = AUCUN espace en canary** — le
refus par défaut, jamais « tout le monde » : une variable non posée ne doit
pas pouvoir, par accident, faire de la production entière un canary.

Ce qui reste HORS de ce module, chacun un système séparé : le mode SHADOW
(exécuter la nouvelle version sans l'exposer, comparer en silence), la
validation humaine du résultat, et la bascule elle-même d'un espace vers la
version candidate — la cohorte ne fait QUE nommer qui EST dans le canary, pas
CE QUI arrive à ce nom.

─────────────────────────────────────────────────────────────────────────────
CE QUI RESTE (délibérément hors de cette tranche)
─────────────────────────────────────────────────────────────────────────────
Le mode shadow, la bascule progressive et la validation humaine avant
généralisation restent un système séparé, non construit — documenté comme
tel ici et dans `agent_docs/env-reference.md`.
"""

from __future__ import annotations

import os

#: Voir `agent_docs/env-reference.md` (section canary chat, #2443.9).
ENV_VAR = "CHAT_CANARY_WORKSPACE_ALLOWLIST"


def _normalise(value: str) -> str:
    return "".join(value.split()).lower()


def canary_workspace_ids() -> frozenset[str]:
    """Les identifiants d'espace de la cohorte, LUS dans l'environnement à
    chaque appel (jamais mis en cache : un opérateur qui retire un espace de
    la liste doit voir l'effet sans redéploiement)."""
    raw = os.environ.get(ENV_VAR) or ""
    return frozenset(normalised for chunk in raw.replace("\n", ",").split(",") if (normalised := _normalise(chunk)))


def is_workspace_in_canary_cohort(workspace_id: str) -> bool:
    """Vide ou absente = AUCUN espace en canary, jamais « tout le monde »."""
    if not workspace_id:
        return False
    return _normalise(workspace_id) in canary_workspace_ids()


__all__ = ["canary_workspace_ids", "is_workspace_in_canary_cohort"]
