from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.prompts.bellum_battlecard import build_system_prompt, build_user_prompt
from app.services.claude_service import call_claude
from app.services.method_consumers import method_block_for
from app.services.model_policy import model_for
from app.services.ownership import fetch_owned_account
from app.services.supabase_client import get_supabase

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/battlecard", tags=["Battle Card"])


class BattlecardRequest(BaseModel):
    account_id: str
    user_id: str
    # ESN seller profile resolved server-side by the API (AnalysisProfileData shape:
    # companyName / offers / size…). When present it drives the card; the `profiles`
    # row is only a legacy fallback for older callers. Même contrat qu'icebreaker.
    profile_data: dict | None = None


@router.post("/generate")
async def generate_battlecard(req: BattlecardRequest) -> dict:
    """Generate a competitive battle card for a prospect meeting."""
    sb = get_supabase()

    # Prefer the API-resolved ESN profile; fall back to the profiles row only when
    # the API didn't send one (older callers).
    if req.profile_data:
        profile: dict = req.profile_data
    else:
        profile_res = await sb.table("profiles").select("*").eq("user_id", req.user_id).maybe_single().aexecute()
        profile = profile_res.data or {}

    account = await fetch_owned_account(sb, req.account_id, req.user_id)

    contacts_res = (
        await sb.table("contacts")
        .select("full_name, title, decision_role, linkedin_url, account_id")
        .eq("account_id", req.account_id)
        .limit(5)
        .aexecute()
    )
    contacts: list = contacts_res.data or []

    raw_analysis: dict = account.get("raw_analysis") or {}
    company_name: str = account.get("company_name", "")
    # Concurrence PRESENT-ONLY : les ESN déjà présentes détectées à l'analyse. Bloc
    # vide → la battle card ne parle pas de concurrence (aucun concurrent inventé).
    competitors: list = raw_analysis.get("competitors") or []

    system_prompt = build_system_prompt(profile)
    # #3670.5 — préparer un appel : la méthode structure discours et objections.
    system_prompt += await method_block_for(
        "appels",
        situation_terms="préparer appel discours objections",
        user_id=req.user_id,
        sector=raw_analysis.get("sector") or account.get("sector"),
    )
    user_prompt = build_user_prompt(
        raw_analysis=raw_analysis,
        contacts=contacts,
        profile=profile,
        company_name=company_name,
        competitors=competitors,
    )

    logger.info("Prompt size: %d chars", len(user_prompt))

    try:
        result, usage = await call_claude(
            system_prompt, user_prompt, response_model=dict, max_tokens=3000, prompt_name="bellum_battlecard",
            model=model_for("bellum_battlecard"),
            domain_knowledge=True,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {"success": True, "data": result}
