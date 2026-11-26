from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.prompts.bellum_need_play import build_system_prompt, build_user_prompt
from app.services.claude_service import call_claude
from app.services.model_policy import model_for

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/needs", tags=["Needs"])


class NeedPlayRequest(BaseModel):
    """Le besoin, le dossier du compte et le profil ESN, envoyés TELS QUELS.

    Ce routeur ne lit pas la base : le besoin est dérivé de ``raw_analysis`` par
    NestJS, qui l'a déjà scopé au workspace de l'appelant. Rien à re-résoudre
    ici, donc aucune fuite possible entre équipes par cette route.
    """

    need: dict[str, Any]
    account: dict[str, Any]
    profile: dict[str, Any] | None = None
    contacts: list[dict[str, Any]] | None = None


@router.post("/play")
async def build_need_play(req: NeedPlayRequest) -> dict:
    """Prépare l'attaque d'UN besoin (décision Louis 31/07, D9 option A).

    Ce que le crédit achète est ici : les besoins eux-mêmes sortent de l'analyse
    et sont déjà payés — on ne les redécrit pas, on dit comment les attaquer.

    Sans libellé de besoin il n'y a pas de sujet : 422 explicite plutôt qu'un
    plan générique qui aurait l'air d'un livrable.
    """
    label = req.need.get("label")
    if not isinstance(label, str) or not label.strip():
        raise HTTPException(status_code=422, detail="need.label is required to build a play")

    system_prompt = build_system_prompt()
    user_prompt = build_user_prompt(req.need, req.account, req.profile, req.contacts)

    logger.info("Prompt size: %d chars", len(user_prompt))

    try:
        result, _usage = await call_claude(
            system_prompt,
            user_prompt,
            response_model=dict,
            max_tokens=2500,
            prompt_name="bellum_need_play",
            model=model_for("bellum_need_play"),
            domain_knowledge=True,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # La sortie part telle quelle : c'est l'API qui confronte chaque citation à
    # la matière source (`need-play-guard.ts`), là où le profil ESN et le dossier
    # font autorité. Filtrer ici aussi dupliquerait la règle à deux endroits.
    return {"success": True, "data": result}
