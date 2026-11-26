from __future__ import annotations

import logging
import os
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol

from app.middleware.correlation_id import get_correlation_id
from app.prompts.fencing import fence
from app.services.attachment_guard import sha256_of
from app.services.ingestion_guard import RagIngestionRefused, rag_ingestion_refusal
from app.services.source_health import record_degradation
from app.services.supabase_client import get_supabase
from app.services.workspace_scope import resolve_workspace_id

logger = logging.getLogger(__name__)


class EmbeddingProvider(Protocol):
    """Interface for embedding providers — swap for production."""

    async def embed(self, text: str) -> list[float]: ...


# `origin` voyage avec le reste : sans elle, la purge de M3 et l'affichage de la
# source devraient relire chaque document. `used_count` NON — c'est une donnée
# de gestion du magasin, pas de récupération, et l'ajouter grossirait chaque
# réponse de recherche pour une valeur qu'aucun consommateur ne lit.
_COLS = "id, title, content, category, origin, created_at"


def _scope(query, user_id: str, workspace_id: str | None):
    """Apply the retrieval scope to a PostgREST query.

    The knowledge base is a TEAM asset: the ESN uploads its references once and
    every member's analysis must ground on them. So the scope is the workspace,
    not the uploader — with one exception, kept deliberately narrow:

    ``workspace_id IS NULL`` rows are the ones the IA wrote before it knew about
    workspaces. The migration backfills what it can derive; whatever genuinely
    can't be resolved stays NULL rather than being assigned to a plausible
    workspace, and remains reachable BY ITS OWNER ONLY. Nothing is orphaned, and
    nothing becomes visible to someone who couldn't see it before.

    This predicate is character-for-character the RLS policy
    ``rag_documents_workspace_access`` (migration 1784600000001), so the service
    filter can never be wider than the database backstop.

    No workspace resolved ⇒ the legacy per-user filter, unchanged.
    """
    if workspace_id:
        return query.or_(f"workspace_id.eq.{workspace_id},and(workspace_id.is.null,user_id.eq.{user_id})")
    return query.eq("user_id", user_id)


def _scope_workspace(query, user_id: str, workspace_id: str | None):
    """La portée de la récupération GÉNÉRALE — recherche plein texte/vecteur,
    RAG d'une analyse de compte, `/rag-documents/query` (#1954.7).

    C'est `_scope()` ci-dessus, PLUS `scope = 'workspace'` : un document JOINT
    à une conversation (`scope = 'conversation'`) ne doit JAMAIS grounder une
    recherche générale, même dans son propre espace. Seul
    `fetch_documents_by_ids` (le tour de chat de SA propre conversation) sait
    lire un document `conversation` — voir sa note.

    Le filtre vit DANS la requête (un `.eq()` de plus), jamais après coup : un
    document exclu ici n'est jamais chargé en Python pour être rejeté ensuite.
    """
    return _scope(query, user_id, workspace_id).eq("scope", "workspace")


# #2779 — les cinq portées d'un document (miroir de `RAG_DOCUMENT_SCOPES`,
# `packages/contracts/src/schemas/rag.ts` ; parité tenue par
# `tests/test_rag_contract_parity.py`). Recopiées ici pour la même raison que
# `RAG_DECAY_HORIZON_DAYS` : `packages/` n'est pas dans le contexte de build.
RAG_DOCUMENT_SCOPES = ("workspace", "conversation", "personal", "account", "knowledge_base")

# #3669.2 — miroir de `RAG_PROCESSING_STATUSES` (contrat TS), tenu par
# `test_rag_contract_parity`. `ingest` n'écrit QUE `usable` : le texte a été
# extrait et indexé (`_refuse_unless_knowledge` refuse sinon). Les autres
# états s'écrivent là où le traitement les constate, jamais par défaut.
RAG_PROCESSING_STATUSES = ("received", "processing", "usable", "partial", "to_fix")
# Les portées lues par TOUTE l'équipe dans la récupération générale.
_TEAM_SCOPES = ("workspace", "knowledge_base")


def _valid_account_id(account_id: str | None) -> str | None:
    """#2779 — le compte, SEULEMENT s'il a la forme d'un identifiant de compte.

    Il est interpolé dans un filtre PostgREST (`_visibility_filter`) : une valeur
    portant `,` ou `)` réécrirait le filtre. Tout ce qui n'est pas un UUID est
    donc traité comme « aucun compte » — fail closed : un document `account`
    devient invisible, jamais visible à tort."""
    raw = (account_id or "").strip()
    if not raw:
        return None
    try:
        return str(uuid.UUID(raw))
    except (ValueError, AttributeError, TypeError):
        return None


def _visibility_filter(user_id: str, account_id: str | None) -> str:
    """#2779 — QUI peut lire QUOI, en une expression PostgREST ``or``.

    * `workspace` / `knowledge_base` : toute l'équipe ;
    * `personal` : son AUTEUR seulement ;
    * `account` : SEULEMENT une requête qui porte CE compte — une requête sur un
      autre compte, ou sans compte, ne le voit jamais ;
    * `conversation` : jamais (seul `fetch_documents_by_ids` le lit, par fil).

    Même prédicat que la RPC `match_rag_documents` (migration 1796001516284) —
    jamais un seul des deux moteurs scopé."""
    clauses = [
        f"scope.in.({','.join(_TEAM_SCOPES)})",
        f"and(scope.eq.personal,user_id.eq.{user_id})",
    ]
    account = _valid_account_id(account_id)
    if account:
        clauses.append(f"and(scope.eq.account,account_id.eq.{account})")
    return ",".join(clauses)


def _scope_retrieval(
    query,
    user_id: str,
    workspace_id: str | None,
    account_id: str | None = None,
    *,
    exclude_archived: bool = True,
):
    """#2779 — la portée de la récupération GÉNÉRALE : le tenant (`_scope`) ET
    la visibilité par portée (`_visibility_filter`), deux `or` distincts que
    PostgREST combine en ET. Remplace `_scope_workspace` sur les chemins de
    LECTURE ; `_scope_workspace` reste celle de l'écriture du flywheel (qui ne
    met à jour que des documents `workspace`).

    #2431.5 (reste, épopée #2886) — un document ARCHIVÉ (remplacé par
    `RagService.replaceDocument`, `archived_at` posé) ne grounde plus la
    DÉCOUVERTE générale (`TextSearchFallback`/`PgVectorSearch`, même prédicat
    que la RPC `match_rag_documents`, migration 1796321507530) : sur cet appel,
    ``exclude_archived`` reste à sa valeur par défaut. `fetch_documents_by_ids`
    passe `exclude_archived=False` : un document JOINT explicitement par son
    identifiant reste lisible même archivé — une citation déjà rendue ou une
    question suivante du même fil continue de le retrouver ; seule la
    découverte générale l'exclut, jamais la lecture par identifiant."""
    scoped = _scope(query, user_id, workspace_id).or_(_visibility_filter(user_id, account_id))
    return scoped.is_("archived_at", "null") if exclude_archived else scoped


class TextSearchFallback:
    """Text-search backend for when pgvector embeddings aren't configured.

    Full-text search (``websearch_to_tsquery``) over content + title — real
    tokenized/stemmed recall. A one-substring ``ILIKE '%query%'`` (the previous
    default) missed almost everything: multi-word queries, word order, stemming
    all broke it. FTS is computed on the fly by PostgREST, no index/migration
    needed. ILIKE is kept as a degradation path if FTS errors (e.g. a config the
    DB doesn't have) so retrieval never hard-fails."""

    async def query(
        self,
        query_text: str,
        user_id: str,
        top_k: int = 5,
        workspace_id: str | None = None,
        account_id: str | None = None,
    ) -> list[dict]:
        q = (query_text or "").strip()
        if not q:
            return []
        try:
            docs = await self._fts(q, user_id, top_k, workspace_id, account_id=account_id)
            return docs
        except Exception as exc:  # noqa: BLE001 — degrade to substring, never hard-fail
            logger.warning("RAG FTS failed, falling back to ILIKE: %s", exc)
            return await self._ilike(q, user_id, top_k, workspace_id, account_id=account_id)

    async def _fts(
        self,
        query_text: str,
        user_id: str,
        top_k: int,
        workspace_id: str | None = None,
        account_id: str | None = None,
    ) -> list[dict]:
        sb = get_supabase()
        docs: list[dict] = []
        # Content first (the body carries the answer), then title to top up.
        # #1954.7 / #2779 — `_scope_retrieval` : jamais un document `conversation`,
        # jamais le `personal` d'un collègue, jamais un `account` d'un autre compte.
        content_res = (
            await _scope_retrieval(sb.table("rag_documents").select(_COLS), user_id, workspace_id, account_id)
            .text_search("content", query_text)
            .limit(top_k)
            .aexecute()
        )
        if content_res.error:
            raise RuntimeError(content_res.error)
        docs.extend(content_res.data or [])
        if len(docs) < top_k:
            seen = {d["id"] for d in docs}
            title_res = (
                await _scope_retrieval(sb.table("rag_documents").select(_COLS), user_id, workspace_id, account_id)
                .text_search("title", query_text)
                .limit(top_k - len(docs))
                .aexecute()
            )
            if title_res.error:
                raise RuntimeError(title_res.error)
            docs.extend(d for d in (title_res.data or []) if d["id"] not in seen)
        return docs

    async def _ilike(
        self,
        query_text: str,
        user_id: str,
        top_k: int = 5,
        workspace_id: str | None = None,
        account_id: str | None = None,
    ) -> list[dict]:
        sb = get_supabase()
        docs: list[dict] = []

        # #1954.7 — `_scope_workspace` sur les trois passes (content/title/category) :
        # scoper une seule passe laisserait fuir un document joint sur les deux autres.
        result = (
            await _scope_retrieval(sb.table("rag_documents").select(_COLS), user_id, workspace_id, account_id)
            .ilike("content", f"%{query_text[:100]}%")
            .limit(top_k)
            .aexecute()
        )
        docs.extend(result.data or [])

        if len(docs) < top_k:
            existing_ids = {d["id"] for d in docs}
            title_result = (
                await _scope_retrieval(sb.table("rag_documents").select(_COLS), user_id, workspace_id, account_id)
                .ilike("title", f"%{query_text[:50]}%")
                .limit(top_k - len(docs))
                .aexecute()
            )
            for d in title_result.data or []:
                if d["id"] not in existing_ids:
                    docs.append(d)

        if len(docs) < top_k:
            existing_ids = {d["id"] for d in docs}
            cat_result = (
                await _scope_retrieval(sb.table("rag_documents").select(_COLS), user_id, workspace_id, account_id)
                .ilike("category", f"%{query_text[:30]}%")
                .limit(top_k - len(docs))
                .aexecute()
            )
            for d in cat_result.data or []:
                if d["id"] not in existing_ids:
                    docs.append(d)

        return docs


class PgVectorSearch:
    """Production search using pgvector similarity via Supabase RPC.

    Requires:
    - EMBEDDING_API_KEY env var (OpenAI or Voyage)
    - pgvector extension enabled in Supabase
    - rag_documents.embedding column populated
    - match_rag_documents RPC function (see supabase/migrations/00003)

    Active as soon as EMBEDDING_API_KEY is set (zero-flag policy: the key IS the
    switch). Without the key, retrieval stays on TextSearchFallback.
    """

    async def _get_embedding(self, text: str) -> list[float]:
        """Get embedding via OpenAI or Voyage API."""
        import httpx

        api_key = os.environ.get("EMBEDDING_API_KEY", "")
        if not api_key:
            raise ValueError("EMBEDDING_API_KEY not set for vector search")

        embedding_url = os.environ.get(
            "EMBEDDING_API_URL",
            "https://api.openai.com/v1/embeddings",
        )
        model = os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small")

        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.post(
                embedding_url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={"model": model, "input": text},
            )
            if not res.is_success:
                raise ValueError(f"Embedding API error: {res.status_code}")
            data = res.json()
            return data["data"][0]["embedding"]

    async def query(
        self,
        query_text: str,
        user_id: str,
        top_k: int = 5,
        workspace_id: str | None = None,
        account_id: str | None = None,
    ) -> list[dict]:
        """Search using pgvector cosine similarity.

        ``filter_workspace_id`` carries the same scope as the full-text path — the
        RPC applies the workspace predicate (with the legacy owner fallback) SQL-side,
        see migration 1786970000000. Applying the scope to only one of the two
        backends would leak the moment ``EMBEDDING_API_KEY`` is set."""
        embedding = await self._get_embedding(query_text)
        sb = get_supabase()

        # 0.7 is aggressive for text-embedding-3-small cosine (can return zero for
        # genuinely relevant docs). Env-tunable like the rest of the module.
        threshold = float(os.environ.get("RAG_MATCH_THRESHOLD", "0.5"))
        params: dict = {
            "query_embedding": embedding,
            "match_threshold": threshold,
            "match_count": top_k,
            "filter_user_id": user_id,
            "filter_workspace_id": workspace_id or None,
        }
        # #2779 — le compte de la requête : SEUL il rend visibles les documents
        # `account` de CE compte. Envoyé seulement quand il existe : sans compte,
        # l'appel reste celui d'avant la migration 1796001516284 (déploiement
        # de l'IA et de l'API dans n'importe quel ordre).
        account = _valid_account_id(account_id)
        if account:
            params["filter_account_id"] = account
        result = await sb.rpc("match_rag_documents", params).aexecute()

        return result.data or []


class HybridSearch:
    """Vecteur ET plein texte, dans cet ordre — jamais l'un À LA PLACE de l'autre.

    L'embedding d'un document est calculé À L'INGESTION. Le jour où
    ``EMBEDDING_API_KEY`` est posée, la recherche basculait d'un coup en mode
    vectoriel pour tout le monde : chaque document déjà en base, dépourvu de
    vecteur, devenait introuvable. La base de connaissance se vidait à l'écran
    sans qu'aucune erreur ne le dise, et le geste qui provoque ça — activer une
    clé — est précisément celui dont on attend une AMÉLIORATION.

    La règle est donc : une clé d'embedding AJOUTE du rappel sémantique, elle ne
    retire jamais un document. Les deux jeux sont fusionnés par Reciprocal Rank
    Fusion (k=60, #4109), dédoublonné par identifiant ; un reranker FlashRank
    optionnel (``RAG_RERANK_ENABLED``) reclasse ensuite le haut de liste.

    Effet de bord utile : le seuil cosine (0,5 par défaut) peut rendre zéro
    résultat sur un document pourtant pertinent — le commentaire de
    {@link PgVectorSearch.query} le dit déjà. Le plein texte le rattrape.
    """

    def __init__(self) -> None:
        self._vectors = PgVectorSearch()
        self._text = TextSearchFallback()

    async def query(
        self,
        query_text: str,
        user_id: str,
        top_k: int = 5,
        workspace_id: str | None = None,
        account_id: str | None = None,
    ) -> list[dict]:
        # #4109 — Reciprocal Rank Fusion des deux listes (plus « vecteur d'abord »).
        # Le bassin est élargi quand le reranker est actif, pour lui laisser du choix.
        rerank = _rerank_enabled()
        pool = max(top_k, _RERANK_POOL) if rerank else top_k
        try:
            vec = await self._vectors.query(query_text, user_id, pool, workspace_id, account_id=account_id)
        except Exception as exc:  # noqa: BLE001 — une panne du vecteur ne vide pas la base
            logger.warning("RAG vector search failed, text search only: %s", exc)
            vec = []
        try:
            txt = await self._text.query(query_text, user_id, pool, workspace_id, account_id=account_id)
        except Exception as exc:  # noqa: BLE001 — le vecteur a peut-être déjà répondu
            logger.warning("RAG text search failed after vector: %s", exc)
            txt = []

        fused = reciprocal_rank_fusion([vec, txt])
        if rerank and len(fused) > 1:
            try:
                fused = _flashrank_rerank(query_text, fused[:_RERANK_POOL]) + fused[_RERANK_POOL:]
            except Exception as exc:  # noqa: BLE001 — jamais d'erreur utilisateur : ordre RRF
                logger.warning("RAG rerank failed, serving RRF order: %s", exc)
        return fused[:top_k]


# #4109 — RRF constant (Cormack et al.) and rerank candidate pool (30-50 range).
_RRF_K = 60
_RERANK_POOL = 40


def reciprocal_rank_fusion(lists: list[list[dict]], k: int = _RRF_K) -> list[dict]:
    """Fuse ranked lists: score(doc) = Σ 1 / (k + rank), rank starting at 1.

    Dedupes by ``id`` (first occurrence's payload wins). Ties keep first-seen order
    (stable sort), so a single non-empty list comes back in its own order."""
    scores: dict[str, float] = {}
    first: dict[str, dict] = {}
    for docs in lists:
        seen_here: set[str] = set()
        rank = 0
        for doc in docs:
            doc_id = doc["id"]
            if doc_id in seen_here:
                continue
            seen_here.add(doc_id)
            rank += 1
            scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (k + rank)
            first.setdefault(doc_id, doc)
    ordered = sorted(scores, key=lambda i: -scores[i])
    return [first[i] for i in ordered]


def _rerank_enabled() -> bool:
    """Opt-in (#4109): off by default ⇒ byte-identical path, flashrank never imported."""
    return os.environ.get("RAG_RERANK_ENABLED", "").strip().lower() in {"1", "true", "yes", "on"}


def _flashrank_rerank(query_text: str, docs: list[dict]) -> list[dict]:
    """Rerank with FlashRank (lazy import). Raises on any failure; caller falls back."""
    from flashrank import Ranker, RerankRequest  # noqa: PLC0415 — optional dependency

    ranker = Ranker()
    passages = [
        {"id": d["id"], "text": f"{d.get('title') or ''}\n{d.get('content') or ''}"[:2000]} for d in docs
    ]
    results = ranker.rerank(RerankRequest(query=query_text, passages=passages))
    by_id = {d["id"]: d for d in docs}
    ordered = [by_id[r["id"]] for r in results if r["id"] in by_id]
    # Never drop a document: anything the reranker did not return keeps its RRF slot, last.
    returned = {d["id"] for d in ordered}
    return ordered + [d for d in docs if d["id"] not in returned]


def _get_search_backend():
    """Get the appropriate search backend based on environment."""
    if _vectors_enabled():
        return HybridSearch()
    return TextSearchFallback()


def _vectors_enabled() -> bool:
    """Vector search is ON as soon as EMBEDDING_API_KEY is present — the key is
    the only switch (zero-flag policy). No key ⇒ full-text fallback, no network."""
    return bool(os.environ.get("EMBEDDING_API_KEY", "").strip())


async def _maybe_generate_embedding(title: str, content: str) -> list[float] | None:
    """Embed the title + a WIDE window of the body when vector search is enabled;
    ``None`` otherwise, or on failure (the caller then stores the doc text-only).

    Embed the title + a wide window of the body (#13): the old ``content[:500]``
    left everything past the first ~80 words invisible to the vector, so a doc only
    matched on its intro. text-embedding-3-small handles ~8k tokens, so 2000 chars
    is safe and env-tunable. (Full per-chunk fan-out = future step.)
    """
    if not _vectors_enabled():
        return None
    try:
        backend = PgVectorSearch()
        embed_chars = int(os.environ.get("RAG_EMBED_CONTENT_CHARS", "2000"))
        return await backend._get_embedding(f"{title} {content[:embed_chars]}")
    except Exception as exc:  # noqa: BLE001 — embedding is best-effort; store text-only
        logger.warning("Failed to generate embedding: %s", exc)
        return None


async def _effective_workspace(user_id: str, workspace_id: str | None) -> str | None:
    """The workspace to stamp on a write. NestJS passes it (it owns the workspace
    model); when a caller doesn't, derive it rather than writing an un-scoped row
    the team would never see. Unresolvable ⇒ ``None``: the row stays owner-private
    instead of being assigned to a plausible workspace."""
    if workspace_id:
        return workspace_id
    return await resolve_workspace_id(user_id)


async def backfill_embeddings(batch_size: int = 100, max_documents: int | None = None) -> dict:
    """Calcule l'embedding des documents qui n'en ont pas.

    L'embedding se calcule à l'ingestion : tout ce qui a été déposé AVANT que
    ``EMBEDDING_API_KEY`` existe n'a pas de vecteur. {@link HybridSearch} les
    garde retrouvables par mots, mais ils restent invisibles à une recherche
    formulée autrement que le document — « contrat de maintenance » ne trouve
    pas un texte qui dit « TMA ». Ce rattrapage se lance une fois, à la main.

    Trois propriétés délibérées :

    - **reprenable.** On ne traite que les lignes à ``embedding IS NULL`` et on
      les met à jour une par une : une interruption au milieu ne laisse aucun
      état à réparer, il suffit de relancer ;
    - **un échec n'arrête pas le lot.** Un document trop long, un caractère que
      le fournisseur refuse, une coupure réseau : la ligne est comptée en échec
      et reste à ``NULL``, donc elle sera retentée au prochain passage. Laisser
      tomber tout le lot pour une ligne coûterait les appels déjà payés ;
    - **borné.** ``max_documents`` permet de mesurer le coût réel sur un petit
      lot avant de lancer le reste — un appel d'embedding par document.

    Rend le compte de ce qui s'est passé, jamais une estimation.
    """
    if not _vectors_enabled():
        return {"skipped": "EMBEDDING_API_KEY absente — rien à calculer", "embedded": 0, "failed": 0}

    sb = get_supabase()
    embedded = 0
    failed = 0
    scanned = 0

    while max_documents is None or scanned < max_documents:
        remaining = batch_size if max_documents is None else min(batch_size, max_documents - scanned)
        if remaining <= 0:
            break

        res = (
            await sb.table("rag_documents")
            .select("id, title, content")
            .is_("embedding", "null")
            .limit(remaining)
            .aexecute()
        )
        rows = res.data or []
        if not rows:
            break

        for row in rows:
            scanned += 1
            embedding = await _maybe_generate_embedding(row.get("title") or "", row.get("content") or "")
            if embedding is None:
                # Déjà journalisé par le helper. La ligne reste à NULL : elle
                # repassera au prochain lancement plutôt que d'être perdue.
                failed += 1
                continue
            try:
                await sb.table("rag_documents").update({"embedding": embedding}).eq("id", row["id"]).aexecute()
                embedded += 1
            except Exception as exc:  # noqa: BLE001 — une ligne ne fait pas tomber le lot
                logger.warning("Backfill: écriture impossible pour %s: %s", row.get("id"), exc)
                failed += 1

        # Un lot plus court que demandé : il ne reste plus rien à traiter.
        if len(rows) < remaining:
            break

    logger.info("Backfill embeddings: %d calculés, %d en échec", embedded, failed)
    return {"embedded": embedded, "failed": failed, "scanned": scanned}


def _refuse_unless_knowledge(title: str, content: str) -> None:
    """La garde d'ingestion, sur le chemin d'écriture lui-même.

    ⚠️ Elle vit ICI et non sur la route ``/rag/ingest``, et c'est tout l'objet du
    correctif : ``scripts/ingest_crm.py`` n'a jamais traversé FastAPI, et une
    garde posée sur la route l'aurait laissé écrire. Retirer la permission sans
    retirer le MOYEN ne retire rien.

    Le refus est PRÉALABLE — avant ``get_supabase()``, avant tout embedding,
    donc aucune requête ne part. C'est ce qui compte pour un magasin vectoriel :
    un document indexé reste retrouvable indéfiniment, il n'y a pas de « défaire »
    après coup.

    ``title`` tient lieu de nom de fichier : c'est là qu'atterrit le nom d'un
    dépôt manuel, exactement comme dans ``IaClient.ragIngest`` côté NestJS.

    Journalisé en ``warning`` et non en ``error`` : un dépôt refusé est le
    fonctionnement NORMAL de la garde, pas une panne du service — le remonter en
    erreur noierait les vraies pannes de Sentry.
    """
    refusal = rag_ingestion_refusal(filename=title, sample=content)
    if refusal is None:
        return
    logger.warning("Ingestion RAG refusée (%s) — %r : %s", refusal.code, title, refusal.message)
    raise RagIngestionRefused(refusal)


async def ingest(
    title: str,
    content: str,
    category: str,
    user_id: str,
    workspace_id: str | None = None,
    origin: str = "distilled",
    scope: str = "workspace",
    conversation_id: str | None = None,
    account_id: str | None = None,
    language: str | None = None,
    units: list[tuple[str, str]] | None = None,
) -> dict:
    """Ingest a document into the RAG store.

    #3750 — la ligne `rag_documents` est écrite TELLE QU'AVANT (compat), puis
    ses MORCEAUX (`rag_chunks.write_document_chunks`) : un par onglet /
    diapositive / section (``units``, lus dans le fichier par
    `extract_document_units` ; absents, relus dans le texte). Un échec
    d'écriture des morceaux ne fait jamais échouer le dépôt — il est
    journalisé, et le rattrapage nocturne reprendra un document long.

    Stamps ``workspace_id`` so the document grounds the whole team's analyses —
    the knowledge base an ESN uploads is a company asset, not a personal one.
    ``user_id`` is kept as created-by attribution.

    Refuses what the ingestion guard refuses (raw contact tables, and the package
    files the manifest classes out of the knowledge base) BEFORE any request
    leaves — see :func:`_refuse_unless_knowledge`.

    #1954.7 — ``scope`` (Louis, 12/09/2026). ``"workspace"`` (défaut) est
    byte-identique au comportement d'avant cette décision. ``"conversation"``
    exige ``conversation_id`` : refusé PRÉALABLEMENT ici, avant toute requête —
    même arbitrage que :func:`_refuse_unless_knowledge` — pour ne jamais
    dépendre uniquement de la contrainte SQL
    ``rag_documents_conversation_scope_requires_id_check`` (qui, elle, protège
    contre un appelant qui contournerait cette fonction).

    #2779 — ``personal``, ``account``, ``knowledge_base``. ``account`` exige un
    ``account_id`` au format d'un identifiant de compte : refusé ICI sinon
    (même arbitrage ; la base le refuse aussi,
    ``rag_documents_account_scope_requires_id_check``). L'appartenance du compte
    à l'espace est vérifiée par NestJS AVANT l'appel (``RagService``)."""
    _refuse_unless_knowledge(title, content)
    resolved_scope = scope if scope in RAG_DOCUMENT_SCOPES else "workspace"
    conv = (conversation_id or "").strip()
    if resolved_scope == "conversation" and not conv:
        raise ValueError("scope='conversation' nécessite conversation_id")
    account = _valid_account_id(account_id) if resolved_scope == "account" else None
    if resolved_scope == "account" and not account:
        raise ValueError("scope='account' nécessite un account_id valide")
    sb = get_supabase()

    doc_data: dict = {
        "user_id": user_id,
        "title": title,
        "content": content,
        "category": category,
        # M6 — un seul magasin, deux origines. Le défaut est `distilled` parce
        # que c'est ce qu'était chaque document jusqu'ici ; l'appelant qui
        # ingère un fichier déposé par un humain passe `uploaded`, et la purge
        # de M3 cesse alors de pouvoir y toucher.
        "origin": origin if origin in ("distilled", "uploaded") else "distilled",
    }
    # `scope` n'est ÉCRIT que pour un document de fil : `workspace` est le défaut
    # de la colonne (migration 1792800004817). Le chemin par défaut garde ainsi
    # l'insertion d'avant au bit près — et ne dépend pas de l'ordre de
    # déploiement : le service IA peut démarrer avant que la migration de l'API
    # (preDeployCommand) ait tourné sans qu'aucun dépôt ordinaire n'échoue.
    if resolved_scope == "conversation":
        doc_data["scope"] = resolved_scope
        doc_data["conversation_id"] = conv
    elif resolved_scope != "workspace":
        # #2779 — toute portée autre que le défaut s'écrit explicitement.
        doc_data["scope"] = resolved_scope
        if account:
            doc_data["account_id"] = account
    resolved_ws = await _effective_workspace(user_id, workspace_id)
    if resolved_ws:
        doc_data["workspace_id"] = resolved_ws

    # #3669.2 — le texte est là et sera indexé : exploitable. Écrit ICI (après
    # le refus des contenus vides) pour qu'aucun document non lu ne le porte.
    doc_data["processing_status"] = "usable"

    # #2861 (#2437.2, niveau SOURCE) — la langue DÉCLARÉE, jamais détectée.
    # Même catalogue que `marketLocaleSchema` (contrat TS, GA-26) ; écrite
    # SEULEMENT quand fournie — un appelant qui l'ignore obtient le même
    # comportement qu'avant cette colonne (NULL, contrainte
    # `rag_documents_language_check`, migration 1796322770000).
    if language and language in ("fr", "en", "de"):
        doc_data["language"] = language

    # #2431.7 (reste) — dédoublonnage CONTRE la base existante, pas seulement
    # dans l'archive déposée (celui-ci vit côté client, `rag-zip-ingest.service.ts`,
    # système différent). L'empreinte est calculée sur le CONTENU EXTRAIT — deux
    # dépôts du même texte sous des noms de fichier différents restent le même
    # document — et la recherche est scopée à l'espace (GA-43 : deux ESN sont
    # des concurrentes, un contenu identique dans deux espaces n'est jamais un
    # doublon). Faite AVANT l'insertion : c'est elle qui décide s'il y en a une.
    content_hash = sha256_of(content.encode("utf-8"))
    doc_data["content_hash"] = content_hash
    try:
        lookup = sb.table("rag_documents").select("id")
        # `_scope` (pas `_scope_workspace`) : un doublon reste un doublon quelle
        # que soit sa PORTÉE (`workspace`/`personal`/`account`/…) — c'est la
        # même distinction qu'entre lecture générale et lecture par identifiant
        # documentée sur `_scope_retrieval` ci-dessus.
        lookup = _scope(lookup, user_id, resolved_ws)
        found = await lookup.eq("content_hash", content_hash).limit(1).aexecute()
        existing_id = (found.data or [{}])[0].get("id") if found.data else None
    except Exception as exc:  # noqa: BLE001 — recherche échouée → on ingère (fail open, comme `upsert`)
        logger.warning("Recherche de doublon RAG échouée (insertion normale) : %s", exc)
        existing_id = None

    if existing_id:
        logger.info(
            "RAG doublon détecté (%s, category=%s, user=%s, workspace=%s) — document existant réutilisé",
            title,
            category,
            user_id,
            resolved_ws or "-",
        )
        return {"id": existing_id, "title": title, "category": category, "duplicate": True}

    embedding = await _maybe_generate_embedding(title, content)
    if embedding is not None:
        doc_data["embedding"] = embedding

    result = await sb.table("rag_documents").insert(doc_data).aexecute()

    doc = result.data[0] if result.data else {}
    logger.info(
        "RAG ingested: %s (category=%s, user=%s, workspace=%s)",
        title,
        category,
        user_id,
        resolved_ws or "-",
    )
    # #3750 — les morceaux citables. Pas pour une pièce de FIL (`conversation`) :
    # elle est lue EN ENTIER par `fetch_documents_by_ids`, jamais cherchée.
    if doc.get("id") and resolved_scope != "conversation":
        from app.services import rag_chunks

        try:
            await rag_chunks.write_document_chunks(
                str(doc["id"]),
                title,
                content,
                user_id=user_id,
                workspace_id=resolved_ws,
                units=units,
                document_embedding=embedding,
                sb=sb,
            )
        except Exception as exc:  # noqa: BLE001 — le document est déjà là, ses morceaux suivront
            logger.warning("RAG morceaux non écrits pour %s (%r) : %s", doc.get("id"), title, exc)
    return {"id": doc.get("id"), "title": title, "category": category, "duplicate": False}


async def upsert(title: str, content: str, category: str, user_id: str, workspace_id: str | None = None) -> dict:
    """Idempotent write keyed on ``(workspace_id, title, category)`` — falling back
    to ``(user_id, title, category)`` when no workspace resolves: refresh the
    existing row's content (+ embedding when vectors are on) or insert a new one.

    Used by the RAG-knowledge flywheel so re-analysing the same account REFRESHES
    its distilled docs instead of piling up duplicates. Keying on the WORKSPACE is
    what makes the flywheel a team asset: two members analysing the same account
    refresh one shared doc rather than accumulating a near-identical copy each.
    Respects the FT/vector mode via the shared embedding helper. Returns
    ``{id, title, category, updated}``.

    Gardé comme :func:`ingest` : le flywheel distille de la PROSE (une fiche
    compte, un angle, une stratégie — voir ``rag_knowledge._distill_docs``), donc
    il passe ; ce qui a la forme d'un carnet d'adresses est refusé ici aussi,
    sinon il resterait un second chemin d'écriture non gardé.
    """
    _refuse_unless_knowledge(title, content)
    sb = get_supabase()
    resolved_ws = await _effective_workspace(user_id, workspace_id)

    existing_id = None
    try:
        lookup = sb.table("rag_documents").select("id")
        # Scope the dedup lookup the same way retrieval is scoped, so we never
        # update a row the caller wouldn't be allowed to read. #1954.7 —
        # `_scope_workspace` : le flywheel distille des documents `workspace`
        # uniquement, jamais un document joint au chat portant le même
        # (titre, catégorie) par coïncidence.
        lookup = _scope_workspace(lookup, user_id, resolved_ws)
        found = await lookup.eq("title", title).eq("category", category).limit(1).aexecute()
        rows = found.data or []
        existing_id = rows[0]["id"] if rows else None
    except Exception as exc:  # noqa: BLE001 — lookup failure → fall back to a fresh insert
        logger.warning("RAG upsert lookup failed (inserting fresh): %s", exc)

    embedding = await _maybe_generate_embedding(title, content)
    payload: dict = {"user_id": user_id, "title": title, "content": content, "category": category}
    if resolved_ws:
        payload["workspace_id"] = resolved_ws
    if embedding is not None:
        payload["embedding"] = embedding

    if existing_id:
        # Never rewrite created-by attribution or move a row between workspaces on
        # a content refresh — only the content (and its embedding) changes.
        update_payload = {k: v for k, v in payload.items() if k not in ("user_id", "workspace_id")}
        result = await sb.table("rag_documents").update(update_payload).eq("id", existing_id).aexecute()
        doc = (result.data or [{}])[0]
        logger.info(
            "RAG upserted (update): %s (category=%s, user=%s, workspace=%s)",
            title,
            category,
            user_id,
            resolved_ws or "-",
        )
        return {"id": doc.get("id", existing_id), "title": title, "category": category, "updated": True}

    result = await sb.table("rag_documents").insert(payload).aexecute()
    doc = result.data[0] if result.data else {}
    logger.info(
        "RAG upserted (insert): %s (category=%s, user=%s, workspace=%s)",
        title,
        category,
        user_id,
        resolved_ws or "-",
    )
    return {"id": doc.get("id"), "title": title, "category": category, "updated": False}


async def _merge_chunk_hits(
    query_text: str,
    user_id: str,
    top_k: int,
    workspace_id: str | None,
    account_id: str | None,
    legacy: list[dict],
) -> list[dict]:
    """#3750 — les MORCEAUX d'abord (regroupés par document parent), puis les
    documents de l'ancien chemin qui n'ont rendu aucun morceau.

    Un document pas encore découpé (avant le rattrapage) n'a aucun morceau : il
    n'arrive que par ``legacy``, rendu tel quel. Si la recherche par morceau
    échoue (migration pas encore passée, RPC absente) ou ne trouve rien, la
    réponse est ``legacy`` à l'identique — l'ancien chemin, byte pour byte.
    """
    from app.services import rag_chunks

    try:
        hits = await rag_chunks.search_chunks(
            query_text,
            user_id,
            max(top_k, context_max_chunks()),
            workspace_id,
            account_id=account_id,
            sb=get_supabase(),
        )
    except Exception as exc:  # noqa: BLE001 — l'ancien chemin reste la réponse
        logger.warning("RAG morceaux indisponibles, documents entiers seuls : %s", exc)
        return legacy
    if not hits:
        return legacy
    chunked = {str(h.get("id")) for h in hits}
    rest = [d for d in legacy if isinstance(d, dict) and str(d.get("id")) not in chunked]
    return hits + rest[:top_k]


async def query(
    query_text: str,
    user_id: str,
    top_k: int = 5,
    workspace_id: str | None = None,
    account_id: str | None = None,
) -> list[dict]:
    """Query RAG documents using the configured search backend, scoped to the
    caller's workspace (see ``_scope``) and, #2779, to what the caller may read
    (``_visibility_filter`` — ``account_id`` is the account the request is about)."""
    backend = _get_search_backend()
    legacy = await backend.query(query_text, user_id, top_k, workspace_id, account_id=account_id)
    results = await _merge_chunk_hits(query_text, user_id, top_k, workspace_id, account_id, legacy)
    # La fraîcheur entre ici, une seule fois, sur le chemin que TOUS les
    # appelants empruntent — sinon chaque consommateur devrait y penser, et
    # celui qui l'oublierait rendrait un classement différent des autres.
    apply_score_decay(results)
    logger.info(
        "RAG query '%s': %d results (backend=%s, workspace=%s)",
        query_text[:50],
        len(results),
        type(backend).__name__,
        workspace_id or "-",
    )
    return results


# ─── M1 — la fraîcheur DANS le score de récupération (tome 7 §38) ───────────
#
# Le repère est celui du contrat partagé (`packages/contracts/src/schemas/rag.ts`)
# et il est recopié ici pour une raison de déploiement : la racine Railway du
# service IA est `apps/ia`, donc `packages/` n'est pas dans son contexte de
# build. Un test de parité verrouille les deux valeurs.
RAG_DECAY_HORIZON_DAYS = 730
RAG_MAX_DECAY = 0.5


def decayed_score(similarity: float, age_days: float | None) -> float:
    """Le score d'un document, pondéré par son âge.

    `score = similarité × (1 − min(0,5 ; âge/730))`. Un document de deux ans
    vaut la moitié d'un document d'aujourd'hui à pertinence égale, et **il ne
    disparaît pas** : c'est la différence entre pondérer et filtrer. Un angle
    gagnant de 2024 reste trouvable, il cesse de passer devant celui d'hier.

    Une date absente ou illisible **ne pénalise pas** — l'absence de date n'est
    pas une preuve d'ancienneté.
    """
    if age_days is None:
        return similarity
    try:
        age = float(age_days)
    except (TypeError, ValueError):
        return similarity
    if age != age or age < 0:  # NaN ou date future
        return similarity
    decay = min(RAG_MAX_DECAY, age / RAG_DECAY_HORIZON_DAYS)
    return similarity * (1 - decay)


def decayed_score_of(relevance: float, created_at: Any) -> float:
    """La formule du §38 appliquée à une DATE brute, et non à un âge déjà calculé.

    C'est la porte unique pour tout étage qui a produit un nombre de pertinence
    et tient un document en main : la récupération vectorielle
    ({@link apply_score_decay}) comme le reclassement déterministe du chemin
    sans clé. Deux étages qui recalculeraient l'âge chacun de leur côté
    finiraient par ne plus dire la même chose du même document.

    Une date absente ou illisible ne pénalise pas — c'est {@link decayed_score}
    qui le garantit, et il n'y a qu'un endroit où cette règle est écrite.
    """
    return decayed_score(relevance, _age_days(created_at))


def _age_days(created_at: Any) -> float | None:
    """L'âge d'un document en jours, ou `None` si sa date est illisible."""
    if not created_at:
        return None
    raw = str(created_at).replace("Z", "+00:00")
    try:
        then = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if then.tzinfo is None:
        then = then.replace(tzinfo=UTC)
    return max(0.0, (datetime.now(UTC) - then).total_seconds() / 86400)


def apply_score_decay(docs: list[dict]) -> list[dict]:
    """Repondère `similarity` par la fraîcheur, sur place et sans réordonner.

    C'est le manque n°1 de l'audit, et il portait sur la RÉCUPÉRATION : le
    reclassement pondérait déjà la date sur son chemin gratuit, mais le score
    rendu par la recherche, lui, ignorait l'âge. Tout ce qui trie sur
    `similarity` en aval — l'injection de contexte, le reclassement — héritait
    donc d'un classement où un document de 2024 valait celui d'hier.

    Un document sans `similarity` (le plein texte n'en produit pas) est laissé
    intact : lui en inventer une le ferait passer devant des documents que le
    vecteur a réellement notés.
    """
    for doc in docs or []:
        if not isinstance(doc, dict):
            continue
        raw = doc.get("similarity")
        if raw is None:
            continue
        try:
            similarity = float(raw)
        except (TypeError, ValueError):
            continue
        doc["similarity"] = decayed_score_of(similarity, doc.get("created_at"))
    return docs


# ─── M2 — la trace d'usage (tome 7 §38) ─────────────────────────────────────
#
# « On ne sait pas quels documents servent réellement. » Sans cette trace, la
# purge de M3 ne peut pas exister — elle ne saurait pas ce qu'elle a le droit
# d'effacer — et personne ne peut dire si le magasin apporte quelque chose.
#
# La distinction qui porte tout : on compte un usage quand un document est
# **effectivement injecté dans une réponse**, jamais quand il est simplement
# remonté par une recherche. Compter les recherches ferait grimper le compteur
# de tous les documents d'un espace actif, et la purge n'effacerait plus rien.


# ─── M3 — la purge (tome 7 §38) ─────────────────────────────────────────────
#
# « Le magasin ne fait que croître. » La purge est le geste le plus dangereux du
# chapitre : elle détruit, et une connaissance distillée d'une analyse de l'an
# dernier ne se régénère qu'en relançant — et en repayant — cette analyse.
#
# Quatre refus la rendent tenable, et ils sont dans le contrat partagé
# (`ragPurgeable`) parce qu'ils doivent être lisibles par un humain : un
# document de la base de connaissance DURABLE (#2779) ne part jamais, un
# document DÉJÀ UTILISÉ ne part jamais, un document DÉPOSÉ par un humain ne part
# jamais, et un document sans âge lisible ne part pas.
RAG_PURGE_AFTER_MONTHS = 12


async def purge_unused_documents(dry_run: bool = False) -> dict:
    """Efface les documents distillés que personne n'a jamais utilisés en un an.

    Rend TOUJOURS son compte-rendu, y compris quand il n'y a rien à faire — un
    silence ne doit pas se lire comme une panne du balayage.

    `dry_run` existe pour l'opérateur : avant d'ouvrir la purge sur une base
    réelle, on veut voir ce qu'elle EMPORTERAIT.
    """
    cutoff = datetime.now(UTC) - timedelta(days=RAG_PURGE_AFTER_MONTHS * 30)
    sb = get_supabase()
    result = await (
        sb.table("rag_documents")
        .select("id, used_count, origin, created_at, scope")
        .eq("used_count", 0)
        .eq("origin", "distilled")
        .neq("scope", "knowledge_base")
        .lt("created_at", cutoff.isoformat())
        .limit(1000)
        .aexecute()
    )
    rows = [r for r in (result.data or []) if isinstance(r, dict)]

    # La décision est REPRISE ici sur chaque ligne, alors que la requête a déjà
    # filtré : le filtre SQL est une optimisation, la règle est la fonction. Si
    # les deux divergent un jour, c'est la règle qui gagne — et c'est ainsi
    # qu'on évite qu'un `eq()` mal écrit efface ce que la règle protège.
    purgeable = [
        str(r.get("id"))
        for r in rows
        if int(r.get("used_count") or 0) == 0
        and str(r.get("origin") or "distilled") == "distilled"
        # #2779 — la base de connaissance DURABLE a SA règle : jamais purgée.
        and str(r.get("scope") or "workspace") != "knowledge_base"
        and (_age_days(r.get("created_at")) or 0) >= RAG_PURGE_AFTER_MONTHS * 30
    ]

    if not purgeable:
        logger.info("RAG purge : aucun document à effacer (%d candidats examinés)", len(rows))
        return {"examined": len(rows), "purged": 0, "dry_run": dry_run, "ids": []}

    if dry_run:
        logger.info("RAG purge (simulation) : %d document(s) seraient effacés", len(purgeable))
        return {"examined": len(rows), "purged": 0, "dry_run": True, "ids": purgeable}

    await sb.table("rag_documents").delete().in_("id", purgeable).aexecute()
    # Journalisée, comme le demande le §41 : effacer sans trace rendrait
    # impossible de comprendre, six mois plus tard, pourquoi un document
    # qu'on cherche n'existe plus.
    logger.info(
        "RAG purge : %d document(s) distillés jamais utilisés depuis %d mois, effacés",
        len(purgeable),
        RAG_PURGE_AFTER_MONTHS,
    )
    return {"examined": len(rows), "purged": len(purgeable), "dry_run": False, "ids": purgeable}


async def mark_documents_used(doc_ids: list[str], feature: str) -> None:
    """Enregistre qu'on s'est SERVI de ces documents, best-effort.

    `feature` nomme la fonctionnalité (« analysis », « chat »…) et non la
    requête : la question à laquelle cette colonne doit répondre est « le
    magasin sert-il au copilote ou seulement à l'analyse ? », pas « quelle
    requête, à 14 h 02 ».

    Une écriture en échec ne remonte JAMAIS : une métrique ne retarde,
    n'empêche ni ne casse ce qu'elle observe. Le pire cas est un compteur qui
    sous-estime, ce qui rend la purge plus prudente, jamais plus destructrice.
    """
    ids = [str(i) for i in (doc_ids or []) if i]
    if not ids:
        return
    try:
        sb = get_supabase()
        await sb.rpc(
            "mark_rag_documents_used",
            {"doc_ids": ids, "feature": (feature or "unknown")[:40]},
        ).aexecute()
    except Exception as exc:  # noqa: BLE001 — une métrique n'interrompt rien
        logger.debug("RAG usage tracking skipped (%s docs): %s", len(ids), exc)


# ─── #3750.3 — LE budget du bloc de connaissance, à UN seul endroit (GA-26) ───
#
# Six (dix depuis #4016 L7) morceaux de 1 200 caractères au plus. Avant le découpage, le bloc portait
# 400 caractères de quelques documents entiers, 2 000 au total : l'onglet
# « 07 · Objections » d'un classeur n'y entrait jamais. Un morceau est une
# unité citable (un onglet, une diapositive), 1 200 caractères en gardent
# l'essentiel. Le NOMBRE est réglable (`RAG_KNOWLEDGE_TOP_K`, le réglage
# existant du nombre de documents injectés — il compte désormais des
# morceaux) ; la longueur ne l'est pas.
#
# #4016 L7 — décision Louis 11/10/2026 : RAG élargi, 6 → 10 morceaux. Le bloc
# passe d'environ 8 000 à 13 600 caractères (≈ 3 400 jetons d'entrée) — sans
# effet mesurable sur le budget du tour (`CHAT_TURN_BUDGET_S` 90 s). Il reste
# sous le bassin du rerank (`RAG_KNOWLEDGE_CANDIDATES`, 12).
RAG_CONTEXT_MAX_CHUNKS = 10
RAG_CONTEXT_CHUNK_CHARS = 1200
# La place d'une ligne autour de son extrait : « - Titre — unité : ».
_CONTEXT_LINE_OVERHEAD = 160


def context_max_chunks() -> int:
    """Le nombre de morceaux injectés — `RAG_KNOWLEDGE_TOP_K` s'il est posé."""
    raw = os.environ.get("RAG_KNOWLEDGE_TOP_K", "").strip()
    try:
        return max(1, int(raw)) if raw else RAG_CONTEXT_MAX_CHUNKS
    except ValueError:
        return RAG_CONTEXT_MAX_CHUNKS


def format_knowledge_context(docs: list[dict], max_chars: int | None = None, snippet_chars: int | None = None) -> str:
    """Compact prompt-injection block from retrieved RAG docs (title + extract).
    Sorts by vector similarity (strongest first, when the backend provides it) and
    drops near-duplicate docs so the budget isn't wasted. ``""`` when nothing to
    inject — the caller grows the prompt only on real knowledge."""
    block, _used = format_knowledge_context_with_sources(docs, max_chars, snippet_chars)
    return block


def format_knowledge_context_with_sources(
    docs: list[dict], max_chars: int | None = None, snippet_chars: int | None = None
) -> tuple[str, list[dict]]:
    """Le bloc d'injection ET les documents qui le composent RÉELLEMENT.

    La distinction porte les deux manques M2 et M5 : un document remonté par la
    recherche n'est pas un document utilisé. Ici, sont « utilisés » ceux qui ont
    produit une ligne — un document vide, un doublon proche, ou tout ce qui
    tombe au-delà du budget de caractères n'a servi à rien et ne doit ni
    incrémenter un compteur, ni s'afficher comme une source.

    Le budget est appliqué **avant** de retenir la source, et non après par une
    troncature de la chaîne : couper le texte à la fin laisserait dans la liste
    des sources un document dont pas un mot n'a atteint le prompt.
    """
    ordered = sorted(
        (d for d in (docs or []) if isinstance(d, dict)),
        key=lambda d: float(d.get("similarity") or 0),
        reverse=True,
    )
    # #3750.3 — par défaut, LE budget du module (6 × 1 200) ; un appelant qui
    # formate un AUTRE corpus (méthode, `method_knowledge.py`) passe le sien.
    max_items = context_max_chunks() if snippet_chars is None and max_chars is None else None
    snippet_chars = RAG_CONTEXT_CHUNK_CHARS if snippet_chars is None else snippet_chars
    if max_chars is None:
        max_chars = context_max_chunks() * (RAG_CONTEXT_CHUNK_CHARS + _CONTEXT_LINE_OVERHEAD)
    lines: list[str] = []
    used: list[dict] = []
    used_ids: set[str] = set()
    seen: set[str] = set()
    budget = max_chars
    for d in ordered:
        if max_items is not None and len(lines) >= max_items:
            break
        title = str(d.get("title") or "").strip()
        content = " ".join(str(d.get("content") or "").split())
        if not content:
            continue
        dedup_key = f"{title.lower()}|{content[:120].lower()}"
        if dedup_key in seen:
            continue
        snippet = content[:snippet_chars]
        # #3750.2 — la citation nomme le document ET son unité : « Brand
        # Messaging — 07 · Objections ». Sans unité, la ligne d'avant.
        unit = str(d.get("unit_label") or "").strip()
        cited = f"{title} — {unit}" if title and unit else title or unit
        line = f"- {cited} : {snippet}" if cited else f"- {snippet}"
        cost = len(line) + (1 if lines else 0)
        if cost > budget:
            break
        seen.add(dedup_key)
        budget -= cost
        lines.append(line)
        # Deux morceaux d'un même document : UNE source, UN usage compté.
        if d.get("id") and str(d.get("id")) not in used_ids:
            used_ids.add(str(d.get("id")))
            used.append(
                {
                    "docId": str(d.get("id")),
                    "title": title,
                    "category": str(d.get("category") or ""),
                    "origin": str(d.get("origin") or "distilled"),
                }
            )
    # #1956 — le bloc part dans le prompt du copilote, donc il est ENCADRÉ.
    # Ce qu'il porte a été écrit par quelqu'un d'autre (un document déposé, une
    # page collée dans une fiche) : le prompt DISAIT que c'étaient des données,
    # rien ne l'en empêchait structurellement. `sources_block()` encadre les
    # sources de la phase 1 depuis le début — c'est le même mécanisme, appliqué
    # ici. `fence()` neutralise au passage une balise fermante glissée dans le
    # texte, donc le contenu ne peut pas sortir de son enveloppe.
    # Le cas vide reste `""` : une balise autour de rien annoncerait au modèle
    # un bloc que le prompt ne porte pas.
    block = "\n".join(lines)
    return (fence("rag_knowledge", block) if block else ""), used


# Un document JOINT à la conversation n'est pas un document « retrouvé ».
#
# La récupération RAG ordinaire cite un EXTRAIT (400 caractères) de plusieurs
# documents : c'est ce qu'il faut pour rappeler une référence ou une règle. Ça
# ne convient pas à un fichier que l'utilisateur vient de déposer en disant
# « lis ça » — un CV coupé à 400 caractères s'arrête au nom et à la première
# ligne, et le copilote répond à côté sans pouvoir dire pourquoi.
#
# Le budget est donc bien plus large, et volontairement borné : au-delà, on
# remplit la fenêtre du modèle avec un seul fichier et le reste du contexte
# (compte, contacts, plan) se fait évincer.
ATTACHED_DOC_CHARS = 8000
ATTACHED_DOC_MAX = 3


async def fetch_documents_by_ids(
    document_ids: list[str],
    user_id: str,
    workspace_id: str | None = None,
    conversation_id: str | None = None,
    account_id: str | None = None,
) -> list[dict]:
    """Les documents que l'utilisateur a JOINTS à la conversation, en entier.

    #2779 — la requête par identifiants applique la MÊME visibilité que la
    récupération (``_scope_retrieval``) : un document ``account`` du compte X
    n'est jamais lu dans un fil sur le compte Y, le ``personal`` d'un collègue
    jamais, même en connaissant son identifiant.

    Scopé exactement comme la récupération (``_scope``) : un identifiant fourni
    par le client ne doit pas pouvoir lire le document de quelqu'un d'autre.
    Dégradable comme le reste du RAG — ``[]`` sur erreur, jamais d'exception qui
    ferait tomber la conversation.

    #1954.7 — la portée ``conversation`` (Louis, 12/09/2026). DEUX requêtes,
    plutôt qu'un ``OR`` imbriqué fragile (le filtre reste dans chaque requête,
    jamais un tri après coup en Python) :

    1. les documents ``scope = 'workspace'`` — visibles dans TOUT le fil,
       comme avant cette décision ;
    2. SEULEMENT si ``conversation_id`` est fourni, les documents
       ``scope = 'conversation'`` du MÊME fil (``conversation_id`` exact) ET du
       MÊME auteur (``user_id``), eux-mêmes bornés au tenant (``_scope``) —
       jamais un autre espace, jamais un collègue.

    Sans ``conversation_id`` (la route MCP, un client ancien, ou un fil RANGÉ :
    NestJS ne le transmet pas — ``ChatThreadDocumentsService.readableThread``),
    aucune requête sur les documents de fil n'a lieu : fail closed, jamais un
    document ``conversation`` ne peut matcher par accident. Un identifiant d'un
    AUTRE fil ne matche jamais (chaque requête filtre sur SON
    ``conversation_id``), et comme les identifiants de fil sont déterministes
    (``general``, ``account-<uuid>``) — donc partagés entre collègues d'un même
    compte — chaque requête filtre AUSSI sur l'auteur.

    #1954 — « un document sert à LA CONVERSATION » : les questions SUIVANTES
    du fil le relisent. Le navigateur ne renvoie pas ses identifiants à chaque
    message — le filtre par fil suffit (troisième requête, bornée au tenant,
    à ``scope = 'conversation'``, à ce ``conversation_id`` et à l'auteur). Les
    identifiants restent le chemin du message qu'ils accompagnent : c'est le
    seul par lequel un document de la base (``workspace``) est lu EN ENTIER.
    Budget inchangé, ``ATTACHED_DOC_MAX`` : ce qui est joint MAINTENANT passe
    devant, puis les documents les plus récents du fil.
    """
    ids = [str(i).strip() for i in (document_ids or []) if str(i).strip()][:ATTACHED_DOC_MAX]
    conv = (conversation_id or "").strip()
    if not user_id or (not ids and not conv):
        return []
    try:
        sb = get_supabase()
        resolved_ws = await _effective_workspace(user_id, workspace_id)
        cols = "id, title, content, category"

        rows: list[dict] = []
        if ids:
            workspace_query = _scope_retrieval(
                sb.table("rag_documents").select(cols), user_id, resolved_ws, account_id, exclude_archived=False
            )
            found = await workspace_query.in_("id", ids).aexecute()
            rows.extend(r for r in (found.data or []) if isinstance(r, dict))

        thread_rows: list[dict] = []
        if conv:
            matched_ids = {str(r.get("id")) for r in rows}
            remaining = [i for i in ids if i not in matched_ids]
            if remaining:
                conv_query = (
                    _scope(sb.table("rag_documents").select(cols), user_id, resolved_ws)
                    .eq("scope", "conversation")
                    .eq("conversation_id", conv)
                    # Les identifiants de fil sont DÉTERMINISTES (`general`,
                    # `account-<uuid>`) : deux collègues du même espace ont le
                    # « même » fil sur un compte. Le document joint appartient
                    # au fil de son AUTEUR — jamais à celui d'un collègue qui
                    # enverrait son identifiant.
                    .eq("user_id", user_id)
                    .in_("id", remaining)
                )
                conv_found = await conv_query.aexecute()
                rows.extend(r for r in (conv_found.data or []) if isinstance(r, dict))
            # #1954 — les documents du FIL, pour cette question comme pour les suivantes.
            thread_query = (
                _scope(sb.table("rag_documents").select(cols), user_id, resolved_ws)
                .eq("scope", "conversation")
                .eq("conversation_id", conv)
                # Même borne que la requête par identifiants juste au-dessus : la
                # clé de fil est partagée entre collègues, la pièce jointe non.
                .eq("user_id", user_id)
                .order("created_at", ascending=False)
                .limit(ATTACHED_DOC_MAX)
            )
            thread_found = await thread_query.aexecute()
            thread_rows = [r for r in (thread_found.data or []) if isinstance(r, dict)]

        # L'ordre demandé est celui de l'utilisateur : il a joint le CV d'abord.
        by_id = {str(r.get("id")): r for r in rows}
        requested = [by_id[i] for i in ids if i in by_id]
        seen = {str(r.get("id")) for r in requested}
        from_thread = [r for r in thread_rows if str(r.get("id")) not in seen]
        return (requested + from_thread)[:ATTACHED_DOC_MAX]
    except Exception as exc:  # noqa: BLE001 — dégradable, comme toute lecture RAG
        logger.warning("Lecture des documents joints impossible: %s", exc)
        record_degradation(get_correlation_id(), source="rag_documents", reason=str(exc))
        return []


def ephemeral_attached_documents(files: list) -> list[dict]:
    """#2148.16 — la pièce jointe de CONVERSATION (cas a) en dicts « document »,
    la même forme que ceux rendus par ``fetch_documents_by_ids`` — pour que
    ``format_attached_documents``/``build_context_transparency`` les lisent
    sans distinguer une pièce durable d'une pièce éphémère.

    ``id`` reste ``None`` : rien n'a été écrit, il n'y a rien à identifier.
    Bornée aux MÊMES ``ATTACHED_DOC_MAX``/``ATTACHED_DOC_CHARS`` que le reste —
    la troncature et le plafond de nombre vivent déjà dans
    ``format_attached_documents``, pas dupliqués ici.
    """
    return [
        {"id": None, "title": (f.name or "Document").strip() or "Document", "content": f.text or ""}
        for f in (files or [])[:ATTACHED_DOC_MAX]
    ]


def format_attached_documents(docs: list[dict]) -> str:
    """Bloc de prompt des documents joints. ``""`` quand il n'y en a aucun —
    le prompt reste alors byte-identique à ce qu'il était."""
    parts: list[str] = []
    for doc in (docs or [])[:ATTACHED_DOC_MAX]:
        if not isinstance(doc, dict):
            continue
        content = " ".join(str(doc.get("content") or "").split())
        if not content:
            continue
        title = str(doc.get("title") or "Document").strip() or "Document"
        text = content[:ATTACHED_DOC_CHARS]
        # Une troncature muette se lit comme un document complet : le modèle
        # conclurait sur une fin de CV qu'il n'a jamais vue.
        if len(content) > ATTACHED_DOC_CHARS:
            text += " […] (document tronqué)"
        parts.append(f"### {title}\n{text}")
    # #1956 — même encadrement que la base de connaissance plus haut, et pour
    # une raison plus forte : un fichier déposé est le texte le plus directement
    # adverse du produit, le commercial le reçoit d'un tiers et ne l'a pas relu.
    # Corriger un seul des deux blocs aurait reproduit le trou juste à côté.
    # Le cas vide reste `""` — le prompt d'alors est byte-identique.
    block = "\n\n".join(parts)
    return fence("attached_documents", block) if block else ""


def backend_status() -> dict:
    """Live RAG configuration for the operator dashboard (« tout config du rag »).
    Pure env read — no network. Names the active backend + every tunable so the
    manager sees exactly how retrieval behaves without grepping the code."""
    use_vectors = _vectors_enabled()
    return {
        "backend": "HybridSearch" if use_vectors else "TextSearchFallback",
        "mode": (
            "vecteur cosine (RPC match_rag_documents) + repli plein texte"
            if use_vectors
            else "full-text search (websearch_to_tsquery, FR)"
        ),
        "use_vectors": use_vectors,
        "match_threshold": float(os.environ.get("RAG_MATCH_THRESHOLD", "0.5")),
        "embedding_model": os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small"),
        "embed_content_chars": int(os.environ.get("RAG_EMBED_CONTENT_CHARS", "2000")),
        "embedding_key_set": bool(os.environ.get("EMBEDDING_API_KEY")),
    }


async def list_documents(limit: int = 50) -> list[dict]:
    """Operator view of the RAG store — « voir ce qu'il y a dedans ». Returns each
    doc's title/category/user + a bounded content preview (never the full body)."""
    sb = get_supabase()
    res = (
        await sb.table("rag_documents")
        .select("id, title, category, content, user_id, created_at")
        .limit(max(1, min(limit, 200)))
        .aexecute()
    )
    out: list[dict] = []
    for d in res.data or []:
        content = str(d.get("content") or "")
        out.append(
            {
                "id": d.get("id"),
                "title": d.get("title"),
                "category": d.get("category"),
                "user_id": d.get("user_id"),
                "created_at": d.get("created_at"),
                "content_chars": len(content),
                "content_preview": (content[:280] + "…") if len(content) > 280 else content,
            }
        )
    return out


#: #4072.1 — borne de lecture des documents-organigrammes (le tri fin est fait par
#: `document_org_people.extract_org_people`, qui ne garde que ceux qui s'en disent).
ORG_CHART_DOCS_MAX = 40


async def fetch_org_chart_documents(
    user_id: str, workspace_id: str | None = None, account_id: str | None = None
) -> list[dict]:
    """#4072.1 — les documents de l'espace dont le TITRE se dit organigramme.

    Même portée que la récupération générale (`_scope_retrieval` : l'équipe, les
    documents `account` de CE compte, les `personal` de leur auteur seulement,
    jamais `conversation`, jamais les archivés). Lecture seule, bornée. Une
    panne REMONTE : « aucun organigramme » ne doit pas masquer une base muette.
    """
    sb = get_supabase()
    query = sb.table("rag_documents").select("id, title, content, created_at")
    query = _scope_retrieval(query, user_id, workspace_id, account_id)
    res = await (
        query.or_("title.ilike.%organigramme%,title.ilike.%org chart%,title.ilike.%organization chart%")
        .order("created_at", ascending=False)
        .limit(ORG_CHART_DOCS_MAX)
        .aexecute()
    )
    return list(res.data or [])


async def count_documents() -> int:
    """Total docs in the RAG store (bounded scan — operator metric, not exact past 1000)."""
    sb = get_supabase()
    res = await sb.table("rag_documents").select("id").limit(1000).aexecute()
    return len(res.data or [])


async def retrieve_knowledge_docs(
    query_text: str,
    user_id: str,
    top_k: int = 5,
    workspace_id: str | None = None,
    account_id: str | None = None,
) -> list[dict]:
    """Retrieve the WORKSPACE's relevant RAG docs (raw), degradably. Returns ``[]``
    when there's nothing to look up or the backend errors — RAG must never break the
    caller. Exposed on top of ``retrieve_knowledge_context`` so a caller that needs
    the doc TITLES (chat transparency: « sources utilisées ») can get them without a
    second query."""
    if not user_id or not query_text.strip():
        return []
    try:
        return await query(query_text, user_id, top_k, workspace_id, account_id=account_id)
    except Exception as exc:  # degradable — RAG must never break chat/analysis
        logger.warning("RAG retrieval skipped: %s", exc)
        # The team's OWN uploaded documents vanishing from the plan is the least
        # defensible silent degradation of the lot: the output just gets generic.
        record_degradation(get_correlation_id(), source="rag_documents", reason=str(exc))
        return []


async def retrieve_knowledge_context(
    query_text: str,
    user_id: str,
    top_k: int = 5,
    workspace_id: str | None = None,
    account_id: str | None = None,
) -> str:
    """Retrieve + format the workspace's relevant RAG docs for prompt grounding.
    Degradable — any backend error yields ``""`` (never breaks the caller)."""
    docs = await retrieve_knowledge_docs(query_text, user_id, top_k, workspace_id, account_id=account_id)
    return format_knowledge_context(docs)
