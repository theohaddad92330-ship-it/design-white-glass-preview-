"""``POST /talent/message-draft`` — #4347 : Laura rédige le message à un consultant du vivier.

Appelée par l'API NestJS (jamais par le navigateur), derrière le secret interne. Ce qu'elle garantit :

* **sans clé de modèle, rien ne part** — 503 ``generation_unavailable``, zéro appel réseau, aucun texte
  inventé : l'écran affiche l'erreur et laisse le champ vide ;
* **une sortie refusée n'est pas corrigée** — 502 ``draft_rejected`` (trou à compléter, éditeur nommé,
  vouvoiement : le message au consultant tutoie, #4347.2) ;
* **un échec ne journalise aucun contenu** : la classe de l'exception, rien d'autre.
"""

from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.prompts.bellum_talent_message import build_system_prompt, build_user_prompt
from app.services.claude_service import call_claude
from app.services.llm_gateway import resolve_dispatch
from app.services.model_policy import model_for
from app.services.talent_message import accept_draft

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/talent", tags=["Talent"])

_PROMPT_NAME = "bellum_outreach"
_MAX_TOKENS = 800


class TalentFacts(BaseModel):
    first_name: str | None = Field(default=None, max_length=80)
    title: str | None = Field(default=None, max_length=160)
    skills: list[str] = Field(default_factory=list, max_length=12)
    availability: str | None = Field(default=None, max_length=40)
    available_from: str | None = Field(default=None, max_length=20)


class NeedFacts(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    client_name: str | None = Field(default=None, max_length=160)
    skills: list[str] = Field(default_factory=list, max_length=12)
    start_on: str | None = Field(default=None, max_length=20)
    duration_months: int | None = Field(default=None, ge=0, le=120)


class TalentMessageRequest(BaseModel):
    user_id: str
    channel: Literal["email", "linkedin", "phone"]
    consultant: TalentFacts
    need: NeedFacts | None = None
    variant: Literal["regenerate", "shorter", "more_direct"] | None = None
    previous_body: str | None = Field(default=None, max_length=4000)


@router.post("/message-draft")
async def draft_talent_message(req: TalentMessageRequest) -> dict:
    model = model_for(_PROMPT_NAME)
    provider, _ = resolve_dispatch(_PROMPT_NAME, model)
    if not provider.is_available():
        raise HTTPException(status_code=503, detail={"code": "generation_unavailable"})

    need = req.need.model_dump(exclude_none=True) if req.need else None
    try:
        raw, _usage = await call_claude(
            build_system_prompt(),
            build_user_prompt(
                channel=req.channel,
                consultant=req.consultant.model_dump(exclude_none=True),
                need=need or None,
                variant=req.variant,
                previous=req.previous_body,
            ),
            response_model=dict,
            max_tokens=_MAX_TOKENS,
            prompt_name=_PROMPT_NAME,
            model=model,
            cache_system=False,
        )
    except Exception as exc:  # noqa: BLE001 — la rédaction manquée se dit, elle ne s'invente pas
        # ⚠️ Jamais `str(exc)` : l'erreur d'un fournisseur peut recopier la requête (prénom, client).
        logger.error("Message au consultant non rédigé (%s).", type(exc).__name__)
        raise HTTPException(status_code=502, detail={"code": "generation_failed"}) from None

    draft = accept_draft(raw, req.channel)
    if draft is None:
        logger.error("Message au consultant refusé (trou à compléter, éditeur nommé ou corps vide).")
        raise HTTPException(status_code=502, detail={"code": "draft_rejected"})
    return {"success": True, "data": draft}
