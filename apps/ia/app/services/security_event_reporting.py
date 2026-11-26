"""#2879 (#2442.15, lot V36 28/09/2026) — écrit `security_events.kind =
'leak_detected'` quand `guard_shared_corpus_pii_reporting_leak` détecte qu'une
identité de personne a fuité dans un corpus qui promet structurellement de
n'en porter aucune (`SHARED_CORPUS_TOOLS`, `shared_corpus_pii_guard.py`).

Même chokepoint mécanique que `security_events.kind = 'authorization_denied'`
(`GlobalExceptionFilter`, côté API) : une table, UN scope neuf de valeur —
GA-08, le CHECK s'élargit AVANT ce module écrit (migration
`1796350991511-SecurityEventsLeakDetected.ts`). `status_code` est laissé
`None` : ce n'est pas une réponse HTTP, et une valeur inventée pour combler
une contrainte violerait « JAMAIS de donnée fictive ».

Même discipline fail-soft que `tool_call_audit.record_tool_call` : un échec
d'écriture de ce signal ne doit jamais faire planter un tour de chat par
ailleurs correct, mais reste loggé fort pour ne pas devenir invisible.
"""

from __future__ import annotations

import logging
from typing import Any

from app.services.supabase_client import get_supabase
from app.services.workspace_scope import resolve_workspace_id

logger = logging.getLogger(__name__)

_TABLE = "security_events"


async def _record(kind: str, tool_name: str, *, user_id: str, sb: Any | None = None) -> None:
    try:
        client = sb if sb is not None else get_supabase()
        workspace_id = await resolve_workspace_id(user_id, sb=client)
        await (
            client.table(_TABLE)
            .insert(
                {
                    "kind": kind,
                    "status_code": None,
                    "workspace_id": workspace_id,
                    "path": f"tool:{tool_name}",
                }
            )
            .aexecute()
        )
    except Exception:  # noqa: BLE001 — ce signal ne doit jamais faire planter le chat
        logger.exception("Échec d'écriture de l'événement de sécurité %s: %s (user=%s)", kind, tool_name, user_id)


async def record_leak_detected(tool_name: str, *, user_id: str, sb: Any | None = None) -> None:
    """Journalise une fuite d'identité détectée sur `tool_name`, avec le
    workspace RE-VÉRIFIÉ serveur (même résolution que l'audit d'outil)."""
    await _record("leak_detected", tool_name, user_id=user_id, sb=sb)


async def record_cross_tenant_suspected(tool_name: str, *, user_id: str, sb: Any | None = None) -> None:
    """#2879 (#2442.14) — un résultat d'outil portait un identifiant d'espace."""
    await _record("cross_tenant_suspected", tool_name, user_id=user_id, sb=sb)


async def record_injection_suspected(tool_name: str, *, user_id: str, sb: Any | None = None) -> None:
    """#2879 (#2442.14) — un résultat d'outil ressemblait à une consigne d'injection."""
    await _record("injection_suspected", tool_name, user_id=user_id, sb=sb)


__all__ = ["record_cross_tenant_suspected", "record_injection_suspected", "record_leak_detected"]
