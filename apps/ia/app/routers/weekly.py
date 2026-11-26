from __future__ import annotations

import contextlib
import logging
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.prompts.bellum_weekly import build_system_prompt, build_user_prompt
from app.services.claude_service import call_claude
from app.services.model_policy import model_for
from app.services.seller_context import resolve_seller_context
from app.services.supabase_client import get_supabase

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/weekly", tags=["Weekly Briefing"])

# Les deux action_type qui matérialisent un envoi de message.
_MESSAGE_SEND_ACTION_TYPES = {"message_sent", "plan_action_message_sent"}


def _breakdown_message_sends(rows: list) -> dict:
    """Décompose les envois par provenance — miroir Python de
    ``apps/api/src/modules/actions/message-send-provenance.ts``.

    - ``verified`` : Bellum a réellement expédié (``message_sent`` +
      ``metadata.via == 'bellum'``). Seul cas où une preuve existe.
    - ``declared`` : le commercial affirme avoir envoyé lui-même sur LinkedIn
      (``metadata.via == 'declaration'``). Travail réel, mais invérifiable.
    - ``unattributed`` : historique sans marquage de provenance — sa nature ne
      peut pas être prouvée, donc on ne le compte JAMAIS comme vérifié.
    """
    out = {"verified": 0, "declared": 0, "unattributed": 0, "total": 0}
    for row in rows:
        action_type = row.get("action_type")
        if action_type not in _MESSAGE_SEND_ACTION_TYPES:
            continue
        metadata = row.get("metadata") or {}
        via = metadata.get("via") if isinstance(metadata, dict) else None
        declared = metadata.get("declared") if isinstance(metadata, dict) else None
        if via == "declaration" or declared is True:
            out["declared"] += 1
        elif action_type == "message_sent" and via == "bellum":
            out["verified"] += 1
        else:
            out["unattributed"] += 1
        out["total"] += 1
    return out


class WeeklyRequest(BaseModel):
    user_id: str
    # Resolved ESN seller profile forwarded by the API (same shape as analysis).
    # Absent → resolved here from the CURRENT esn_profiles row (unified source,
    # NOT the legacy ``profiles`` table) so the briefing personalises like the
    # dossier does.
    profile_data: dict | None = None


@router.post("/briefing")
async def weekly_briefing(req: WeeklyRequest) -> dict:
    """Generate the Monday morning commercial briefing for a user."""
    sb = get_supabase()

    profile: dict = req.profile_data or await resolve_seller_context(sb, req.user_id)

    # All user accounts, capped at 20
    accounts_res = (
        await sb.table("accounts")
        .select("*")
        .eq("user_id", req.user_id)
        # #4009 — le brief ne cite jamais une fiche supprimée (décision Louis 11/10, #3670).
        .neq("status", "deleted")
        .order("priority_score", ascending=False)
        .limit(20)
        .aexecute()
    )
    accounts: list = accounts_res.data or []

    # Open plan actions due within the next 7 days. Per-item deadlines live on
    # `action_plan_items.due_date` (the user-owned checklist that also feeds the
    # relance cron) — `action_plans` holds the immutable generated output and has
    # no `deadline` column, so the old query targeted a non-existent field.
    today = date.today()
    week_end = today + timedelta(days=7)
    items_res = (
        await sb.table("action_plan_items")
        .select("label, due_date, account_id, done")
        .eq("user_id", req.user_id)
        .lte("due_date", week_end.isoformat())
        .order("due_date", ascending=True)
        .aexecute()
    )
    # Keep only open items (filter in memory like the relance cron — the per-user
    # set is small and it sidesteps PostgREST boolean-filter ambiguity).
    open_items: list = [i for i in (items_res.data or []) if not i.get("done")]

    # Resolve company names from the accounts already fetched — no extra query.
    company_by_account = {a.get("id"): a.get("company_name") for a in accounts}

    # Mark overdue items (due date in the past). Present-only: an unknown company
    # stays None rather than being invented.
    pending_actions: list[dict] = []
    for item in open_items:
        due_str = item.get("due_date") or ""
        overdue = False
        if due_str:
            with contextlib.suppress(ValueError):
                overdue = date.fromisoformat(due_str[:10]) < today
        pending_actions.append(
            {
                "action": item.get("label"),
                "company": company_by_account.get(item.get("account_id")),
                "due_date": due_str,
                "overdue": overdue,
            }
        )

    # Weekly stats from user_actions
    week_start = (today - timedelta(days=today.weekday())).isoformat()
    stats_res = (
        await sb.table("user_actions")
        # `metadata` est requis : c'est `metadata.via` qui distingue un envoi
        # réellement expédié par Bellum d'une déclaration du commercial.
        .select("action_type,metadata")
        .eq("user_id", req.user_id)
        .gte("created_at", week_start)
        .aexecute()
    )
    action_rows: list = stats_res.data or []

    # Match the action_type values actually written to user_actions (see the API
    # migrations + analysis.persistence): outreach = message_sent |
    # plan_action_message_sent, replies = response_received, analyses =
    # analysis_completed. The legacy "analysis_done" bucket never matched a real
    # row (it was always 0).
    messages = _breakdown_message_sends(action_rows)
    weekly_stats: dict = {
        "messages_sent": messages["total"],
        # Décomposition transmise au prompt : le briefing ne doit pas féliciter
        # un commercial pour des envois qu'il a seulement déclarés comme s'ils
        # étaient prouvés (cf. _breakdown_message_sends).
        "messages_sent_breakdown": messages,
        "responses": sum(1 for r in action_rows if r.get("action_type") == "response_received"),
        "analyses_done": sum(1 for r in action_rows if r.get("action_type") == "analysis_completed"),
        "total_actions": len(action_rows),
    }

    system_prompt = build_system_prompt(profile)
    user_prompt = build_user_prompt(
        accounts=accounts,
        pending_actions=pending_actions,
        weekly_stats=weekly_stats,
        profile=profile,
    )

    logger.info("Prompt size: %d chars", len(user_prompt))

    try:
        result, usage = await call_claude(
            system_prompt, user_prompt, response_model=dict, max_tokens=3000, prompt_name="bellum_weekly",
            model=model_for("bellum_weekly"),
            domain_knowledge=True,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {"success": True, "data": result}
