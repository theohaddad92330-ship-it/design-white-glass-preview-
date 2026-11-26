"""La porte HTTP de la compilation d'un besoin depuis un texte collé (#2939).

Même garde que `/missions/extract` et `/rfp/analyse` : ce routeur ne décide
RIEN côté droit d'accès — il est appelé en interne par NestJS
(`apps/api/src/modules/projects/need-compile-text.service.ts`), qui a déjà
vérifié le droit d'écrire un besoin avant d'arriver ici.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services import need_compile_text

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/needs", tags=["Needs"])


class NeedCompileTextRequest(BaseModel):
    text: str
    source_kind: str


@router.post("/compile-text")
async def compile_need_text(req: NeedCompileTextRequest) -> dict:
    """Compile un brief ou un e-mail collé en PROPOSITION de besoin — jamais
    une écriture (voir le docstring de `services/need_compile_text.py`)."""
    try:
        result = await need_compile_text.compile_text(req.text, req.source_kind)
    except Exception as exc:
        # Une panne du modèle structurant (réseau, 5xx Anthropic) n'est PAS un
        # statut métier : elle remonte en 502, comme `/missions/extract`.
        logger.warning("Compilation de besoin indisponible : %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {"success": True, "data": result}
