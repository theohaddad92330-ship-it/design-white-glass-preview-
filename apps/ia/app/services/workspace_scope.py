"""Workspace resolution for the IA service.

NestJS owns the workspace model, so every IA entry point that needs a team scope
receives ``workspace_id`` on the request. This module is the **safety net** for
the paths that don't yet carry it (an older API still in flight during a deploy,
an internal caller, a replayed job): it derives the workspace from the user the
same way the API does, so a write can't silently re-accumulate un-scoped rows.

Mirror of ``WorkspaceContextService.resolveActiveWorkspace``, in its three steps:

  1. the workspace the user is **currently working in** (`workspace_active_selections`,
     the workspace switcher) — **re-proving membership**, exactly as the API does,
     so a stale preference can never grant access to a team someone was removed
     from;
  2. else the workspace they OWN (oldest first);
  3. else their oldest membership.

Step 1 is not optional. Someone who belongs to their personal workspace *and* to
their ESN's has TWO valid answers, and only the switcher says which one is right.
Resolving without it would quietly file a document ingested while working in the
ESN into the personal workspace instead — the wrong answer, not merely a missing
one. Kept in lockstep with the API: if `resolveActiveWorkspace` changes, so must
this.

**Fail-soft**: any failure or absence yields ``None`` and the caller degrades to
owner-private behaviour. It never raises, and it never guesses: an unresolvable
user gets ``None``, not a plausible workspace.
"""

from __future__ import annotations

import logging
from typing import Any

from app.services.supabase_client import get_supabase

logger = logging.getLogger(__name__)

_WORKSPACES_TABLE = "workspaces"
_WORKSPACE_MEMBERS_TABLE = "workspace_members"
_WORKSPACE_SELECTIONS_TABLE = "workspace_active_selections"


async def _selected_workspace_id(client: Any, user_id: str) -> str | None:
    """The workspace the user is currently working in (workspace switcher), or
    ``None``. Membership is RE-PROVEN here, mirroring the API: a seat can be
    revoked after the preference was written, and the preference alone must never
    be what grants access."""
    selection = await (
        client.table(_WORKSPACE_SELECTIONS_TABLE)
        .select("workspace_id")
        .eq("user_id", user_id)
        .limit(1)
        .aexecute()
    )
    rows = getattr(selection, "data", None) or []
    if not (isinstance(rows, list) and rows and isinstance(rows[0], dict)):
        return None
    chosen = rows[0].get("workspace_id")
    if not chosen:
        return None

    member = await (
        client.table(_WORKSPACE_MEMBERS_TABLE)
        .select("workspace_id")
        .eq("user_id", user_id)
        .eq("workspace_id", str(chosen))
        .limit(1)
        .aexecute()
    )
    rows = getattr(member, "data", None) or []
    if isinstance(rows, list) and rows and isinstance(rows[0], dict) and rows[0].get("workspace_id"):
        return str(chosen)
    # Dangling preference (seat revoked / workspace deleted): ignore it and fall
    # through. Unlike the API we do NOT delete it — the IA is a reader here, and
    # the API clears it on its next resolution.
    return None


async def resolve_workspace_id(user_id: str, sb: Any | None = None) -> str | None:
    """The user's active workspace id, or ``None`` when it can't be determined."""
    if not user_id:
        return None
    try:
        client = sb if sb is not None else get_supabase()

        selected = await _selected_workspace_id(client, user_id)
        if selected:
            return selected

        owned = await (
            client.table(_WORKSPACES_TABLE)
            .select("id")
            .eq("owner_user_id", user_id)
            .order("created_at", ascending=True)
            .limit(1)
            .aexecute()
        )
        rows = getattr(owned, "data", None) or []
        if isinstance(rows, list) and rows and isinstance(rows[0], dict) and rows[0].get("id"):
            return str(rows[0]["id"])

        member = await (
            client.table(_WORKSPACE_MEMBERS_TABLE)
            .select("workspace_id")
            .eq("user_id", user_id)
            .order("created_at", ascending=True)
            .limit(1)
            .aexecute()
        )
        rows = getattr(member, "data", None) or []
        if isinstance(rows, list) and rows and isinstance(rows[0], dict) and rows[0].get("workspace_id"):
            return str(rows[0]["workspace_id"])
        return None
    except Exception as exc:  # noqa: BLE001 — scoping must never break ingestion/retrieval
        logger.warning("workspace resolution failed for user %s: %s", user_id, exc)
        return None
