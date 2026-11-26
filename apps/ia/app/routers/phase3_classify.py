from __future__ import annotations

import logging
import time
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.agents.classifier import ClassifierAgent
from app.middleware.correlation_id import get_correlation_id
from app.models.agent_envelope import AgentEnvelope, AgentMeta, AgentStatus
from app.models.classified_data import ClassifiedData
from app.models.classify import ClassifyRequest
from app.services.cancel import run_or_cancel
from app.services.org_graph_build import build_org_graph_payload

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/phase/3", tags=["Phase 3 — Classification"])

PHASE3_AGENT_NAME = "classifier"
PHASE3_AGENT_VERSION = "1.0.0"

# AgentStatus → HTTP status code, mirroring the other phase routers so the API
# worker sees a consistent (status, code) pairing across phases.
_STATUS_CODE: dict[AgentStatus, int] = {
    AgentStatus.SUCCESS: 200,
    AgentStatus.PARTIAL_SUCCESS: 200,
    AgentStatus.RECOVERABLE_FAILURE: 503,
    AgentStatus.TERMINAL_FAILURE: 422,
    AgentStatus.CANCELLED: 499,
}


@router.post("/classify")
async def classify(req: ClassifyRequest, request: Request) -> JSONResponse:
    """Phase 3 HTTP entrypoint — always returns an ``AgentEnvelope``.

    Delegates to :class:`ClassifierAgent`, which already shapes the envelope
    (including typed Claude failures). The router maps ``envelope.status`` to
    the HTTP code the API worker expects and serialises the envelope as the
    response body.
    """
    started_at = datetime.now(UTC)
    t0 = time.monotonic()
    correlation_id = get_correlation_id() or ""
    profile = req.profile_data
    agent = ClassifierAgent()

    try:
        env = await run_or_cancel(
            request,
            agent.run(
                profile.get("companyName", "N/A"),
                profile,
                profile,  # HTTP path: research_data is already merged into profile
                {"contacts": req.contacts},
                # Mémoire de corrections (A2) — refresh organigramme du même compte.
                account_feedback=req.account_feedback,
            ),
        )
    except HTTPException as exc:
        # run_or_cancel raises 499 on client disconnect — surface it as a
        # cancelled envelope so the wire stays uniform across phases.
        if exc.status_code != 499:
            raise
        env = AgentEnvelope[ClassifiedData](
            status=AgentStatus.CANCELLED,
            data=None,
            error=None,
            meta=AgentMeta(
                agent_name=PHASE3_AGENT_NAME,
                agent_version=PHASE3_AGENT_VERSION,
                correlation_id=correlation_id,
                started_at=started_at.isoformat(),
                finished_at=datetime.now(UTC).isoformat(),
                duration_ms=int((time.monotonic() - t0) * 1000),
            ),
        )

    content = env.model_dump(mode="json", exclude_none=True, by_alias=True)

    # Le bloc ``org_graph`` — organigramme hérité, comité d'achat, graphe typé —
    # est ce que l'API persiste dans ``raw_analysis.org``. Il n'était construit
    # que par le nœud du run complet : cette route, celle du bouton « Enrichir
    # l'organigramme » et de tout enrichissement à la demande, renvoyait des
    # contacts SANS graphe, et la carte d'influence du compte restait figée sur
    # le graphe du run initial. Sur ce chemin HTTP, la recherche de phase 1 est
    # déjà fondue dans ``profile_data`` (voir l'appel à l'agent ci-dessus).
    data = content.get("data")
    if isinstance(data, dict):
        data["org_graph"] = build_org_graph_payload(
            data=data,
            contacts=data.get("contacts") or [],
            research=profile,
            graph_version=req.org_graph_version or 1,
            rejected_items=req.org_rejected_items or [],
            # Le corpus tel que l'appelant l'a envoyé — c'est-à-dire tous les
            # contacts du compte, avant le plafond de vague. Sur ce chemin
            # (bouton « Enrichir l'organigramme »), c'est la liste complète que
            # l'API tire de sa table `contacts`.
            discovered_contacts=req.contacts or [],
            # #2543.5a — repassé tel quel : cette route ne relance aucune
            # recherche Apollo, elle ne fait que reclasser des contacts déjà
            # trouvés. Sans ça, chaque « Enrichir l'organigramme » effacerait
            # l'état de source qu'une phase 2 précédente avait mesuré.
            apollo_source_status=req.apollo_source_status,
            apollo_total_entries=req.apollo_total_entries,
            # #2543.5b/.5g — repassés tels quels, même raison que les deux
            # champs ci-dessus : cette route ne relance ni repli ni
            # élargissement, elle ne fait que reclasser des contacts déjà
            # trouvés.
            apollo_fallback=req.apollo_fallback,
            apollo_widened=req.apollo_widened,
            # #3820 — voir le commentaire sur le champ, `ClassifyRequest`.
            scope_selection=req.scope_selection,
        )

    return JSONResponse(status_code=_STATUS_CODE[env.status], content=content)
