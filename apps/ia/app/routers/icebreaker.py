from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.prompts.bellum_icebreaker import build_system_prompt, build_user_prompt
from app.services.claude_service import call_claude
from app.services.model_policy import model_for
from app.services.ownership import fetch_owned_account, fetch_owned_contact
from app.services.supabase_client import get_supabase

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/icebreaker", tags=["Icebreaker"])


class IcebreakerRequest(BaseModel):
    contact_id: str
    user_id: str
    # ESN seller profile resolved server-side by the API (AnalysisProfileData shape:
    # companyName / offers / sectors…). When present it drives the message; the
    # `profiles` row is only a legacy fallback. Théo: messages basés sur le profil.
    profile_data: dict | None = None


@router.post("/generate")
async def generate_icebreaker(req: IcebreakerRequest) -> dict:
    """Generate 3 personalised icebreakers for a specific contact."""
    sb = get_supabase()

    # Prefer the API-resolved ESN profile; fall back to the profiles row only when
    # the API didn't send one (older callers).
    if req.profile_data:
        profile = req.profile_data
    else:
        profile_res = await sb.table("profiles").select("*").eq("user_id", req.user_id).maybe_single().aexecute()
        profile = profile_res.data or {}

    contact = await fetch_owned_contact(
        sb,
        req.contact_id,
        req.user_id,
        columns="full_name, title, decision_role, linkedin_url, account_id",
    )

    account: dict = {}
    account_id = contact.get("account_id")
    if account_id:
        account = await fetch_owned_account(sb, account_id, req.user_id)

    raw_analysis: dict = account.get("raw_analysis") or {}
    recent_signals: list = raw_analysis.get("recent_signals", [])

    # #2648.1 — ni poste/rôle de décision connu, ni signal récent : rien à quoi
    # accrocher une accroche PERSONNALISÉE. Plutôt que de laisser Claude broder
    # sur du vide (ou renvoyer une 502 muette après coup), le moteur NOMME ce
    # cas précis avant l'appel — c'est le seul endroit qui sait ce qui manque
    # vraiment ; l'écran (ContactIcebreakers.tsx) se contente de le LIRE.
    if not (contact.get("title") or contact.get("decision_role")) and not recent_signals:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "insufficient_context",
                "message": "Ni poste connu ni signal récent sur ce contact — rien à quoi accrocher une accroche personnalisée.",
            },
        )

    system_prompt = build_system_prompt(profile)
    user_prompt = build_user_prompt(
        contact=contact,
        raw_analysis=raw_analysis,
        profile=profile,
        recent_signals=recent_signals,
    )

    logger.info("Prompt size: %d chars", len(user_prompt))

    try:
        result, usage = await call_claude(
            system_prompt, user_prompt, response_model=dict, max_tokens=2000, prompt_name="bellum_icebreaker",
            model=model_for("bellum_icebreaker"),
            domain_knowledge=True,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {"success": True, "data": result}
