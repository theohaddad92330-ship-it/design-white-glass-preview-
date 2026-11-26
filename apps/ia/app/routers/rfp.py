from __future__ import annotations

import base64
import binascii
import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.prompts.bellum_rfp import (
    build_analysis_system_prompt,
    build_analysis_user_prompt,
    build_drafting_system_prompt,
    build_drafting_user_prompt,
)
from app.services.claude_service import call_claude
from app.services.document_reader import read_document
from app.services.document_text import DocumentTextError
from app.services.model_policy import model_for

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/rfp", tags=["RFP"])

#: Borne du fichier accepté à l'intake, en octets décodés. Un appel d'offres
#: dépasse rarement quelques mégaoctets ; au-delà, on refuse en le DISANT plutôt
#: que de laisser un timeout arriver après trente secondes d'attente.
_MAX_FILE_BYTES = 12 * 1024 * 1024


class RfpAnalyseRequest(BaseModel):
    """Un appel d'offres à analyser — soit son texte, soit son fichier brut.

    Les deux entrées existent parce que les deux situations existent : le
    commercial colle parfois trois paragraphes, et il dépose parfois un `.docx`
    de quarante pages. Le second chemin extrait le texte ICI, côté serveur, pour
    la même raison que l'ingestion RAG le fait (Théo p.21) : lire un `.docx` en
    UTF-8 côté navigateur produit du mojibake.
    """

    text: str | None = None
    file_base64: str | None = None
    file_name: str | None = None
    profile_data: dict[str, Any] = Field(default_factory=dict)
    account_name: str | None = None


class RfpDraftRequest(BaseModel):
    """UNE exigence à rédiger, avec les sources approuvées disponibles."""

    requirement: dict[str, Any]
    approved_sources: list[dict[str, Any]] = Field(default_factory=list)
    client_format: str | None = None


async def _resolve_text(req: RfpAnalyseRequest) -> str:
    """Le texte de l'appel d'offres, quelle qu'en soit la provenance.

    Un refus explicite plutôt qu'un texte vide : « aucune exigence trouvée » sur
    un document illisible ferait croire qu'il n'en contenait pas.
    """
    if req.text and req.text.strip():
        return req.text

    if not req.file_base64:
        raise HTTPException(status_code=422, detail="text or file_base64 is required")

    try:
        raw = base64.b64decode(req.file_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=422, detail="file_base64 is not valid base64") from exc

    if len(raw) > _MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="Fichier trop volumineux (max ~12 Mo).")

    try:
        # #3935.3 — la porte commune : OCR d'un scan, recollage, image lue.
        # CACHE-LLM (15/10) — un appel d'offres est un document PUBLIC : sa lecture
        # OCR / modèle se garde par l'empreinte de son contenu, commune à tous.
        return (await read_document(raw, req.file_name, response_cache=True)).text
    except DocumentTextError as exc:
        # La cause est dite telle quelle : « PDF scanné », « archive corrompue »,
        # « classeur sans feuille » sont des messages actionnables.
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/analyse")
async def analyse_rfp(req: RfpAnalyseRequest) -> dict:
    """Extrait les exigences d'un appel d'offres et rend un bid/no-bid argumenté.

    L'ordre est celui du rapport (p66) : on décide AVANT de rédiger. Rédiger
    d'abord et décider ensuite est ce qui fait répondre à des appels d'offres
    perdus d'avance, en y laissant trois jours d'avant-vente.
    """
    document = await _resolve_text(req)
    system_prompt = build_analysis_system_prompt()
    user_prompt = build_analysis_user_prompt(
        document,
        profile_data=req.profile_data,
        account_name=req.account_name,
    )
    logger.info("RFP analyse — document %d chars, prompt %d chars", len(document), len(user_prompt))

    try:
        result, _usage = await call_claude(
            system_prompt,
            user_prompt,
            response_model=dict,
            # Une grille d'exigences réaliste compte 40 à 120 lignes : la sortie
            # est structurellement longue, et une troncature couperait au milieu
            # d'une exigence (donc d'un engagement).
            max_tokens=8000,
            prompt_name="bellum_rfp_analyse",
            model=model_for("bellum_rfp_analyse"),
            domain_knowledge=True,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {"success": True, "data": result}


@router.post("/draft")
async def draft_rfp_answer(req: RfpDraftRequest) -> dict:
    """Rédige la réponse à UNE exigence — ou déclare ce qui manque.

    Une exigence par appel, délibérément : rédiger quarante réponses en un coup
    rend impossible de dire laquelle repose sur quelle source, et c'est
    précisément la traçabilité qui fait la valeur du studio.
    """
    system_prompt = build_drafting_system_prompt()
    user_prompt = build_drafting_user_prompt(
        req.requirement,
        approved_sources=req.approved_sources,
        client_format=req.client_format,
    )

    try:
        result, _usage = await call_claude(
            system_prompt,
            user_prompt,
            response_model=dict,
            max_tokens=2000,
            prompt_name="bellum_rfp_draft",
            model=model_for("bellum_rfp_draft"),
            domain_knowledge=True,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {"success": True, "data": result}
