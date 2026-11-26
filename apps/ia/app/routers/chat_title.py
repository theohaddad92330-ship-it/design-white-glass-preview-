"""``POST /chat/title`` — #1911.1 : le titre court d'un fil de Laura.

Appelé par l'API NestJS en TÂCHE DE FOND, après le 2e échange d'un fil
(`apps/api/src/modules/ia-proxy/chat-thread-titles.service.ts`), jamais par le
navigateur : la route est derrière le secret interne comme toutes les autres.

Ce qu'elle garantit :

* **le modèle léger** de la table (`model_for("bellum_chat_title")`, Haiku par
  défaut, surchargeable par `MODEL_BELLUM_CHAT_TITLE`) ;
* **sans clé de modèle, rien ne part** — ``title: null``, zéro appel réseau ;
* **un titre refusé vaut ``null``** (éditeur nommé, nom propre absent du fil) :
  l'API garde alors le premier message, jamais un titre deviné ;
* **un échec ne journalise aucun contenu** : la classe de l'exception, rien
  d'autre — le texte d'une erreur de fournisseur peut recopier la requête.

Ce qu'elle NE fait pas : compter quoi que ce soit contre le plafond quotidien du
copilote. Ce plafond compte des lignes `chat_messages` côté API ; cette route
n'en écrit aucune.
"""

from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.prompts.bellum_chat_title import build_system_prompt, build_user_prompt
from app.services.chat_thread_title import accept_title, clean_title
from app.services.claude_service import call_claude
from app.services.llm_gateway import resolve_dispatch
from app.services.model_policy import model_for
from app.services.reply_blocks import compact_history_blocks

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["Chat"])

_PROMPT_NAME = "bellum_chat_title"

#: Un titre tient en une ligne : 60 caractères font rarement plus de 25 jetons.
#: La marge couvre un modèle qui ajoute une explication — la première ligne seule
#: est gardée, le reste ne mérite pas d'être payé.
_MAX_TOKENS = 60


class ChatTitleMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=50_000)


class ChatTitleRequest(BaseModel):
    messages: list[ChatTitleMessage] = Field(min_length=1, max_length=12)
    locale: Literal["fr", "en"] = "fr"


@router.post("/title")
async def generate_chat_title(req: ChatTitleRequest) -> dict:
    # #1911.1 — Laura titre le fil ; sans clé de modèle, no-op strict.
    model = model_for(_PROMPT_NAME)
    provider, _ = resolve_dispatch(_PROMPT_NAME, model)
    if not provider.is_available():
        return {"success": True, "data": {"title": None}}

    # #1914 — une carte de Laura (```bellum-block) arrive au modèle de titre en
    # TEXTE, comme dans l'historique du chat : son JSON, coupé à la borne d'un
    # message, lui ferait titrer des clés. Le même texte fonde `accept_title`.
    messages = compact_history_blocks([message.model_dump() for message in req.messages])
    try:
        raw, _usage = await call_claude(
            build_system_prompt(),
            build_user_prompt(messages, req.locale),
            response_model=None,
            max_tokens=_MAX_TOKENS,
            prompt_name="bellum_chat_title",
            model=model,
            # Un appel isolé : un cache écrit ici ne serait jamais relu.
            cache_system=False,
        )
    except Exception as exc:  # noqa: BLE001 — un titre manqué ne casse rien
        # ⚠️ Jamais `str(exc)` : le message d'une erreur de fournisseur peut
        # recopier la requête, donc les mots du commercial.
        logger.error(
            "Titre de fil non généré (%s) — le fil garde son premier message.",
            type(exc).__name__,
        )
        raise HTTPException(status_code=502, detail="chat_title_failed") from None

    title = accept_title(clean_title(str(raw or "")), messages)
    return {"success": True, "data": {"title": title}}
