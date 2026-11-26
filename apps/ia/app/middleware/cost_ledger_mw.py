"""Transport du registre de coûts vers l'API (D19).

Le pipeline d'analyse est orchestré par NestJS : chaque phase est une requête
HTTP distincte vers ce service. Le registre est donc ouvert **par requête**, et
son contenu repart dans l'en-tête ``X-Bellum-Costs`` — c'est l'API, qui possède
la notion de « run », qui additionne les phases et persiste.

Pourquoi un en-tête plutôt qu'un champ de réponse : les corps de réponse sont
des contrats validés (schémas partagés, tests de parité). Y greffer un bloc
« coûts » ferait porter à chaque contrat métier une préoccupation de facturation
— et casserait les schémas de tout le monde pour une donnée qui n'intéresse que
le backoffice.

L'en-tête est borné et silencieux en cas de problème : une mesure ne dégrade
jamais la réponse qu'elle accompagne.
"""

from __future__ import annotations

import json
import logging

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

from app.services import cost_ledger

logger = logging.getLogger(__name__)

COST_HEADER = "x-bellum-costs"

#: Un en-tête HTTP raisonnable. Au-delà, on préfère ne rien envoyer plutôt que
#: de risquer un rejet de proxy sur une requête métier valide.
_MAX_HEADER_CHARS = 4000


class CostLedgerMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        with cost_ledger.bind_run(request.url.path):
            response: Response = await call_next(request)
            try:
                rows = cost_ledger.snapshot()
                if rows:
                    payload = json.dumps(rows, separators=(",", ":"))
                    if len(payload) <= _MAX_HEADER_CHARS:
                        response.headers[COST_HEADER] = payload
                    else:
                        logger.debug("Registre de coûts trop volumineux pour l'en-tête (%d)", len(payload))
            except Exception as exc:  # noqa: BLE001 — une mesure ne casse pas une réponse
                logger.debug("Registre de coûts non transmis: %s", exc)
        return response
