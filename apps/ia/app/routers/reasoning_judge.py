"""``POST /eval/generic-recommendation-judge`` — #3223 (décision Louis 11/10/2026).

Appelé par l'API NestJS, une fois par jour, sur un ÉCHANTILLON borné de
réponses de Laura (`reasoning-judge-sampling.service.ts`) ; jamais par le
navigateur — la route est derrière le secret interne comme toutes les autres.

Ce qu'elle garantit :

* **`CHAT_PROD_SAMPLING_ENABLED` éteint ⇒ NO-OP STRICT** : ``disabled``, rendu
  avant tout appel réseau (`chat_prod_sampling.is_prod_sampling_enabled`) ;
* **sans clé de modèle, rien ne part** — ``unavailable`` ;
* **un plafond dur** de :data:`MAX_BATCH` réponses par appel (422 au-delà) ;
* **un jeton fermé par réponse**, ou ``null`` si le juge n'a pas pu juger —
  jamais un texte, jamais un motif ; l'empreinte du juge accompagne les
  verdicts pour que l'API ne compte que ceux du juge calibré.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.eval.chat_prod_sampling import is_prod_sampling_enabled
from app.eval.generic_recommendation_judge import (
    MAX_BATCH,
    PROMPT_NAME,
    judge_many,
    judge_model,
    judge_version,
)
from app.services.llm_gateway import resolve_dispatch

router = APIRouter(prefix="/eval", tags=["Eval"])


class JudgedAnswer(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    text: str = Field(min_length=1, max_length=50_000)


class GenericJudgeRequest(BaseModel):
    answers: list[JudgedAnswer] = Field(min_length=1, max_length=MAX_BATCH)


@router.post("/generic-recommendation-judge")
async def judge_generic_recommendations(req: GenericJudgeRequest) -> dict:
    if not is_prod_sampling_enabled():
        return {"success": True, "data": {"status": "disabled"}}
    model = judge_model()
    provider, _ = resolve_dispatch(PROMPT_NAME, model)
    if not provider.is_available():
        return {"success": True, "data": {"status": "unavailable"}}
    verdicts = await judge_many([answer.text for answer in req.answers])
    return {
        "success": True,
        "data": {
            "status": "judged",
            "judgeVersion": judge_version(model),
            "verdicts": [
                {"id": answer.id, "verdict": verdict} for answer, verdict in zip(req.answers, verdicts, strict=True)
            ],
        },
    }
