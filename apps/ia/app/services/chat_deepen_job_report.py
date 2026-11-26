"""#3236.2 (b, tranche) — signaler côté API qu'un approfondissement est coupé.

`chat_resume_checkpoint.py` met de côté les LECTURES déjà faites (Redis,
courte durée) ; ce module signale l'ÉVÉNEMENT à l'API NestJS, qui en tient un
ENREGISTREMENT persistant (`chat_deepen_jobs`) — ce que `conversation_summaries
.thread_state` ne peut pas tenir (borné à 17 Ko) et que l'écran de progression
relit après un rechargement de page, sans rejouer la conversation.

Même garde que `thread.note_unfinished_work` (#3236.2a) : appelé au MÊME
point de sortie (budget épuisé, mode Approfondi) par `chat_orchestrator.py`.

Best-effort, comme tout ce qui touche ce point de sortie partagé : un échec
de ce rapport ne doit JAMAIS faire tomber la réponse déjà prête à partir, ni
retarder un tour de chat. Sans `API_INTERNAL_URL`/`INTERNAL_API_SECRET`, ou
sans `conversation_id` : aucun appel réseau, chemin identique à avant — même
contrat que `bellum_api.py`.

Ce module ne fait PAS reprendre le travail pendant la coupure : il rend
seulement la coupure VISIBLE et RELISIBLE. La reprise réelle (le worker qui
rappellerait l'IA sans que la personne renvoie « continue ») reste hors
tranche (#3236.2b, reste).
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_HEADER = "X-Internal-Secret"
_TIMEOUT_S = 5.0


def _base_url() -> str:
    return (os.environ.get("API_INTERNAL_URL") or "").strip().rstrip("/")


def _secret() -> str:
    return (os.environ.get("INTERNAL_API_SECRET") or "").strip()


async def _post(path: str, payload: dict[str, Any]) -> Any | None:
    base = _base_url()
    if not base or not _secret():
        return None
    url = f"{base}{path}"
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_S) as client:
            response = await client.post(url, json=payload, headers={_HEADER: _secret()})
        if response.status_code >= 400:
            logger.info("Signalement job Approfondi %s → HTTP %s", path, response.status_code)
            return None
        return response.json()
    except Exception as exc:  # noqa: BLE001 — jamais faire tomber un tour de chat pour ce rapport
        logger.warning("Signalement job Approfondi %s failed: %s: %s", path, type(exc).__name__, exc)
        return None


async def report_interrupted(
    *,
    user_id: str,
    conversation_id: str | None,
    label: str,
    completed_steps: int,
    current_step: str | None,
) -> bool:
    """`True` seulement si l'API a bien enregistré la coupure — c'est ce qui
    autorise l'appelant à poser `job_created=True` sur l'observabilité du
    tour (#3196.6) ; sur `False`, rien n'a changé côté API et l'observabilité
    reste byte-identique à avant ce lot."""
    if not conversation_id:
        return False
    result = await _post(
        "/internal/chat/deepen-jobs",
        {
            "userId": user_id,
            "conversationId": conversation_id,
            "label": label,
            "completedSteps": completed_steps,
            "currentStep": current_step,
        },
    )
    return isinstance(result, dict) and bool(result.get("id"))


async def report_resolved(*, user_id: str, conversation_id: str | None) -> bool:
    """#3862.1 — la réponse COMPLÈTE d'un tour Approfondi referme l'étude
    interrompue de ce fil : sans ça, le bandeau de reprise restait affiché
    après un rechargement alors que la personne avait déjà obtenu la suite.
    Même contrat best-effort que `report_interrupted`."""
    if not conversation_id:
        return False
    result = await _post(
        "/internal/chat/deepen-jobs/resolve",
        {"userId": user_id, "conversationId": conversation_id},
    )
    return isinstance(result, dict) and "resolved" in result
