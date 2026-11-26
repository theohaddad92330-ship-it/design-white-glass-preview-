"""#2445.6 (#2442.16, #2766) — enregistrer, MASQUÉ, chaque appel d'outil d'un
tour pour que le bac à sable de rejeu (`chat_replay_sandbox.py`) ait un
snapshot RÉEL à charger.

Jusqu'à ce lot, `ReplaySandboxExecutor` existait, testé
(`tests/test_chat_replay_sandbox.py`), sans AUCUN appelant — le motif que
CLAUDE.md nomme : « du code juste, calculé, testé, que personne n'appelle »
(constat du lot T01, 29/09/2026, sur l'épopée #2766). Ce module est le
producteur de donnée qui manquait ; `internal_chat_replay.py` (routeur) en est
le premier appelant réel côté lecture.

Écrit par le SEUL appelant réel, `chat_tools.execute_chat_tool`, quand
`chat_turn_context.current_turn_id()` porte un tour (posé par `chat.py`,
jamais deviné — voir son docstring). Fail-soft : un échec d'écriture ne doit
jamais faire planter un tour de chat par ailleurs correct (même discipline que
`tool_call_audit.record_tool_call`).

`masked_result` réutilise `mask_tool_result` (secrets MACHINE seulement,
jamais une anonymisation métier — voir le docstring de
`chat_replay_sandbox.py`) : le rejeu reste donc réservé à la même classe
d'enregistrements que ce module accepterait pour lui-même.
"""

from __future__ import annotations

import logging
from typing import Any

from app.services.chat_replay_sandbox import ReplaySandboxExecutor, mask_tool_result
from app.services.supabase_client import get_supabase
from app.services.workspace_scope import resolve_workspace_id

logger = logging.getLogger(__name__)

_TABLE = "chat_tool_call_recordings"

#: Un tour raisonnable n'appelle pas des centaines d'outils distincts — borne
#: de lecture, même esprit que `tool_call_audit`/`security_event_reporting`.
_LOAD_LIMIT = 500


async def record_tool_call_snapshot(
    turn_id: str,
    tool_name: str,
    result: Any,
    *,
    user_id: str,
    sb: Any | None = None,
) -> None:
    """Enregistre le résultat MASQUÉ d'un appel d'outil, pour un rejeu futur.

    `turn_id` vient TOUJOURS de `chat_turn_context.current_turn_id()` —
    jamais un paramètre libre. `workspace_id` est la résolution serveur
    (`resolve_workspace_id`), jamais un identifiant pris tel quel côté modèle.
    """
    try:
        client = sb if sb is not None else get_supabase()
        workspace_id = await resolve_workspace_id(user_id, sb=client)
        result_row = await (
            client.table(_TABLE)
            .insert(
                {
                    "turn_id": turn_id,
                    "workspace_id": workspace_id,
                    "tool_name": tool_name,
                    "masked_result": mask_tool_result(result),
                }
            )
            .aexecute()
        )
        if result_row.error:
            logger.error(
                "Échec d'enregistrement du rejeu pour le tour %s (outil %s): %s",
                turn_id,
                tool_name,
                result_row.error,
            )
    except Exception:  # noqa: BLE001 — l'enregistrement ne doit jamais faire planter le chat
        logger.exception("Échec d'enregistrement du rejeu pour le tour %s (outil %s)", turn_id, tool_name)


async def load_replay_sandbox(turn_id: str, *, sb: Any | None = None) -> ReplaySandboxExecutor:
    """Charge le snapshot déjà MASQUÉ à l'écriture pour CE tour. Un outil
    absent du snapshot reste `REPLAY_UNAVAILABLE` (voir `ReplaySandboxExecutor`)
    — jamais deviné, jamais un vrai appel."""
    client = sb if sb is not None else get_supabase()
    rows = await (
        client.table(_TABLE)
        .select("tool_name,masked_result,created_at")
        .eq("turn_id", turn_id)
        .order("created_at")
        .limit(_LOAD_LIMIT)
        .aexecute()
    )
    snapshot: dict[str, Any] = {}
    for row in rows.data or []:
        name = row.get("tool_name")
        if name:
            # Le dernier enregistré gagne — même règle que `build_sandbox_snapshot`
            # côté écriture d'un tour joué une seule fois.
            snapshot[name] = row.get("masked_result")
    return ReplaySandboxExecutor(snapshot=snapshot)


__all__ = ["load_replay_sandbox", "record_tool_call_snapshot"]
