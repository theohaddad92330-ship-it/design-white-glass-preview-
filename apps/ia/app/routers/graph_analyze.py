"""Graph orchestration endpoint (v2) — runs the analysis StateGraph and streams
typed progress events as Server-Sent Events.

This is the single entrypoint that replaces the worker's four sequential phase
calls: the NestJS worker POSTs here once, consumes the SSE stream, and persists
each phase's output (carried in ``phase_completed`` events under ``data.output``)
as it arrives — NestJS stays the DB owner, the graph stays the engine. Resume a
failed run by POSTing with ``resume=true`` on the same ``account_id`` (thread).

The graph uses the configured checkpointer (Postgres when LANGGRAPH_PG_URL/
DATABASE_URL is set), so a resumed run skips the phases that already landed.
"""

from __future__ import annotations

from typing import Any, Literal

import asyncio
import contextlib
import os
import uuid
from collections.abc import AsyncIterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services.context_mode import profile_for_context_mode
from app.graph.builder import analysis_graph_session, stream_analysis_graph
from app.models.analysis_context import AnalysisContext

router = APIRouter(prefix="/graph", tags=["Graph orchestration (v2)"])

# A slow phase (Firecrawl scrape, a long Claude call) can go minutes without
# yielding a graph event. Some proxies (Railway) idle-close a silent stream, so
# the NestJS worker sees EOF with no terminal event → "Analysis stream ended
# without a terminal event (truncated SSE)" and the whole run fails. Emit an SSE
# comment (no ``data:`` line → the worker's parser skips it) at this cadence so
# the connection never idles out. Kept well under typical 30–60s proxy timeouts.
# Default (seconds); override at runtime with SSE_KEEPALIVE_SECONDS.
_KEEPALIVE_SECONDS = 15.0


def _keepalive_seconds() -> float:
    """Keepalive cadence in seconds.

    Env-tunable via ``SSE_KEEPALIVE_SECONDS`` so an operator can drop it below the
    edge proxy's idle timeout (Railway / nginx ``proxy_read_timeout``) without a
    code change. An unset, non-numeric or non-positive value falls back to the
    module default, so a misconfiguration can never disable the keepalive.
    """
    raw = os.environ.get("SSE_KEEPALIVE_SECONDS", "").strip()
    if raw:
        with contextlib.suppress(ValueError):
            val = float(raw)
            if val > 0:
                return val
    return _KEEPALIVE_SECONDS


class GraphAnalyzeRequest(BaseModel):
    company_name: str = ""
    # Scope lock (Théo p.10) : SIREN de l'entité choisie — ancre la recherche.
    siren: str | None = None
    # Périmètre d'analyse (Théo p.10/21) : biaise la recherche.
    scope_mode: str | None = None
    # Cadrage structuré (recette finale §18). Absent ⇒ comportement inchangé :
    # le pipeline ne restreint rien et le prompt ne mentionne aucun périmètre.
    scope_selection: dict | None = None
    # Pays cible (marché du workspace côté produit). Défaut "FR" = chemin français
    # strictement inchangé. Threadé jusqu'au research_node, qui le passe à
    # ResearchRequest → un country pack (CH/BE/LU) ne s'active QUE si country != FR
    # ET son flag d'env est activé — sinon no-op total (aucun appel, prompt inchangé).
    country: str = "FR"
    # Site connu du compte (tome 2 §13) — threadé jusqu'à ResearchRequest pour la
    # détection de board ATS. Absent = comportement inchangé.
    website: str | None = None
    profile_data: dict = {}
    user_context: AnalysisContext | str | None = None
    # Mémoire de corrections du compte (feedback loop A2) : directives condensées
    # côté API depuis les retours utilisateur, threadées vers les nœuds classify
    # et plan. Vide (défaut, clé omise côté FR/worker sans feedback) = prompts
    # byte-identiques.
    account_feedback: str = ""
    # Mémoire du graphe d'organigramme (annexe §5), persistée côté API sur le
    # compte : version courante (bumpée par chaque correction utilisateur) et
    # éléments déjà écartés, que l'assembleur ne doit jamais réinjecter. Valeurs
    # neutres (1 / []) = clés omises côté worker → assemblage inchangé.
    org_graph_version: int = 1
    org_rejected_items: list[dict] = []
    # Couche zéro (annexe méthodo p8) : relevé réel du CRM connecté de l'ESN sur ce
    # compte, rendu côté API. Vide (défaut, clé omise par le worker sans CRM
    # connecté ou sans match) = SalesContext et prompts byte-identiques.
    crm_presence: str = ""
    internal_history: str = ""
    # #4070 (décisions Louis 12/10, #4068) — les FAITS DU COMPTE du socle #4069,
    # lus côté API (``AccountFactsService``), datés, pesés, SANS provenance :
    # ``[{kind, label, date, age_days}]`` les plus pertinents d'abord. Intrant du
    # TRAITEMENT (.1 « pourquoi maintenant », .2 plan et messages, .5 juge).
    # [] (défaut, clé omise par le worker) = prompts byte-identiques.
    account_facts: list[dict[str, Any]] = []
    # #4070.3 — interlocuteurs déjà connus de l'espace (CRM, missions passées) :
    # ``[{name, role, relation: "crm"|"mission", last_seen}]``. [] = inchangé.
    known_contacts: list[dict[str, Any]] = []
    # #4070.4 — l'analyse précédente du compte rendue en trace DATÉE, ses
    # corrections humaines marquées « corrigé par l'équipe » (la correction gagne).
    previous_analysis: str = ""
    # #4070.2 — motifs de perte déclarés (REX de perte), condensés côté API.
    lost_deal_rex: str = ""
    # #3753.3 — le ciblage de l'ESN sur ce compte (hypothèses du vendeur, non vérifiées).
    seller_hypotheses: dict | None = None
    # LUD.6 bis — la zone d'où le compte a été ouvert (Découvrir/Laura) : région nommée ou code INSEE, ville.
    # Les décideurs de la zone passent DEVANT (préférence, jamais exclusion). [] = ordre d'avant.
    preferred_zone: list[str] = []
    # Lot 14 (#1631.3/.4, #1606.2) — l'axe CHEMIN de l'adressabilité : le compte
    # de parcours AGRÉGÉ résolu côté API par `MarketMemoryService.pathAxisFor`.
    # Absent/`None` (aucune couverture, ou sous le seuil transverse) = threadé
    # jusqu'à `_path_axis` qui rend alors l'axe non mesuré, byte-identique.
    market_paths_observed: int | None = None
    market_top_esn: str = ""
    # #2298.4 (décision Louis 19/09/2026) — les QUATRE sources ajoutées à
    # l'axe RELATION en plus du CRM (`crm_presence` ci-dessus). Défauts
    # `None`/"" (aucun ingrédient transmis) = axe byte-identique à avant ce
    # lot. Voir le docstring de `_relation_axis`, `app.services.discover_scoring`.
    relation_missions_count: int | None = None
    relation_last_meeting_at: str = ""
    # MÉTADONNÉES seulement (une date) — jamais le corps d'un e-mail.
    relation_last_email_at: str = ""
    relation_human_correction: str = ""
    declared_partners: list[str] = []
    # #3278.1 — "present" / "former" ; "" = aucune mission (clé omise côté API).
    consultant_history: Literal["present", "former", ""] = ""
    # #3278.1 — un signal d'achat DÉCLARÉ existe sur ce compte ; False = aucun.
    declared_signal_present: bool = False
    # #2371.4 — placements en cours chez la relation partenaire (10e stade).
    partner_placements_active: int | None = None
    # #3278.1 — signaux de route (veille, talent, événement, inbound) lus côté API.
    declared_route_signals: dict[str, bool] | None = None
    # #3278.a — preuves / historique des canaux lus côté API ({} = lu, rien ; None = non lu).
    accumulated_route_criteria: dict[str, str] | None = None
    # Boucle d'apprentissage (§6) : agrégat rendu côté API. Vide (défaut, clé
    # omise par le worker tant que rien n'a été déplacé) = prompts byte-identiques.
    workspace_learning: str = ""
    # #3278.3 — canaux MESURÉS de l'espace (réponse sous 14 j), calculés côté API.
    # Vide (clé omise quand rien n'est mesuré) = prompts byte-identiques.
    channel_performance: list[dict[str, Any]] = []
    # #2451.1 — le mode de contexte du dossier, relayé au plan. ``None`` (clé
    # omise par le worker en « Mon activité ») = prompts byte-identiques.
    context_mode: str | None = None
    # Le FOCUS du plan, regle par ESPACE (« jamais un prisme IT par defaut »).
    # Vide (defaut) = les valeurs EN VIGUEUR du contrat, donc plan
    # byte-identique. Voir app/services/focus_weights.py.
    focus_weights: dict = {}
    # Colonne du kanban commercial du compte (annexe méthodo p6). Vide (défaut,
    # clé omise par le worker pour un compte non trié `inbox`) = état de relation
    # inchangé → SalesContext et prompts byte-identiques.
    commercial_status: str = ""
    account_id: str = ""
    user_id: str = ""
    # Team scope: the RAG grounding of every phase reads the WORKSPACE's knowledge
    # base, so a rep's run grounds on the references a colleague uploaded.
    workspace_id: str = ""
    # Identifiant du RUN (le job appelant). C'est lui qui borne le checkpointer :
    # les tentatives d'un même run partagent un thread et se reprennent, deux
    # runs distincts ne partagent rien. Absent = comportement historique.
    run_id: str = ""
    # Resume a previously-failed run on the same thread instead of starting
    # fresh: clears the error and re-enters at the failed phase.
    resume: bool = False


def _sse(payload: str) -> str:
    return f"data: {payload}\n\n"


def _thread_id(account_id: str, run_id: str) -> str:
    """Thread du checkpointer pour ce run.

    Le checkpointer est durable et sa liste ``completed`` est append-only : le
    thread décide donc de ce qui sera RE-CALCULÉ et de ce qui sera sauté. Le
    borner au compte seul rendait toute ré-analyse stérile — le graphe retrouvait
    les quatre phases déjà marquées faites et n'exécutait plus rien, tandis que la
    phase 4 sautée n'écrivait ni plan ni bascule du compte en ``completed``.

    Le run est la bonne granularité : ses tentatives se reprennent, une nouvelle
    analyse repart de zéro. Sans ``run_id`` on conserve le thread historique (le
    compte), pour ne pas casser une reprise déjà en vol.
    """
    if not account_id:
        return f"graph-{uuid.uuid4()}"
    return f"{account_id}:{run_id}" if run_id else account_id


@router.post("/analyze")
async def analyze(req: GraphAnalyzeRequest) -> StreamingResponse:
    """Run (or resume) the analysis graph, streaming GraphEvents as SSE."""
    thread_id = _thread_id(req.account_id, req.run_id)
    # Always seed the base inputs — the NestJS worker re-sends them on resume too.
    # Relying on the checkpointer alone breaks under MemorySaver (no PG url): the
    # restored state is empty, so a resumed run would hit ``state["company_name"]``
    # with a KeyError. A durable checkpointer still restores ``completed`` from the
    # thread, so landed phases stay skipped regardless of what we pass here.
    inputs: dict = {
        "company_name": req.company_name,
        "siren": req.siren,
        "scope_mode": req.scope_mode,
        "scope_selection": req.scope_selection,
        "country": req.country,
        "website": req.website,
        "profile_data": profile_for_context_mode(req.profile_data, req.context_mode),
        "user_context": req.user_context,
        "account_feedback": req.account_feedback,
        "org_graph_version": req.org_graph_version,
        "org_rejected_items": req.org_rejected_items,
        "crm_presence": req.crm_presence,
        "internal_history": req.internal_history,
        # #4070 — les faits du compte, les interlocuteurs connus, l'analyse précédente.
        "account_facts": req.account_facts,
        "known_contacts": req.known_contacts,
        "previous_analysis": req.previous_analysis,
        "lost_deal_rex": req.lost_deal_rex,
        "seller_hypotheses": req.seller_hypotheses,
        "preferred_zone": req.preferred_zone,
        "market_paths_observed": req.market_paths_observed,
        "market_top_esn": req.market_top_esn,
        "relation_missions_count": req.relation_missions_count,
        "relation_last_meeting_at": req.relation_last_meeting_at,
        "relation_last_email_at": req.relation_last_email_at,
        "relation_human_correction": req.relation_human_correction,
        "declared_partners": req.declared_partners,
        "consultant_history": req.consultant_history,
        "declared_signal_present": req.declared_signal_present,
        "partner_placements_active": req.partner_placements_active,
        "declared_route_signals": req.declared_route_signals,
        "accumulated_route_criteria": req.accumulated_route_criteria,
        "workspace_learning": req.workspace_learning,
        "channel_performance": req.channel_performance,
        "context_mode": req.context_mode,
        "focus_weights": req.focus_weights,
        "commercial_status": req.commercial_status,
        "account_id": req.account_id,
        "user_id": req.user_id,
        "workspace_id": req.workspace_id,
    }
    if req.resume:
        # Clear the prior failure so the graph re-enters at the failed phase.
        inputs["error"] = None
        inputs["failed_phase"] = None

    async def event_stream() -> AsyncIterator[str]:
        # A fresh session per request opens/closes the (Postgres) checkpointer
        # connection around this run only.
        async with analysis_graph_session() as graph:
            # Drain the graph in a background task that pushes events onto a queue,
            # and read the queue with a keepalive timeout. This keeps the graph
            # coroutine OFF the timeout path: cancelling a pending ``__anext__`` on
            # the generator would throw CancelledError *into* the running graph and
            # abort the analysis — so we never race the generator directly.
            queue: asyncio.Queue = asyncio.Queue()
            done = object()

            async def _pump() -> None:
                try:
                    async for event in stream_analysis_graph(inputs, thread_id=thread_id, graph=graph):
                        await queue.put(event)
                except Exception as exc:  # re-raised in the reader to fail the stream, as before
                    await queue.put(exc)
                finally:
                    await queue.put(done)

            pump = asyncio.create_task(_pump())
            keepalive = _keepalive_seconds()
            try:
                while True:
                    try:
                        item = await asyncio.wait_for(queue.get(), timeout=keepalive)
                    except TimeoutError:
                        yield ": keepalive\n\n"
                        continue
                    if item is done:
                        break
                    if isinstance(item, Exception):
                        raise item
                    yield _sse(item.model_dump_json())
            finally:
                pump.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await pump

    return StreamingResponse(event_stream(), media_type="text/event-stream")
