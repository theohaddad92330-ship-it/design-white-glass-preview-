from __future__ import annotations

import base64
import binascii
import logging

from fastapi import APIRouter, HTTPException

from app.models.rag import (
    DataforgeRagBackfillRequest,
    DataforgeRagSearchRequest,
    RagExtractRequest,
    RagIngestRequest,
    RagQueryRequest,
    RagResponse,
)
from app.services import cost_ledger, vision_objects, vision_regions
from app.services.attachment_guard import attachment_refusal, sha256_of
from app.services.dataforge_rag_chunks import (
    backfill_dataforge_rag_chunk_embeddings,
    search_dataforge_rag_chunks,
)
from app.services.document_reader import read_document
from app.services.document_text import (
    DocumentTextError,
    _detect_image_media_type,
    extract_document_units,
    looks_like_image,
)
from app.services.image_minimization import minimized
from app.services.internal_knowledge_digest import generate_internal_knowledge_digest
from app.services.rag_chunks import backfill_document_chunks
from app.services.rag_service import (
    backend_status,
    count_documents,
    list_documents,
    purge_unused_documents,
)
from app.services.rag_service import (
    ingest as rag_ingest,
)
from app.services.rag_service import (
    query as rag_query,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/rag", tags=["RAG"])


@router.get("/status")
async def rag_status() -> dict:
    """Live RAG config + doc count for the operator dashboard. Degradable — a
    Supabase outage still returns the config (document_count=None)."""
    data = backend_status()
    try:
        data["document_count"] = await count_documents()
    except Exception as exc:  # noqa: BLE001 — config must show even if the store is down
        logger.warning("RAG count unavailable: %s", exc)
        data["document_count"] = None
        data["store_error"] = str(exc)
    return {"success": True, "data": data}


@router.get("/documents")
async def rag_documents(limit: int = 50) -> dict:
    """Operator listing of RAG docs (title/category/preview). Degradable."""
    try:
        docs = await list_documents(limit)
        return {"success": True, "data": {"documents": docs, "count": len(docs)}}
    except Exception as exc:  # noqa: BLE001
        logger.warning("RAG document listing failed: %s", exc)
        return {"success": False, "data": {"documents": [], "count": 0}, "error": str(exc)}


@router.post("/query", response_model=RagResponse)
async def handle_query(req: RagQueryRequest) -> RagResponse:
    try:
        results = await rag_query(req.query, req.user_id, req.top_k, req.workspace_id or None)
        return RagResponse(success=True, data={"documents": results, "count": len(results)})
    except Exception as exc:
        logger.error("RAG query failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


async def _extract_uploaded_text(file_b64: str, filename: str | None, source: str | None = None) -> tuple[str, bool]:
    """Décode + extrait le texte d'un fichier joint, SANS l'ingérer.

    Partagé par `/rag/ingest` (extraction avant dépôt durable) et
    `/rag/extract` (#2148.16 — extraction SEULE, aucune ligne créée) : même
    refus (taille, macros, type), même bascule image/document, un seul
    endroit à corriger si un format s'ajoute.
    """
    try:
        raw = base64.b64decode(file_b64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Fichier base64 invalide.") from exc
    # #2438.7 — taille et macros AVANT toute extraction. Couvre aussi
    # chaque entrée dépaquetée d'un `.zip` (`RagZipIngestService` renvoie
    # ici, une entrée à la fois).
    refusal = attachment_refusal(raw, filename, source)
    if refusal is not None:
        logger.warning(
            "Pièce jointe refusée (%s) : %s octets, sha256=%s, filename=%s",
            refusal.code,
            len(raw),
            sha256_of(raw),
            filename,
        )
        raise HTTPException(status_code=422, detail=refusal.message)
    try:
        # #3935.3 — UNE porte : lecture directe, qualité, OCR (clé posée), Claude.
        # Une image y suit le chemin plafonné de `extract_images_text` (#2667.2).
        extracted = await read_document(raw, filename)
    except DocumentTextError as exc:
        # 422 : le fichier est syntaxiquement OK mais inexploitable (scan, vide…).
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return extracted.text, extracted.partial


def _uploaded_units(file_b64: str, filename: str | None) -> list[tuple[str, str]] | None:
    """#3750 — les unités citables du fichier (onglets nommés, diapositives,
    sections), lues APRÈS `_extract_uploaded_text` (mêmes octets, déjà
    contrôlés). Best-effort : ``None`` — le découpage relira le texte — sur
    une image ou toute erreur, jamais un refus du dépôt."""
    try:
        raw = base64.b64decode(file_b64, validate=True)
        if looks_like_image(raw, filename):
            return None
        return extract_document_units(raw, filename) or None
    except Exception as exc:  # noqa: BLE001 — le texte suffit à découper
        logger.info("Unités du fichier illisibles (%s), découpage sur le texte : %s", filename, exc)
        return None


@router.post("/ingest", response_model=RagResponse)
async def handle_ingest(req: RagIngestRequest) -> RagResponse:
    # RAG PDF server-side (Théo p.21) : si un fichier base64 est fourni, on en
    # extrait le texte ici (PDF via pypdf, sinon UTF-8) avant l'ingest.
    content = req.content
    # #1954.16 / #1954.30 — vrai QUAND un PDF a au moins une page lisible et au
    # moins une page qui ne l'est pas (un scan glissé dans un dossier
    # autrement numérique). Reste `False` pour tout le reste : l'écran ne doit
    # jamais dire « partiel » sans un signal d'extraction réel derrière.
    partial = False
    units: list[tuple[str, str]] | None = None
    if req.file_b64:
        content, partial = await _extract_uploaded_text(req.file_b64, req.filename)
        units = _uploaded_units(req.file_b64, req.filename)

    if not content.strip():
        raise HTTPException(status_code=422, detail="Document vide — rien à ingérer.")

    try:
        # Tout ce qui entre par CETTE route vient d'un humain : un dépôt
        # manuel, une page Notion, un document Drive. C'est la définition de
        # `uploaded` (M6) — et c'est ce qui met ces documents hors de portée de
        # la purge automatique, puisque personne ne peut les régénérer.
        result = await rag_ingest(
            req.title,
            content,
            req.category,
            req.user_id,
            req.workspace_id or None,
            origin="uploaded",
            # #1954.7 — la PORTÉE (Louis, 12/09/2026) : `workspace` (défaut,
            # byte-identique à avant) ancre l'équipe ; `conversation` ne sert
            # qu'au FIL qui l'a déposé.
            scope=req.scope,
            conversation_id=req.conversation_id or None,
            # #2779 — le compte visé quand `scope = 'account'`.
            account_id=req.account_id or None,
            # #2861 (#2437.2, niveau SOURCE) — la langue DÉCLARÉE, jamais devinée.
            language=req.language or None,
            # #3750 — les onglets / diapositives / sections du FICHIER, pour
            # que chaque morceau se cite « Titre — 07 · Objections ».
            units=units,
        )
        # #1954.16 / #1954.30 — le signal voyage jusqu'à la réponse HTTP : c'est
        # NestJS/l'écran qui décident quoi en faire (jamais un succès plein).
        return RagResponse(success=True, data={**result, "partial": partial})
    except ValueError as exc:
        # `scope='conversation'` sans `conversation_id` — refusé PRÉALABLEMENT
        # par `rag_service.ingest`, avant toute requête. 422 : c'est une entrée
        # invalide, pas une panne du service (même famille que `DocumentTextError`
        # juste au-dessus).
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("RAG ingest failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/extract", response_model=RagResponse)
async def handle_extract(req: RagExtractRequest) -> RagResponse:
    """#2148.16 — LA PIÈCE JOINTE DE CONVERSATION (cas a) : extraire le texte
    d'un fichier pour QUE Laura le lise ce tour-ci, sans créer AUCUNE ligne
    dans `rag_documents`.

    Même extraction que `/rag/ingest` (`_extract_uploaded_text`, mêmes refus
    de taille/macro, même bascule image/document) — la SEULE différence est
    ce qu'il n'y a pas ici : aucun appel à `rag_ingest`, donc aucun objet
    durable, aucune trace au-delà de cette réponse HTTP.
    """
    content, partial = await _extract_uploaded_text(req.file_b64, req.filename, req.source)
    if not content.strip():
        raise HTTPException(status_code=422, detail="Document vide — rien à lire.")
    data: dict = {"text": content, "partial": partial}
    regions = await _chat_image_regions(req.file_b64, req.filename, content)
    if regions:
        data["regions"] = regions
    if req.locate_objects:
        objects = await _chat_image_objects(req.file_b64, req.filename)
        if objects is not None:
            data["objects"] = objects
    return RagResponse(success=True, data=data)


def _readable_image(file_b64: str, filename: str | None) -> tuple[bytes, str] | None:
    """Les octets que le modèle a LUS (remis droits, sans métadonnée) et leur type,
    pour une image seulement : une zone se mesure sur l'image lue."""
    raw = base64.b64decode(file_b64, validate=True)
    if not looks_like_image(raw, filename):
        return None
    media_type = _detect_image_media_type(raw, filename)
    if media_type is None:
        return None
    return minimized(raw)[0], media_type


async def _chat_image_objects(file_b64: str, filename: str | None) -> dict | None:
    """#2433.12 (épopée #2876, lot P02 09/10) — les BORDS du document et la GRILLE
    d'un tableau d'une image jointe au chat (`vision_objects.locate_objects`).
    UN appel par image, jamais en boucle ; son coût porte l'outil
    (`provider_costs.tool`, lot M10). `None` = rien mesuré (pas une image, ou
    panne) : l'écran ne dit alors rien, jamais « bords non détectés »."""
    try:
        image = _readable_image(file_b64, filename)
        if image is None:
            return None
        with cost_ledger.bind_tool(vision_objects.COST_TOOL):
            return await vision_objects.locate_objects(*image)
    except Exception as exc:  # noqa: BLE001 — un recadrage proposé est un bonus, jamais une panne
        logger.warning("Objets de l'image du chat indisponibles : %s", type(exc).__name__)
        return None


async def _chat_image_regions(file_b64: str, filename: str | None, text: str) -> list[dict]:
    """#2433.4 (épopée #2876, lot M10 09/10) — OÙ chaque ligne lue se trouve
    dans l'image jointe au chat (`vision_regions.locate_lines`, le primitif du
    justificatif photo). Une image SEULEMENT, et les octets que le modèle a lus
    (remis droits, sans métadonnée) : une zone se mesure sur l'image lue. Sans
    zone valide — ou sur panne — ``[]`` : la lecture n'en dépend jamais."""
    try:
        image = _readable_image(file_b64, filename)
        if image is None:
            return []
        return await vision_regions.locate_lines(*image, text)
    except Exception as exc:  # noqa: BLE001 — une citation visuelle est un bonus, jamais une panne
        logger.warning("Zones de l'image du chat indisponibles : %s", type(exc).__name__)
        return []


@router.post("/purge")
async def handle_purge(dry_run: bool = False) -> dict:
    """La purge mensuelle du magasin (tome 7 §38, M3).

    Gardée par le secret interne comme le reste du service — elle EFFACE, et
    aucun navigateur ne doit pouvoir la déclencher. L'appelant est le balayage
    mensuel de l'API NestJS, qui possède l'infrastructure de cron et le verrou
    multi-replica ; le service IA, lui, possède la table.

    Ne lève jamais : une purge en échec laisse le magasin intact, ce qui est le
    bon comportement par défaut pour un geste destructeur.
    """
    try:
        return await purge_unused_documents(dry_run=dry_run)
    except Exception as exc:  # noqa: BLE001 — un geste destructeur échoue en NE FAISANT RIEN
        logger.error("RAG purge failed: %s", exc)
        return {"examined": 0, "purged": 0, "dry_run": dry_run, "ids": [], "error": str(exc)}


@router.post("/chunks/backfill")
async def handle_chunk_backfill(batch_size: int = 20) -> dict:
    """#3750.4 — le rattrapage des MORCEAUX : découpe un petit lot de documents
    longs déjà en base qui n'en ont pas. Appelé chaque nuit par l'API
    (`RagChunkBackfillScheduler`), jamais au déploiement. Idempotent : un
    document découpé n'est plus rendu par la base. Ne lève jamais — un
    rattrapage en échec laisse le magasin tel quel et repassera."""
    try:
        result = await backfill_document_chunks(batch_size=max(1, min(batch_size, 100)))
        return {"success": True, "data": result}
    except Exception as exc:  # noqa: BLE001 — un rattrapage échoue en ne faisant rien
        logger.error("RAG chunk backfill failed: %s", exc)
        return {"success": False, "data": {"documents": 0, "failed": 0, "chunks": 0}, "error": str(exc)}


@router.post("/dataforge/search", response_model=RagResponse)
async def handle_dataforge_search(req: DataforgeRagSearchRequest) -> RagResponse:
    """Recherche sur le corpus ORION V12 partagé (`dataforge_rag_chunks`) —
    distinct de `/rag/query` (`rag_documents`, la base de connaissance PAR
    espace). Ne lève jamais : `search_dataforge_rag_chunks` dégrade déjà en
    liste vide sur panne d'embedding ou de store."""
    results = await search_dataforge_rag_chunks(req.query, req.account_id, req.top_k)
    return RagResponse(success=True, data={"chunks": results, "count": len(results)})


@router.post("/dataforge/backfill-embeddings")
async def handle_dataforge_backfill(req: DataforgeRagBackfillRequest) -> dict:
    """Rattrapage manuel — même geste que le backfill de `rag_documents`, sur
    le corpus ORION V12. Se lance une fois après une ingestion sans
    `EMBEDDING_API_KEY`, ou après l'avoir posée pour la première fois."""
    try:
        result = await backfill_dataforge_rag_chunk_embeddings(req.batch_size, req.max_chunks, req.max_seconds)
        return {"success": True, "data": result}
    except Exception as exc:  # noqa: BLE001 — un rattrapage manuel échoue sans casser l'appelant
        logger.error("ORION RAG backfill failed: %s", exc)
        return {"success": False, "data": {"embedded": 0, "failed": 0}, "error": str(exc)}


@router.post("/internal-knowledge/digest")
async def handle_internal_knowledge_digest() -> dict:
    """#3586 (W2) — produit le digest du Drive interne (UN appel Claude). Appelé
    par l'API en fin de synchro, seulement quand l'empreinte des fichiers a
    changé ; c'est l'API qui le stocke et archive l'ancien. Ne lève jamais :
    une panne rend ``success: false`` et l'API garde le digest courant."""
    try:
        result = await generate_internal_knowledge_digest()
        return {"success": True, "data": result}
    except Exception as exc:  # noqa: BLE001 — l'API retentera au passage suivant
        logger.error("Digest du Drive interne en échec: %s", type(exc).__name__)
        return {"success": False, "data": {"digest": None}, "error": type(exc).__name__}
