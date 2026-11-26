from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models.outputs.linkedin_posts import LinkedInPostsOutput
from app.prompts.bellum_linkedin_posts import build_system_prompt, build_user_prompt
from app.services.claude_service import call_claude
from app.services.model_policy import model_for

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/content", tags=["Content"])


class PostIdeasRequest(BaseModel):
    """Le contexte du commercial. Tout est optionnel — et un contexte vide doit
    produire MOINS de sujets, jamais des sujets inventés."""

    esn_offers: str = ""
    missions: str = ""
    signals: str = ""
    objective: str = ""


@router.post("/post-ideas")
async def post_ideas(req: PostIdeasRequest) -> dict:
    """Des sujets de publication ancrés dans ce que l'ESN fait réellement."""
    try:
        output, _usage = await call_claude(
            build_system_prompt(),
            build_user_prompt(
                esn_offers=req.esn_offers,
                missions=req.missions,
                signals=req.signals,
                objective=req.objective,
            ),
            response_model=LinkedInPostsOutput,
            max_tokens=1500,
            prompt_name="bellum_linkedin_posts",
            model=model_for("bellum_linkedin_posts"),
            domain_knowledge=True,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # Un sujet sans ancrage n'aurait pas dû sortir : on le retire ici aussi.
    # Le prompt l'interdit ; ce filtre ne fait pas confiance au prompt.
    ideas = [idea for idea in output.ideas if idea.grounded_on.strip() and idea.angle.strip()]
    return {"success": True, "data": {"ideas": [idea.model_dump() for idea in ideas]}}
