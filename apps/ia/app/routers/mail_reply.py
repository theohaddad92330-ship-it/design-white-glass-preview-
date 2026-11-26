"""``POST /mail/reply-draft`` — #4405.1 : la réponse à un fil, déjà rédigée.

Appelé par l'API NestJS (``MailboxController.draftReply``) sur UN geste explicite
du commercial (« Préparer la réponse »), jamais automatiquement. Le fil lui est
remis par l'API, qui l'a lu avec le jeton de CE commercial
(``readOwnThread``, c96) : la route est stateless, elle n'écrit RIEN et n'envoie
RIEN — on prépare, le commercial envoie (c82).

Ce qu'elle garantit :

* **sans clé de modèle, une erreur claire** (503) — jamais une réponse inventée
  pour compenser : c'est un geste explicite qui attend un VRAI texte ;
* **un échec ou une sortie vide = 502**, jamais un corps vide présenté en succès ;
* **l'objet « Re: » est calculé ICI**, pas par le modèle ;
* **un échec ne journalise aucun contenu** : la classe de l'exception, rien
  d'autre (le texte d'une erreur de fournisseur peut recopier le fil).
"""

from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.prompts.bellum_mail_reply import build_system_prompt, build_user_prompt
from app.services.claude_service import call_claude
from app.services.llm_gateway import resolve_dispatch
from app.services.model_policy import model_for

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/mail", tags=["Mail"])

_PROMPT_NAME = "bellum_mail_reply"

#: Une réponse commerciale tient en quelques phrases ; la marge couvre un fil
#: qui appelle trois points distincts.
_MAX_TOKENS = 700


class MailReplyMessage(BaseModel):
    direction: Literal["inbound", "outbound"]
    # `from` est un mot réservé de Python : alias, comme le contrat TS.
    sender: str | None = Field(default=None, alias="from", max_length=320)
    date: str | None = Field(default=None, max_length=40)
    text: str = Field(min_length=1, max_length=20_000)

    model_config = {"populate_by_name": True}


class MailReplyRequest(BaseModel):
    # #4405.1 — optionnel : un fil de groupe ou d'événement n'a pas d'interlocuteur unique.
    counterpart: str | None = Field(default=None, max_length=320)
    subject: str | None = Field(default=None, max_length=500)
    messages: list[MailReplyMessage] = Field(min_length=1, max_length=12)
    locale: Literal["fr", "en"] = "fr"


def _reply_subject(subject: str | None) -> str:
    clean = " ".join((subject or "").split())
    if not clean:
        return "Re:"
    return clean if clean.lower().startswith("re:") else f"Re: {clean}"


@router.post("/reply-draft")
async def draft_mail_reply(req: MailReplyRequest) -> dict:
    model = model_for(_PROMPT_NAME)
    provider, _ = resolve_dispatch(_PROMPT_NAME, model)
    if not provider.is_available():
        raise HTTPException(status_code=503, detail="mail_reply_unavailable")

    try:
        raw, _usage = await call_claude(
            build_system_prompt(),
            build_user_prompt(req.subject, [m.model_dump(by_alias=True) for m in req.messages], req.locale),
            response_model=None,
            max_tokens=_MAX_TOKENS,
            prompt_name=_PROMPT_NAME,
            model=model,
            # Un fil propre à ce commercial : un cache écrit ici ne serait jamais relu.
            cache_system=False,
        )
    except Exception as exc:  # noqa: BLE001 — jamais str(exc) : voir docblock
        logger.error("Réponse de mail non générée (%s) — le brouillon reste vide.", type(exc).__name__)
        raise HTTPException(status_code=502, detail="mail_reply_failed") from None

    body = str(raw or "").strip()
    if not body:
        raise HTTPException(status_code=502, detail="mail_reply_failed")
    return {"success": True, "data": {"subject": _reply_subject(req.subject), "body": body}}
