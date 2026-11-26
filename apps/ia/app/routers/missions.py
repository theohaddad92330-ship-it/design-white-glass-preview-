"""La porte HTTP de la lecture automatique d'un document de mission (#2560).

Ce routeur ne décide RIEN côté droit d'accès — il est appelé en interne par
NestJS (`apps/api/src/modules/delivery/mission-extraction.service.ts`), qui a
déjà vérifié `records:write` avant d'arriver ici, exactement comme
`/expenses/extract` est appelé par `apps/api/src/modules/expenses`. La seule
responsabilité ici : décoder le fichier ou lire le texte déjà extrait, appeler
le service, et transformer une panne technique (modèle indisponible) en 502 —
jamais en un statut métier inventé.
"""

from __future__ import annotations

import base64
import binascii
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services import mission_extraction

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/missions", tags=["Missions"])


class MissionExtractRequest(BaseModel):
    """Un document à lire — son texte déjà extrait, ou son fichier brut.

    Même forme que `RfpAnalyseRequest` (`routers/rfp.py`) : le commercial colle
    parfois un e-mail, et il dépose parfois un contrat en `.pdf`.
    """

    text: str | None = None
    file_base64: str | None = None
    file_name: str | None = None


@router.post("/extract")
async def extract_mission(req: MissionExtractRequest) -> dict:
    """Propose compte, rôle, dates, TJM et jours depuis un document — jamais
    une écriture, toujours une proposition à valider (voir le docstring de
    `services/mission_extraction.py`)."""
    data: bytes | None = None
    if not req.text and req.file_base64:
        try:
            data = base64.b64decode(req.file_base64, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise HTTPException(status_code=400, detail="Fichier base64 invalide.") from exc
    elif not req.text and not req.file_base64:
        raise HTTPException(status_code=422, detail="text or file_base64 is required")

    try:
        result = await mission_extraction.extract(req.text, data, req.file_name)
    except Exception as exc:
        # Une panne du modèle structurant (réseau, 5xx Anthropic) n'est PAS un
        # statut métier : elle remonte en 502, comme `/expenses/extract` et
        # `/cv/parse`.
        logger.warning("Extraction de mission indisponible : %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {"success": True, "data": result.to_dict()}
