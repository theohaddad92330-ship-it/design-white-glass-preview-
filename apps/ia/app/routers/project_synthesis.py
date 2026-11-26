from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.prompts.bellum_project_synthesis import build_system_prompt, build_user_prompt
from app.services.claude_service import call_claude
from app.services.model_policy import model_for

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/project-synthesis", tags=["ProjectSynthesis"])


class ProjectSynthesisRequest(BaseModel):
    """L'opportunité, le compte et les contacts liés, envoyés TELS QUELS.

    Même geste que `NeedPlayRequest` (`routers/need_play.py`) : ce routeur ne
    lit pas la base — NestJS a déjà résolu et scopé ces données au workspace de
    l'appelant (`ProjectSynthesisService`). Rien à re-résoudre ici, donc aucune
    fuite possible entre équipes par cette route.
    """

    project: dict[str, Any]
    account: dict[str, Any]
    contacts: list[dict[str, Any]] | None = None


@router.post("/generate")
async def generate_project_synthesis(req: ProjectSynthesisRequest) -> dict:
    """Génère la synthèse en 7 questions d'une opportunité (#2171.27).

    Sans libellé de besoin il n'y a rien à synthétiser : 422 explicite plutôt
    qu'une synthèse générique qui aurait l'air d'un livrable — même garde que
    `/needs/play`.
    """
    label = req.project.get("label")
    if not isinstance(label, str) or not label.strip():
        raise HTTPException(status_code=422, detail="project.label is required to build a synthesis")

    system_prompt = build_system_prompt()
    user_prompt = build_user_prompt(req.project, req.account, req.contacts)

    logger.info("Prompt size: %d chars", len(user_prompt))

    try:
        result, _usage = await call_claude(
            system_prompt,
            user_prompt,
            response_model=dict,
            max_tokens=2000,
            prompt_name="bellum_project_synthesis",
            model=model_for("bellum_project_synthesis"),
            domain_knowledge=True,
        )
    except Exception as exc:
        # Une panne du modèle (réseau, 5xx Anthropic, clé absente) n'est PAS un
        # statut métier : elle remonte en 502, comme `/needs/play`.
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # La sortie part telle quelle : c'est l'API qui applique la garde
    # anti-phrase-vague (`projectSynthesisHasVaguePhraseWithoutFact`, #2171.28)
    # — même séparation des responsabilités que `need-play-guard.ts`.
    return {"success": True, "data": result}
