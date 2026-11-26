"""#3750 — les MORCEAUX d'un document de connaissance (`rag_document_chunks`).

Trois gestes, et seulement ceux-là :

* **écrire** les morceaux d'un document à l'ingestion (`write_document_chunks`)
  — un embedding par morceau quand ``EMBEDDING_API_KEY`` est posée, aucun
  sinon (zéro réseau), la borne `RAG_MAX_CHUNKS_PER_DOCUMENT` journalisée ;
* **chercher** dans les morceaux (`search_chunks`) — RPC
  `search_rag_document_chunks`, dont le SQL applique la visibilité EXACTE de
  `match_rag_documents` sur le document parent (migration 1796434817523) ;
* **rattraper** les documents longs déjà en base (`backfill_document_chunks`)
  — par petit lot, idempotent : la base ne rend que les documents SANS morceau.

Le découpage lui-même est pur et vit dans `rag_chunking.py`.
"""

from __future__ import annotations

import logging
import os
from typing import Any

from app.services.dataforge_rag_chunks import _get_embeddings
from app.services.rag_chunking import Chunk, bound_chunks, build_chunks
from app.services.supabase_client import get_supabase

logger = logging.getLogger(__name__)

# Le rattrapage ne regarde que les documents de PLUS de 2 000 caractères : en
# dessous, l'ancien chemin les citait déjà en entier (ou presque) — les
# découper coûterait des embeddings pour ne rien changer à l'écran (#3750.4).
RAG_CHUNK_BACKFILL_MIN_CHARS = 2000
# Un passage du rattrapage traite au plus ce nombre de documents : jamais tout
# le parc d'un coup, le reste part au passage suivant.
RAG_CHUNK_BACKFILL_BATCH = 20


def _vectors_enabled() -> bool:
    """Même interrupteur que `rag_service._vectors_enabled` : la clé, seule."""
    return bool(os.environ.get("EMBEDDING_API_KEY", "").strip())


def _embed_text(title: str, chunk: Chunk) -> str:
    """Ce qu'on embarque pour un morceau : le titre du parent, son unité, son
    texte — un morceau « Trop cher | TCO » sans « Brand Messaging — 07 ·
    Objections » perdrait ce qui le rend retrouvable."""
    head = f"{title} — {chunk.unit_label}" if chunk.unit_label else title
    embed_chars = int(os.environ.get("RAG_EMBED_CONTENT_CHARS", "2000"))
    return f"{head}\n{chunk.content}"[:embed_chars]


async def _embed_chunks(title: str, chunks: list[Chunk]) -> list[list[float] | None]:
    """Un vecteur par morceau, par lots (`RAG_EMBED_BATCH_SIZE`), repli
    morceau par morceau si un lot échoue. Sans clé : que des ``None``, et
    AUCUN appel — c'est la condition, pas une option."""
    if not _vectors_enabled() or not chunks:
        return [None] * len(chunks)
    from app.services.rag_service import PgVectorSearch

    per_call = max(1, int(os.environ.get("RAG_EMBED_BATCH_SIZE", "50")))
    texts = [_embed_text(title, chunk) for chunk in chunks]
    vectors: list[list[float] | None] = []
    for start in range(0, len(texts), per_call):
        group = texts[start : start + per_call]
        try:
            vectors.extend(await _get_embeddings(group))
            continue
        except Exception as exc:  # noqa: BLE001 — repli morceau par morceau
            logger.warning("RAG morceaux : lot de %d embeddings en échec (%s), repli un à un", len(group), exc)
        for text in group:
            try:
                vectors.append(await PgVectorSearch()._get_embedding(text))
            except Exception as exc:  # noqa: BLE001 — le morceau reste cherchable en plein texte
                logger.warning("RAG morceaux : embedding impossible (%s)", exc)
                vectors.append(None)
    return vectors


async def write_document_chunks(
    document_id: str,
    title: str,
    content: str,
    *,
    user_id: str,
    workspace_id: str | None,
    units: list[tuple[str, str]] | None = None,
    document_embedding: list[float] | None = None,
    sb: Any = None,
) -> int:
    """Écrit les morceaux d'un document ; rend le nombre écrit.

    Un document COURT est un seul morceau : il reprend le vecteur du document
    (``document_embedding``) — #3750.5, aucun embedding de plus qu'avant.

    Au-delà de `RAG_MAX_CHUNKS_PER_DOCUMENT`, la suite n'est ni embarquée ni
    écrite, et le compte est JOURNALISÉ (#3750.7) : le document reste entier
    dans `rag_documents`, seule sa partie citable par morceau est bornée.

    Lève si l'écriture échoue : c'est l'appelant qui décide (l'ingestion
    journalise et continue, le rattrapage compte l'échec).
    """
    chunks, total = bound_chunks(build_chunks(content, units))
    if not chunks:
        return 0
    if total > len(chunks):
        logger.warning(
            "RAG morceaux : document %s (%r) tronqué à %d morceaux sur %d — la suite n'est pas citable par morceau",
            document_id,
            title,
            len(chunks),
            total,
        )
    if len(chunks) == 1 and document_embedding is not None:
        vectors: list[list[float] | None] = [document_embedding]
    else:
        vectors = await _embed_chunks(title, chunks)

    rows: list[dict[str, Any]] = []
    for index, (chunk, vector) in enumerate(zip(chunks, vectors, strict=True)):
        row: dict[str, Any] = {
            "document_id": document_id,
            "user_id": user_id,
            "chunk_index": index,
            "unit_label": chunk.unit_label,
            "content": chunk.content,
        }
        if workspace_id:
            row["workspace_id"] = workspace_id
        if vector is not None:
            row["embedding"] = vector
        rows.append(row)
    # Le MÊME client que l'appelant (`rag_service.ingest`) : la ligne parente et
    # ses morceaux passent par une seule connexion.
    await (sb or get_supabase()).table("rag_document_chunks").insert(rows).aexecute()
    return len(rows)


def _as_result(row: dict) -> dict | None:
    """Une ligne de la RPC → la forme d'un résultat de recherche : l'``id``
    est celui du document PARENT (la trace d'usage, les sources et le lien
    « ouvrir le document » restent ceux d'avant), le reste est le morceau."""
    if not isinstance(row, dict) or not row.get("document_id"):
        return None
    return {
        "id": row.get("document_id"),
        "chunk_id": row.get("chunk_id"),
        "title": row.get("title"),
        "unit_label": row.get("unit_label") or "",
        "content": row.get("content"),
        "category": row.get("category"),
        "origin": row.get("origin"),
        "created_at": row.get("created_at"),
        "similarity": row.get("similarity"),
    }


async def _rpc_search(params: dict, sb: Any = None) -> list[dict]:
    res = await (sb or get_supabase()).rpc("search_rag_document_chunks", params).aexecute()
    data = res.data if isinstance(getattr(res, "data", None), list) else []
    return [r for r in (_as_result(row) for row in data) if r is not None]


async def search_chunks(
    query_text: str,
    user_id: str,
    match_count: int,
    workspace_id: str | None = None,
    account_id: str | None = None,
    sb: Any = None,
) -> list[dict]:
    """Les morceaux pertinents, REGROUPÉS par document parent (ordre du
    meilleur morceau de chaque document, puis rang dans le document).

    Avec clé : vecteur d'abord, plein texte pour compléter (même règle que
    `HybridSearch` : une clé ajoute du rappel, elle n'en retire jamais). Sans
    clé : plein texte seul, ``query_embedding`` nul — zéro réseau (#3750.6).
    """
    from app.services.rag_service import PgVectorSearch, _valid_account_id

    base: dict[str, Any] = {
        "query_text": query_text,
        "query_embedding": None,
        "match_threshold": float(os.environ.get("RAG_MATCH_THRESHOLD", "0.5")),
        "match_count": match_count,
        "filter_user_id": user_id,
        "filter_workspace_id": workspace_id or None,
        "filter_account_id": _valid_account_id(account_id),
    }
    hits: list[dict] = []
    if _vectors_enabled():
        try:
            embedding = await PgVectorSearch()._get_embedding(query_text)
            hits = await _rpc_search({**base, "query_embedding": embedding}, sb)
        except Exception as exc:  # noqa: BLE001 — le plein texte prend le relais
            logger.warning("RAG morceaux : recherche vectorielle en échec, plein texte seul (%s)", exc)
    if len(hits) < match_count:
        seen = {h.get("chunk_id") for h in hits}
        for hit in await _rpc_search(base, sb):
            if hit.get("chunk_id") in seen:
                continue
            hits.append(hit)
            if len(hits) >= match_count:
                break
    order: dict[str, int] = {}
    for hit in hits:
        order.setdefault(str(hit["id"]), len(order))
    return sorted(hits, key=lambda h: order[str(h["id"])])


async def backfill_document_chunks(batch_size: int = RAG_CHUNK_BACKFILL_BATCH) -> dict:
    """#3750.4 — découpe les documents LONGS déjà en base qui n'ont pas de
    morceau, ``batch_size`` au plus par passage.

    Idempotent par construction : la RPC `rag_documents_pending_chunks` ne rend
    que les documents SANS morceau (`NOT EXISTS`) — un document traité ne
    revient jamais, un document en échec revient au passage suivant. Les unités
    sont relues dans le texte stocké (`units_from_text`) : le fichier d'origine
    n'est plus là. Un document en échec n'arrête pas le lot.
    """
    sb = get_supabase()
    res = await sb.rpc(
        "rag_documents_pending_chunks",
        {"min_chars": RAG_CHUNK_BACKFILL_MIN_CHARS, "batch_size": max(1, int(batch_size))},
    ).aexecute()
    rows = [r for r in (res.data or []) if isinstance(r, dict) and r.get("id")]
    documents = 0
    failed = 0
    written = 0
    for row in rows:
        try:
            written += await write_document_chunks(
                str(row["id"]),
                str(row.get("title") or ""),
                str(row.get("content") or ""),
                user_id=str(row.get("user_id") or ""),
                workspace_id=row.get("workspace_id"),
            )
            documents += 1
        except Exception as exc:  # noqa: BLE001 — un document ne fait pas tomber le lot
            logger.warning("RAG rattrapage des morceaux : document %s en échec (%s)", row.get("id"), exc)
            failed += 1
    logger.info("RAG rattrapage des morceaux : %d document(s) découpé(s), %d en échec", documents, failed)
    return {"documents": documents, "failed": failed, "chunks": written}
