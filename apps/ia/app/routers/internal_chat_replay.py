"""#2445.6 (#2442.16, #2766) — le PREMIER appelant réel de
`ReplaySandboxExecutor`.

Jusqu'à ce lot, l'exécuteur existait, testé
(`tests/test_chat_replay_sandbox.py`), sans AUCUN appelant — constat du lot
T01 (29/09/2026) sur l'épopée #2766 : « du code juste, calculé, testé, que
personne n'appelle ». Ce routeur rejoue un appel d'outil DÉJÀ enregistré
pendant le tour source (`chat_tool_call_recording.py`) — jamais un vrai
dispatcher, jamais un crédit débité, jamais une écriture : c'est la garantie
STRUCTURELLE de `chat_replay_sandbox.py` (aucun import d'un pont, d'un client
HTTP ni d'un dispatcher réel dans ce module).

Protégé comme tout routeur non exempté de ce service par
`InternalAuthMiddleware` (`x-internal-secret`) — aucun guard supplémentaire
ici, back-office seulement (console d'opérations IA, épopée #2766).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.chat_tool_call_recording import load_replay_sandbox

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/internal/chat-replay", tags=["Chat replay sandbox"])


class ReplayToolCallRequest(BaseModel):
    tool_name: str
    tool_input: dict | None = None


@router.post("/{turn_id}/execute")
async def execute_in_sandbox(turn_id: str, req: ReplayToolCallRequest) -> dict:
    """Rejoue UN appel d'outil contre le snapshot enregistré de `turn_id`.

    Un outil absent de l'enregistrement source rend `REPLAY_UNAVAILABLE`
    (`chat_replay_sandbox.REPLAY_UNAVAILABLE`) — jamais un résultat inventé,
    jamais un vrai appel."""
    sandbox = await load_replay_sandbox(turn_id)
    return {"turnId": turn_id, "result": sandbox.execute(req.tool_name, req.tool_input)}
