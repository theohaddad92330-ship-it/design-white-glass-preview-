"""``POST /onboarding/reformulate-answer`` — #2060.9.

Appelé par l'API NestJS (``OnboardingController.reformulateAnswer``) sur UN
geste explicite du commercial (le bouton « Reformuler avec Laura » d'une
réponse libre du questionnaire), jamais automatiquement. La route est
stateless — aucune lecture Supabase, aucune écriture : elle ne reçoit que
l'intitulé de la question et le texte tapé, rien de plus (aucune donnée
personnelle au-delà de ces deux champs).

Ce qu'elle garantit :

* **le prompt interdit tout fait ajouté** (``bellum_onboarding_reformulate``,
  cf. son docblock) ;
* **sans clé de modèle, une erreur claire** — pas de reformulation inventée
  côté serveur, pas de repli fabriqué : c'est un geste explicite qui attend un
  VRAI résultat, pas une amélioration silencieuse comme le titre de fil
  (``chat_title.py``) qui peut dégrader en ``null`` ;
* **un échec ne journalise aucun contenu** : la classe de l'exception, rien
  d'autre — le texte tapé peut porter des informations du commercial.

Ce qu'elle NE fait pas : elle n'écrit rien. Ce qui est enregistré (la version
d'origine ou la reformulation) est décidé par l'utilisateur, tenu côté web/API.
"""

from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.prompts.bellum_onboarding_reformulate import build_system_prompt, build_user_prompt
from app.services.claude_service import call_claude
from app.services.llm_gateway import resolve_dispatch
from app.services.model_policy import model_for

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/onboarding", tags=["Onboarding"])

_PROMPT_NAME = "bellum_onboarding_reformulate"

#: Une réponse libre du questionnaire est bornée à 120 caractères à l'écran
#: (``QuestionField.tsx``) ; d'autres champs libres du produit montent plus
#: haut. 220 tokens couvre confortablement une reformulation d'un texte deux
#: fois plus long que le plus généreux de ces champs.
_MAX_TOKENS = 220


class OnboardingReformulateRequest(BaseModel):
    question_label: str = Field(min_length=1, max_length=200)
    answer_text: str = Field(min_length=1, max_length=2000)
    locale: Literal["fr", "en"] = "fr"


@router.post("/reformulate-answer")
async def reformulate_answer(req: OnboardingReformulateRequest) -> dict:
    model = model_for(_PROMPT_NAME)
    provider, _ = resolve_dispatch(_PROMPT_NAME, model)
    if not provider.is_available():
        # #2060.9 règle 4 — un geste EXPLICITE qui attend un vrai résultat :
        # sans clé de modèle, une erreur claire, jamais une reformulation
        # inventée côté serveur pour compenser.
        raise HTTPException(status_code=503, detail="reformulation_unavailable")

    try:
        raw, _usage = await call_claude(
            build_system_prompt(),
            build_user_prompt(req.question_label, req.answer_text, req.locale),
            response_model=None,
            max_tokens=_MAX_TOKENS,
            prompt_name=_PROMPT_NAME,
            model=model,
            # Un appel isolé, sur un texte propre à ce commercial : un cache
            # écrit ici ne serait jamais relu par un autre appel.
            cache_system=False,
        )
    except Exception as exc:  # noqa: BLE001 — jamais str(exc) : voir docblock
        logger.error(
            "Reformulation d'une réponse d'onboarding échouée (%s) — la réponse d'origine reste intacte.",
            type(exc).__name__,
        )
        raise HTTPException(status_code=502, detail="reformulation_failed") from None

    reformulated = " ".join(str(raw or "").split()).strip()
    if not reformulated:
        raise HTTPException(status_code=502, detail="reformulation_failed")

    return {"success": True, "data": {"reformulated": reformulated}}
