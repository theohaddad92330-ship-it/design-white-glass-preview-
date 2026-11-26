"""La porte HTTP de la lecture automatique d'un justificatif (#1827.2).

Ce routeur ne décide RIEN côté droit d'accès — il est appelé en interne par
NestJS (`apps/api/src/modules/expenses/expense-extraction.service.ts`), qui a
déjà vérifié `records:write` / `finance:write` avant d'arriver ici, exactement
comme `/cv/extract` est appelé par `apps/api/src/modules/consultants`. La seule
responsabilité ici : décoder le fichier, appeler le service, et transformer une
panne technique (modèle indisponible) en 502 — jamais en un statut métier
inventé.
"""

from __future__ import annotations

import base64
import binascii
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services import expense_extraction

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/expenses", tags=["Expenses"])


class ExpenseExtractRequest(BaseModel):
    """Un justificatif, encodé en base64, avec son nom d'origine.

    Même forme que `CvExtractRequest` (`routers/cv.py`) : c'est le même geste
    (un fichier déposé, à lire), et deux formes différentes pour le même geste
    finiraient par diverger.
    """

    file_b64: str
    filename: str | None = None


@router.post("/extract")
async def extract_expense_receipt(req: ExpenseExtractRequest) -> dict:
    """Propose montant, date, catégorie, TVA depuis un justificatif — jamais
    une écriture, toujours une proposition à valider (voir le docstring de
    `services/expense_extraction.py`)."""
    try:
        raw = base64.b64decode(req.file_b64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Fichier base64 invalide.") from exc

    try:
        result = await expense_extraction.extract(raw, req.filename)
    except Exception as exc:
        # Une panne du modèle structurant (réseau, 5xx Anthropic) n'est PAS un
        # statut métier : elle remonte en 502, comme `/cv/parse`. La confondre
        # avec `not_configured` ou `unreadable` transformerait une panne
        # passagère en un renoncement permanent affiché à l'écran.
        logger.warning("Lecture automatique de justificatif indisponible : %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {"success": True, "data": result.to_dict()}
