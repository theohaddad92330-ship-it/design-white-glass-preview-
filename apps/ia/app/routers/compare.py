from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.prompts.bellum_compare import build_system_prompt, build_user_prompt
from app.services.claude_service import call_claude
from app.services.compare_normalization import normalize_accounts
from app.services.model_policy import model_for
from app.services.supabase_client import get_supabase

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/compare", tags=["Compare"])


class CompareRequest(BaseModel):
    account_ids: list[str]
    user_id: str
    # ESN seller profile resolved server-side by the API (AnalysisProfileData shape).
    # When present it drives the prioritisation; the `profiles` row is only a legacy
    # fallback for older callers. Même contrat qu'icebreaker/message.
    profile_data: dict | None = None


@router.post("/")
async def compare_accounts(req: CompareRequest) -> dict:
    """Compare multiple accounts and recommend a prioritisation."""
    if not req.account_ids:
        raise HTTPException(status_code=400, detail="account_ids must not be empty")

    sb = get_supabase()

    # Prefer the API-resolved ESN profile; fall back to the profiles row only when
    # the API didn't send one (older callers).
    if req.profile_data:
        profile: dict = req.profile_data
    else:
        profile_res = await sb.table("profiles").select("*").eq("user_id", req.user_id).maybe_single().aexecute()
        profile = profile_res.data or {}

    # Scope to the caller's accounts — an un-scoped .in_ would return any
    # tenant's rows for known ids (cross-tenant read). Non-owned ids simply
    # drop out of id_to_account below.
    accounts_res = (
        await sb.table("accounts").select("*").in_("id", req.account_ids).eq("user_id", req.user_id).aexecute()
    )
    accounts: list = accounts_res.data or []

    # #2293.8 / .9 / .10 — normalisation DÉTERMINISTE avant le modèle : cinq axes
    # calculés en code, les comptes non comparables ÉCARTÉS avec leur raison (au
    # lieu d'un dossier vide envoyé au modèle sous l'identifiant brut), et le
    # drapeau qui dit si les dossiers ont la même profondeur.
    # #2284.1 / #2284.67 — les corrections d'identité de l'espace sur CES comptes
    # (déjà bornés au propriétaire ci-dessus) : elles gagnent sur le calcul quand
    # on cherche deux comptes qui désignent la même entreprise.
    owned_ids = [a["id"] for a in accounts if isinstance(a, dict) and a.get("id")]
    # Illisibles ⇒ ``None`` : le rapprochement n'est PAS mesuré (jamais calculé
    # en ignorant une correction humaine qu'on n'a pas pu lire).
    corrections: list | None = []
    if owned_ids:
        try:
            corrections_res = (
                await sb.table("entity_resolution_corrections")
                .select("account_id,version,decision,target_siren")
                .in_("account_id", owned_ids)
                .aexecute()
            )
            corrections = corrections_res.data or []
        except Exception as exc:  # noqa: BLE001 — une lecture annexe ne casse pas la comparaison
            logger.warning("compare: corrections d'identité illisibles (%s)", type(exc).__name__)
            corrections = None
    normalized = normalize_accounts(req.account_ids, accounts, corrections)
    if not normalized["comparable"]:
        # Rien à comparer : aucun appel au modèle, les écartés se NOMMENT.
        return {"success": True, "data": {"comparison": [], "priority_order": [], **normalized}}

    # Build analysis objects for each comparable account in the requested order
    id_to_account = {a["id"]: a for a in accounts}
    analyses: list[dict] = []
    for account_id in normalized["comparable"]:
        account = id_to_account.get(account_id, {})
        analyses.append(
            {
                "company_name": account.get("company_name", account_id),
                "priority_score": account.get("priority_score"),
                "status": account.get("status"),
                "raw_analysis": account.get("raw_analysis") or {},
            }
        )

    system_prompt = build_system_prompt(profile)
    user_prompt = build_user_prompt(
        analyses=analyses,
        profile=profile,
        normalization=normalized,
    )

    logger.info("Prompt size: %d chars", len(user_prompt))

    try:
        result, usage = await call_claude(
            system_prompt,
            user_prompt,
            response_model=dict,
            max_tokens=3000,
            prompt_name="bellum_compare",
            model=model_for("bellum_compare"),
            domain_knowledge=True,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    data = {**result, **normalized} if isinstance(result, dict) else {"result": result, **normalized}
    return {"success": True, "data": data}
