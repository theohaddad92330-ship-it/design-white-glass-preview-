"""Mémoire continue du chatbot (Théo #7) — persiste chaque tour dans
``chat_messages`` et recharge l'historique récent, via Supabase.

Dégradable : toute erreur (pas de creds, réseau, table absente) → ``[]`` / no-op.
Le chat ne casse JAMAIS sur la mémoire — au pire il repart sans historique."""

from __future__ import annotations

import logging
from typing import Any

from app.services.supabase_client import get_supabase

logger = logging.getLogger(__name__)

_VALID_ROLES = {"user", "assistant"}


async def load_recent_history(user_id: str, account_id: str = "", limit: int = 10) -> list[dict]:
    """Recent turns for (user, account), chronological (oldest first). ``[]`` on
    error / missing user."""
    if not user_id:
        return []
    try:
        q = get_supabase().table("chat_messages").select("role, content, created_at").eq("user_id", user_id)
        if account_id:
            q = q.eq("account_id", account_id)
        res = await q.order("created_at", ascending=False).limit(limit).aexecute()
        rows = res.data or []
    except Exception as exc:  # degradable — memory must never break chat
        logger.warning("chat history load skipped: %s", exc)
        return []
    return [{"role": r.get("role"), "content": r.get("content", "")} for r in reversed(rows)]


async def save_turn(user_id: str, workspace_id: str, account_id: str, role: str, content: str) -> None:
    """Persist one conversation turn. No-op on error / invalid input.

    Bug prod 27/09 — `chat_messages.workspace_id` est `NOT NULL` depuis
    `FinalizeSecondaryWorkspaceNotNull` (migration 1784800000000, côté NestJS,
    qui la stamp elle-même sur `ChatMessagesService.create`) : cet appel-ci
    l'omettait, chaque écriture échouait en 400 (23502). L'IA ne résout jamais
    un espace elle-même (GA-43 : un espace ne se devine pas) — la valeur
    voyage depuis l'appelant (`req.workspace_id` du même tour de chat, déjà
    résolu et stampé par NestJS)."""
    if not user_id or not workspace_id or role not in _VALID_ROLES or not (content or "").strip():
        return
    row: dict[str, Any] = {"user_id": user_id, "workspace_id": workspace_id, "role": role, "content": content}
    if account_id:
        row["account_id"] = account_id
    try:
        await get_supabase().table("chat_messages").insert(row).aexecute()
    except Exception as exc:  # degradable
        logger.warning("chat turn save skipped: %s", exc)
