from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models.outputs.scorer import ScoringOutput
from app.prompts.bellum_scorer import build_system_prompt, build_user_prompt
from app.services.account_score import verdict_from_global_score
from app.services.claude_service import call_claude
from app.services.model_policy import model_for
from app.services.ownership import fetch_owned_account
from app.services.seller_context import resolve_seller_context
from app.services.supabase_client import get_supabase

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/scorer", tags=["Scorer"])


class ScorerRequest(BaseModel):
    account_id: str
    user_id: str
    # ESN seller profile resolved server-side by the API (companyName / offers…),
    # the SAME shape the analysis pipeline forwards. When absent the endpoint
    # resolves it itself from the CURRENT esn_profiles row
    # (``resolve_seller_context``) — NOT the legacy ``profiles`` table — so scoring
    # personalises off the same seller context as the dossier.
    profile_data: dict | None = None


@router.post("/recalculate")
async def recalculate_score(req: ScorerRequest) -> dict:
    """Recalculate account priority score adjusted to the ESN profile."""
    sb = get_supabase()

    profile: dict = req.profile_data or await resolve_seller_context(sb, req.user_id)

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
        scoring_output, usage = await call_claude(
            system_prompt,
            user_prompt,
            response_model=ScoringOutput,
            max_tokens=2000,
            prompt_name="bellum_scorer",
            model=model_for("bellum_scorer"),
            domain_knowledge=True,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    result = scoring_output.model_dump()
    # Verdict is a RULE, not the model's mood: derive GO/PRUDENT/STOP from the
    # global score via the canonical /25 bands, so this endpoint no longer emits a
    # divergent GO/PRUDENT/NO-GO vocabulary (unified account verdict, S3).
    result["recommendation"] = verdict_from_global_score(scoring_output.global_score)

    # ⚠️ ON N'ÉCRIT PAS. Ce service RENDAIT le score ET le persistait dans
    # `accounts.priority_score` — une table métier dont NestJS est propriétaire.
    #
    # C'est l'interdit n°4 du socle : « écrire en base depuis apps/ia ». L'IA est
    # propriétaire de ce qu'elle produit (`rag_documents`, `chat_messages`, les
    # points de reprise du graphe) ; les objets commerciaux appartiennent à
    # l'API, qui seule sait qui a le droit d'écrire, quoi tracer et quoi
    # notifier. Deux écrivains sur la même colonne, c'est deux vérités.
    #
    # L'écriture était de surcroît silencieuse : un `except` la repliait en
    # `warning`, donc un échec ne se voyait nulle part.
    #
    # Le score est RENDU à l'appelant, qui le persiste s'il le veut. Aucun
    # appelant n'existe aujourd'hui — ni côté NestJS, ni côté web.
    return {"success": True, "data": result}
