"""La porte HTTP de l'évaluation de la grille de qualification (#3755).

Appelée en interne par NestJS (`qualification-evaluator.client.ts`), qui a déjà
résolu l'espace, la grille active et le compte : ce routeur ne décide RIEN côté
droit d'accès.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services import qualification_evaluation

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/qualification", tags=["Qualification"])


class QualificationEvaluateRequest(BaseModel):
    account_name: str
    dossier: dict[str, Any] = Field(default_factory=dict)
    criteria: list[dict[str, Any]] = Field(default_factory=list, max_length=60)
    signals: dict[str, Any] = Field(default_factory=dict)


@router.post("/evaluate")
async def evaluate(req: QualificationEvaluateRequest) -> dict:
    """Évalue chaque critère de la grille avec sa preuve — jamais une écriture."""
    try:
        evaluations = await qualification_evaluation.evaluate_grid(
            req.account_name, req.dossier, req.criteria, req.signals
        )
    except Exception as exc:
        # Une panne du modèle n'est PAS un statut métier : 502, comme `/needs/compile-text`.
        logger.warning("Évaluation de la grille indisponible : %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="evaluation_unavailable") from exc
    return {"success": True, "data": {"evaluations": evaluations}}
