from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.prompts.bellum_activity import build_system_prompt, build_user_prompt
from app.services.claude_service import call_claude
from app.services.model_policy import model_for
from app.services.ownership import fetch_owned_account
from app.services.supabase_client import get_supabase

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/activity", tags=["Activity"])


class ActivityRequest(BaseModel):
    account_id: str
    user_id: str = ""


@router.post("/describe")
async def describe_activity(req: ActivityRequest) -> dict:
    """Translate corporate analysis into plain operational language for an ESN sales rep."""
    sb = get_supabase()

    profile: dict = {}
    if req.user_id:
        profile_res = (
            await sb.table("profiles").select("*").eq("user_id", req.user_id).maybe_single().aexecute()
        )
        profile = profile_res.data or {}

    account = await fetch_owned_account(sb, req.account_id, req.user_id)

    raw_analysis: dict = account.get("raw_analysis") or {}
    company_name: str = account.get("company_name", "")

    system_prompt = build_system_prompt(profile)
    user_prompt = build_user_prompt(
        raw_analysis=raw_analysis,
        company_name=company_name,
        # Le même prisme que le pipeline. ⚠️ Ce routeur lit la table `profiles`
        # et non `resolve_seller_context` : un espace dont le portefeuille vit
        # dans `esn_profiles` retombe donc sur la lentille IT. Écart déclaré au
        # registre de doctrine (C06) plutôt que corrigé ici — changer la source
        # du profil de ce routeur est un autre sujet que le libellé.
        profile_data=profile,
    )

    logger.info("Prompt size: %d chars", len(user_prompt))

    try:
        result, usage = await call_claude(
            system_prompt, user_prompt, response_model=dict, max_tokens=2000, prompt_name="bellum_activity",
            model=model_for("bellum_activity"),
            domain_knowledge=True,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {"success": True, "data": result}
