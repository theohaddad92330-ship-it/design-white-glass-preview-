from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models.outputs.summary import SummaryOutput
from app.prompts.bellum_summary import build_system_prompt, build_user_prompt
from app.services.claude_service import call_claude
from app.services.model_policy import model_for
from app.services.ownership import fetch_owned_account
from app.services.supabase_client import get_supabase

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/summary", tags=["Summary"])


class SummaryRequest(BaseModel):
    account_id: str
    user_id: str


@router.post("/generate")
async def generate_summary(req: SummaryRequest) -> dict:
    """Generate a personalized executive summary for an account."""
    sb = get_supabase()

    profile_res = await sb.table("profiles").select("*").eq("user_id", req.user_id).maybe_single().aexecute()
    profile: dict = profile_res.data or {}

    account = await fetch_owned_account(sb, req.account_id, req.user_id)

    raw_analysis: dict = account.get("raw_analysis") or {}
    company_name: str = account.get("company_name", "")

    system_prompt = build_system_prompt(profile)
    user_prompt = build_user_prompt(
        raw_analysis=raw_analysis,
        profile=profile,
        company_name=company_name,
    )

    logger.info("Prompt size: %d chars", len(user_prompt))

    try:
        summary_output, usage = await call_claude(
            system_prompt,
            user_prompt,
            response_model=SummaryOutput,
            max_tokens=2000,
            prompt_name="bellum_summary",
            model=model_for("bellum_summary"),
            domain_knowledge=True,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {"success": True, "data": summary_output.model_dump()}
