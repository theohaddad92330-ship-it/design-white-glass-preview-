from __future__ import annotations

import base64
import binascii
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator

from app.models.outputs.org_declare import OrgDeclareOutput
from app.prompts.bellum_org_declare import build_system_prompt, build_user_prompt
from app.services.claude_service import call_claude
from app.services.document_org_people import extract_org_people
from app.services.document_reader import read_document
from app.services.document_text import DocumentTextError
from app.services.model_policy import model_for
from app.services.rag_service import fetch_org_chart_documents

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/org", tags=["Org"])

#: Même borne que `RfpAnalyseRequest` (`rfp.py`) — un organigramme ne dépasse
#: pas quelques mégaoctets, et le dire tôt vaut mieux qu'un timeout après coup.
_MAX_FILE_BYTES = 12 * 1024 * 1024


class OrgDeclareRequest(BaseModel):
    """Un organigramme décrit en toutes lettres (#1103), ou déposé en fichier
    (#3740, reste) — PDF, classeur Excel (.xlsx) ou présentation (.pptx), les
    trois familles déjà lues par `document_text.py` pour le RAG et l'intake RFP.

    Les deux entrées sont exclusives : `text` pour le texte libre tapé/collé,
    `file_base64`/`file_name` pour un fichier. Le TEXTE RÉSOLU (`resolvedText`
    de la réponse) est TOUJOURS la source que l'appelant doit garder pour sa
    propre garde anti-invention (`guardDeclaredPeople`, côté API) — jamais le
    `text` de la requête seul, qui est vide quand l'entrée est un fichier.
    """

    text: str | None = Field(default=None, max_length=20_000)
    file_base64: str | None = None
    file_name: str | None = None
    account_name: str = ""

    @model_validator(mode="after")
    def _one_source_only(self) -> "OrgDeclareRequest":
        has_text = bool(self.text and self.text.strip())
        if not has_text and not self.file_base64:
            raise ValueError("text or file_base64 is required")
        return self


async def _resolve_text(req: OrgDeclareRequest) -> str:
    """Le texte à mettre en forme, qu'il soit tapé ou déposé en fichier.

    Un refus explicite plutôt qu'un texte vide : « aucune personne nommée »
    sur un document illisible ferait croire qu'il n'en contenait pas.
    """
    if req.text and req.text.strip():
        return req.text

    try:
        raw = base64.b64decode(req.file_base64 or "", validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=422, detail="file_base64 is not valid base64") from exc

    if len(raw) > _MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="Fichier trop volumineux (max ~12 Mo).")

    try:
        # #3935.3 — les images d'organigramme sont enfin LUES (OCR, sinon Claude).
        extracted = await read_document(raw, req.file_name)
    except DocumentTextError as exc:
        # La cause est dite telle quelle : « PDF scanné », « archive corrompue »,
        # « classeur sans feuille » sont des messages actionnables.
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # Même borne que le texte tapé (`Field(max_length=20_000)`) : un organigramme
    # n'a pas besoin de plus, et ça protège le prompt d'un fichier de 400 000
    # caractères (la borne haute d'`read_document`).
    return extracted.text[:20_000]


@router.post("/declare-from-text")
async def declare_from_text(req: OrgDeclareRequest) -> dict:
    """Met en lignes un organigramme raconté en toutes lettres, ou déposé en
    fichier (#3740, reste).

    Aucune lecture de base : la seule source est le texte résolu (tapé, ou
    extrait du fichier). C'est ce qui rend la garde anti-invention VÉRIFIABLE
    côté appelant — chaque nom rendu doit se retrouver dans CE texte-là, et
    nulle part ailleurs — d'où `resolvedText` dans la réponse : l'appelant doit
    garder CELUI-LÀ, jamais le `text` de la requête qui peut être vide.
    """
    text = await _resolve_text(req)
    try:
        output, _usage = await call_claude(
            build_system_prompt(),
            build_user_prompt(text=text, account_name=req.account_name),
            response_model=OrgDeclareOutput,
            max_tokens=2000,
            prompt_name="bellum_org_declare",
            model=model_for("bellum_org_declare"),
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    # `resolvedText` vit DANS `data` (pas à la racine de l'enveloppe) : le
    # client générique (`IaClient`, apps/api) type l'enveloppe entière comme
    # `{ success, data }` — une clé hors de `data` ne lui serait pas accessible
    # sans élargir ce type partagé, pour une seule route.
    return {"success": True, "data": {**output.model_dump(), "resolvedText": text}}


class OrgDocumentPeopleRequest(BaseModel):
    user_id: str = Field(min_length=1)
    workspace_id: str | None = None
    account_id: str | None = None


@router.post("/document-people")
async def document_people(req: OrgDocumentPeopleRequest) -> dict:
    """#4072.1 — les personnes ÉCRITES dans les organigrammes de l'espace.

    Aucun modèle : `extract_org_people` ne lit que ce que le document dit. On
    PROPOSE (l'API filtre puis l'écran valide) ; rien n'est écrit ici. Une
    lecture en panne rend 502 — jamais une liste vide qui dirait « aucun
    organigramme ».
    """
    try:
        docs = await fetch_org_chart_documents(req.user_id, req.workspace_id, req.account_id)
    except Exception as exc:
        logger.warning("org document read failed: %s", exc)
        raise HTTPException(status_code=502, detail="La lecture des documents n'a pas abouti.") from exc
    return {"success": True, "data": extract_org_people(docs)}
