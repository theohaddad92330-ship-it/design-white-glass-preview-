"""Recherche et rattrapage d'embeddings sur `dataforge_rag_chunks` (ORION V12).

Corpus DISTINCT de `rag_documents` (`rag_service.py`) : celui-ci est PARTAGÉ
entre tous les espaces (marché, pas contenu client — même doctrine que
`dataforge_accounts` GA-16), donc aucun `user_id`/`workspace_id` n'entre dans
la portée d'une recherche. `account_id` filtre la PERTINENCE d'un chunk pour un
compte donné, jamais son éligibilité : les chunks `GARDE_FOU_QUALITE` (et tout
chunk `account_id IS NULL`) restent TOUJOURS joignables, quel que soit le
compte demandé — c'est `match_dataforge_rag_chunks`
(migration `1791510100000-OrionRagChunksVectorSearch.ts`) qui porte cette
garantie, pas ce module : il ne fait que l'appeler.

Même politique zéro-clé que le reste du RAG : `EMBEDDING_API_KEY` absente ⇒
liste vide / rattrapage sans effet, ZÉRO appel réseau, chemin byte-identique.
"""

from __future__ import annotations

import logging
import os
import time

from app.middleware.correlation_id import get_correlation_id
from app.services.company_filters import DegradeReason
from app.services.source_health import record_degradation
from app.services.supabase_client import get_supabase

logger = logging.getLogger(__name__)

GUARD_FOU_CHUNK_TYPE = "GARDE_FOU_QUALITE"


def _vectors_enabled() -> bool:
    """Même interrupteur que `rag_service._vectors_enabled` — la clé EST le
    seul interrupteur, pas un drapeau à part qui pourrait diverger."""
    return bool(os.environ.get("EMBEDDING_API_KEY", "").strip())


async def _get_embedding(text: str) -> list[float]:
    """Identique à `rag_service.PgVectorSearch._get_embedding` — même fournisseur,
    même modèle, mêmes variables d'environnement. Dupliquée plutôt qu'importée :
    l'autre est une méthode d'instance privée d'une classe qui porte sa propre
    logique de recherche `rag_documents`, sans rapport avec ce corpus."""
    import httpx

    api_key = os.environ.get("EMBEDDING_API_KEY", "")
    if not api_key:
        raise ValueError("EMBEDDING_API_KEY not set for vector search")

    embedding_url = os.environ.get("EMBEDDING_API_URL", "https://api.openai.com/v1/embeddings")
    model = os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small")

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(
            embedding_url,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": model, "input": text},
        )
        if not res.is_success:
            raise ValueError(f"Embedding API error: {res.status_code}")
        data = res.json()
        return data["data"][0]["embedding"]


async def _get_embeddings(texts: list[str]) -> list[list[float]]:
    """#3586 — UN appel à l'API d'embedding pour plusieurs textes (le champ `input` de l'API
    OpenAI-compatible accepte une liste ; même fournisseur, même modèle, mêmes variables que
    `_get_embedding`). Rend les vecteurs dans l'ordre des textes (`index` de la réponse)."""
    import httpx

    if not texts:
        return []
    api_key = os.environ.get("EMBEDDING_API_KEY", "")
    if not api_key:
        raise ValueError("EMBEDDING_API_KEY not set for vector search")

    embedding_url = os.environ.get("EMBEDDING_API_URL", "https://api.openai.com/v1/embeddings")
    model = os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small")

    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.post(
            embedding_url,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": model, "input": texts},
        )
        if not res.is_success:
            raise ValueError(f"Embedding API error: {res.status_code}")
        data = sorted(res.json()["data"], key=lambda item: item.get("index", 0))
        if len(data) != len(texts):
            raise ValueError(f"Embedding API: {len(data)} vecteurs pour {len(texts)} textes")
        return [item["embedding"] for item in data]


async def search_dataforge_rag_chunks(
    query_text: str, account_id: str | None = None, top_k: int = 8, type_chunk: str | None = None
) -> list[dict]:
    """Recherche sémantique sur le corpus ORION V12 partagé.

    `account_id=None` cherche sur tout le corpus (les 3 849 chunks) ; posé, il
    scope la pertinence à un compte SANS jamais exclure les chunks globaux —
    voir le docstring du module. Sans `EMBEDDING_API_KEY` : liste vide, aucun
    appel réseau (no-op strict, pas de repli plein texte ici — contrairement à
    `HybridSearch` côté `rag_documents`, ce corpus n'a pas encore de recherche
    plein texte de secours).

    #3586 — `type_chunk` filtre en SQL (`filter_type_chunk`) : sans lui, les 3 849 chunks
    ORION surclassent un chunk Drive. Transmis au RPC seulement s'il est fourni."""
    if not _vectors_enabled():
        return []
    query = (query_text or "").strip()
    if not query:
        return []

    try:
        embedding = await _get_embedding(query)
    except Exception as exc:  # noqa: BLE001 — une panne d'embedding ne casse pas l'appelant
        logger.warning("Recherche ORION RAG: embedding de la requête impossible: %s", exc)
        return []

    sb = get_supabase()
    threshold = float(os.environ.get("RAG_MATCH_THRESHOLD", "0.5"))
    params: dict = {
        "query_embedding": embedding,
        "match_threshold": threshold,
        "match_count": top_k,
        "filter_account_id": account_id,
    }
    if type_chunk:
        params["filter_type_chunk"] = type_chunk
    try:
        result = await sb.rpc("match_dataforge_rag_chunks", params).aexecute()
    except Exception as exc:  # noqa: BLE001 — une panne du store ne casse pas l'appelant
        logger.warning("Recherche ORION RAG: RPC indisponible: %s", exc)
        # R10C-FIX — un délai dépassé (57014) ou un 500 du RPC : bloc RAG vide DIT comme dégradé,
        # jamais une réponse de Laura en échec.
        record_degradation(
            get_correlation_id(),
            source="dataforge_rag",
            reason=f"match_dataforge_rag_chunks: {exc}",
            code=DegradeReason.UPSTREAM_ERROR,
        )
        return []
    return result.data or []


async def _count_remaining(sb) -> int | None:
    """Chunks vivants sans embedding, ou `None` si le store ne sait pas compter (jamais bloquant)."""
    try:
        res = (
            await sb.table("dataforge_rag_chunks")
            .select("id", count="exact")
            .is_("embedding", "null")
            .is_("archived_at", "null")
            .limit(1)
            .aexecute()
        )
        count = getattr(res, "count", None)
        return int(count) if count is not None else None
    except Exception:  # noqa: BLE001 — un compteur manquant ne casse pas le rattrapage
        return None


async def _embed_rows(rows: list[dict], embed_chars: int) -> list[list[float] | None]:
    """#3586 — un appel par lot de textes ; si le lot échoue, repli ligne à ligne (une ligne
    empoisonnée ne prive pas ses voisines). `None` = embedding impossible pour cette ligne."""
    texts = [(row.get("texte") or "")[:embed_chars] for row in rows]
    try:
        return list(await _get_embeddings(texts))
    except Exception as exc:  # noqa: BLE001 — repli ligne à ligne
        logger.warning("Backfill ORION RAG: lot de %d textes en échec (%s), repli ligne à ligne", len(rows), exc)
    out: list[list[float] | None] = []
    for row, text in zip(rows, texts):
        try:
            out.append(await _get_embedding(text))
        except Exception as exc:  # noqa: BLE001 — best-effort, la ligne reste à NULL
            logger.warning("Backfill ORION RAG: embedding impossible pour %s: %s", row.get("id"), exc)
            out.append(None)
    return out


async def backfill_dataforge_rag_chunk_embeddings(
    batch_size: int = 100, max_chunks: int | None = None, max_seconds: float | None = None
) -> dict:
    """Même contrat que `rag_service.backfill_embeddings` — reprenable (ne
    traite que `embedding IS NULL`), un échec par ligne ne fait pas tomber le
    lot (elle reste `NULL`, retentée au prochain passage), borné par
    `max_chunks` pour mesurer le coût avant de tout lancer.

    #3586 — `max_seconds` borne le temps (aucun nouveau lot après l'échéance) ; le résultat dit
    `done` (plus rien d'éligible) et `remaining` (nombre restant, `None` si inconnu) pour que
    l'appelant boucle tant qu'il en reste."""
    if not _vectors_enabled():
        return {"skipped": "EMBEDDING_API_KEY absente — rien à calculer", "embedded": 0, "failed": 0}

    sb = get_supabase()
    embedded = 0
    failed = 0
    scanned = 0
    done = False
    deadline = None if max_seconds is None else time.monotonic() + max_seconds
    embed_chars = int(os.environ.get("RAG_EMBED_CONTENT_CHARS", "2000"))
    per_call = max(1, int(os.environ.get("RAG_EMBED_BATCH_SIZE", "50")))

    while max_chunks is None or scanned < max_chunks:
        if deadline is not None and time.monotonic() >= deadline:
            break
        remaining = batch_size if max_chunks is None else min(batch_size, max_chunks - scanned)
        if remaining <= 0:
            break

        res = (
            await sb.table("dataforge_rag_chunks")
            .select("id, texte")
            .is_("embedding", "null")
            # #3586 — un chunk archivé (Drive interne : fichier modifié/supprimé) n'est plus servi par la
            # recherche : on ne paie pas son embedding.
            .is_("archived_at", "null")
            .limit(remaining)
            .aexecute()
        )
        rows = res.data or []
        if not rows:
            done = True
            break

        for start in range(0, len(rows), per_call):
            group = rows[start : start + per_call]
            vectors = await _embed_rows(group, embed_chars)
            for row, embedding in zip(group, vectors):
                scanned += 1
                if embedding is None:
                    failed += 1
                    continue
                try:
                    await sb.table("dataforge_rag_chunks").update({"embedding": embedding}).eq(
                        "id", row["id"]
                    ).aexecute()
                    embedded += 1
                except Exception as exc:  # noqa: BLE001 — une ligne ne fait pas tomber le lot
                    logger.warning("Backfill ORION RAG: écriture impossible pour %s: %s", row.get("id"), exc)
                    failed += 1

        if len(rows) < remaining:
            done = True
            break

    logger.info("Backfill ORION RAG chunks: %d calculés, %d en échec", embedded, failed)
    return {
        "embedded": embedded,
        "failed": failed,
        "scanned": scanned,
        "done": done,
        "remaining": await _count_remaining(sb),
    }
