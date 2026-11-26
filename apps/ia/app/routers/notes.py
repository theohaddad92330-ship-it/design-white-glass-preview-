from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.models.outputs.meeting_notes import MeetingNotesOutput
from app.prompts.bellum_meeting_notes import build_system_prompt, build_user_prompt
from app.services.claude_service import call_claude
from app.services.model_policy import model_for

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/notes", tags=["Notes"])


class MeetingNotesRequest(BaseModel):
    """Des notes brutes — tapées, collées, ou issues d'une transcription."""

    notes: str = Field(min_length=1, max_length=60_000)
    account_name: str = ""
    attendees: str = ""
    #: Le texte est-il une transcription, ou des notes prises à la main ?
    #: C'est la seule information qui décide si un extrait CITABLE existe :
    #: exiger une citation sur des notes résumées revient à en faire fabriquer
    #: une. Le défaut est `False` — l'hypothèse prudente.
    from_transcript: bool = False
    #: #2319.61-.62 — la nature du texte collé. Un e-mail arrive ici parce que
    #: le commercial l'a collé : aucune route ne lit sa boîte (D58, D65).
    input_kind: Literal["notes", "transcript", "imported_report", "email"] = "notes"
    #: #2319.63 — la déclaration du commercial, distincte des notes.
    user_statement: str = Field(default="", max_length=10_000)


@router.post("/structure")
async def structure_notes(req: MeetingNotesRequest) -> dict:
    """Transforme des notes de rendez-vous en compte rendu exploitable.

    Aucune lecture de base : la seule source est ce que l'appelant envoie. C'est
    ce qui rend la route utilisable aussi bien sur des notes tapées que sur une
    transcription — et ce qui garantit que rien d'autre ne se glisse dans le
    compte rendu.
    """
    try:
        output, _usage = await call_claude(
            build_system_prompt(),
            build_user_prompt(
                notes=req.notes,
                account_name=req.account_name,
                attendees=req.attendees,
                from_transcript=req.from_transcript,
                input_kind=req.input_kind,
                user_statement=req.user_statement,
            ),
            response_model=MeetingNotesOutput,
            # Neuf sorties au lieu de six, chacune avec son extrait : le budget
            # d'origine (2500) tronquait la réponse au milieu des `learnings`,
            # et une réponse tronquée est une réponse illisible — pas une
            # réponse courte.
            max_tokens=4500,
            prompt_name="bellum_meeting_notes",
            model=model_for("bellum_meeting_notes"),
            domain_knowledge=True,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {"success": True, "data": output.model_dump()}
