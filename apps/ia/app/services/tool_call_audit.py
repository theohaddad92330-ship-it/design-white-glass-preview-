"""#2438.3 — audit serveur de chaque outil de chat, workspace RE-VÉRIFIÉ.

`execute_chat_tool` (`chat_tools.py`) scope déjà chaque outil à `user_id`, mais
jusqu'ici aucun appel n'était journalisé : `tool-registry/*` ne couvre que les
connecteurs/intégrations, jamais un cadre d'exécution d'outils agentiques
audité (mesure du 22/09 soir, registre `chat-lot2` #2438.3).

Le `workspace_id` écrit ici vient TOUJOURS de `resolve_workspace_id` — la même
résolution serveur qui re-prouve l'appartenance (`workspace_scope.py`) — jamais
d'un paramètre libre que le modèle aurait pu suggérer. Un workspace
irrésolvable écrit `None`, jamais un identifiant deviné (même doctrine que
`resolve_workspace_id`).

Fail-soft par construction : un échec d'écriture d'audit ne doit jamais faire
planter un tour de chat (même geste que `chat_orchestrator.py`, "on ne fait
jamais planter le chat"), mais il est loggé fort pour ne pas rester invisible.
"""

from __future__ import annotations

import logging
from typing import Any

from app.services.supabase_client import get_supabase
from app.services.workspace_scope import resolve_workspace_id

logger = logging.getLogger(__name__)

_TABLE = "ai_tool_call_audit_log"


async def record_tool_call(name: str, *, user_id: str, status: str, sb: Any | None = None) -> None:
    """Journalise un appel d'outil de chat avec son workspace RE-VÉRIFIÉ serveur.

    `status` est l'issue du dispatch (`"done"` / `"error"`), jamais devinée par
    l'appelant avant exécution.
    """
    try:
        client = sb if sb is not None else get_supabase()
        workspace_id = await resolve_workspace_id(user_id, sb=client)
        await (
            client.table(_TABLE)
            .insert(
                {
                    "user_id": user_id,
                    "workspace_id": workspace_id,
                    "tool_name": name,
                    "status": status,
                }
            )
            .aexecute()
        )
    except Exception:  # noqa: BLE001 — l'audit ne doit jamais faire planter le chat
        # Y compris l'absence de configuration Supabase (tests, environnement
        # dégradé) : un audit qui échoue ne doit jamais devenir le CAUSE d'un
        # échec de tour de chat par ailleurs correct.
        logger.exception("Échec d'écriture de l'audit d'outil de chat: %s (user=%s)", name, user_id)
