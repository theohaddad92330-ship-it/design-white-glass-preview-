"""Internal-secret gate for the IA service.

The FastAPI service holds a Supabase *service-role* key that bypasses RLS and
triggers metered work (Claude, Apollo, Firecrawl…). Left open it is a remote
IDOR / credit-burn surface. This middleware requires callers to present a shared
``x-internal-secret`` header — the mirror of the NestJS ``InternalSecretGuard``
(``apps/api/src/common/internal-secret.guard.ts``); the NestJS ``IaClient``
sends it on every call.

Rollout: **fail-closed in production, fail-open in dev.** When ``INTERNAL_API_SECRET``
is set the gate enforces it everywhere (constant-time compare). When it is unset the
gate is a no-op in development (a startup warning is logged) but **rejects every
non-exempt request with 503 in production** — so a missing secret can never silently
expose the service. Set the SAME value on the API and IA services. Production is
detected via ``ENV``/``SENTRY_ENVIRONMENT`` == ``production``.

Exemptions (see ``_EXEMPT_PREFIXES``): **health and docs, rien d'autre.** Aucun
routeur porteur de donnée n'est exempté.

⚠️ Ce paragraphe affirmait le CONTRAIRE jusqu'au 27/08/2026 — il décrivait
``/discover``, ``/chat`` et ``/rag`` comme exemptés « tant qu'ils ne passent pas
par un proxy NestJS authentifié ». Ils y sont passés le jour où
``RagController``/``IaProxyController`` ont été écrits, et la liste a suivi ; la
PROSE, elle, est restée. Une documentation qui décrit un trou refermé ne se
contente pas d'être fausse : elle est une consigne de le rouvrir, et elle a
circulé jusqu'à ``CLAUDE.md``. Le SPA appelle ``POST /rag-documents/ingest`` sur
NestJS, jamais l'hôte du service IA.

Do NOT add a data-carrying router here; proxy it instead. Trois tests le
refusent (``tests/test_internal_auth.py``) : la liste déclarée, l'arbre de
routes réel, et un appel sans en-tête sur chaque route de ``/rag``.
"""

from __future__ import annotations

import hmac
import logging
import os

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

logger = logging.getLogger(__name__)

INTERNAL_SECRET_HEADER = "x-internal-secret"

# Paths that must stay reachable without the secret. discover/chat/rag are now
# fronted by a JWT-authenticated NestJS proxy (RagController + IaProxyController)
# that forwards the secret, so they are no longer exempt.
_EXEMPT_PREFIXES: tuple[str, ...] = (
    "/health",
    # `/version` doit rester lisible SANS le secret : son unique raison d'être est
    # de répondre « quelle révision tourne ici ? » quand quelque chose ne va pas,
    # y compris depuis un poste qui n'a pas le secret. Il n'expose que le SHA du
    # commit et le nom d'environnement — exactement ce que l'API NestJS publie
    # déjà sur son propre `/version` public.
    "/version",
    "/docs",
    "/redoc",
    "/openapi.json",
)


def _is_exempt(path: str) -> bool:
    return any(path == p or path.startswith(p + "/") for p in _EXEMPT_PREFIXES)


def _is_production() -> bool:
    env = os.environ.get("ENV") or os.environ.get("SENTRY_ENVIRONMENT") or "development"
    return env.strip().lower() == "production"


class InternalAuthMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)
        self._secret = os.environ.get("INTERNAL_API_SECRET", "")
        self._fail_closed = _is_production()
        if not self._secret:
            if self._fail_closed:
                logger.error(
                    "INTERNAL_API_SECRET unset in PRODUCTION — IA internal-auth gate is "
                    "FAIL-CLOSED: all non-exempt requests are rejected (503). Set the SAME "
                    "value on the API and IA services."
                )
            else:
                logger.warning(
                    "INTERNAL_API_SECRET unset — IA internal-auth gate is DISABLED (dev "
                    "no-op). Set it on the API and IA services to enforce."
                )

    async def dispatch(self, request: Request, call_next) -> Response:
        # CORS preflight and exempt paths (health/docs) always pass.
        if request.method == "OPTIONS" or _is_exempt(request.url.path):
            return await call_next(request)
        # No secret configured: fail-closed in production, no-op in dev.
        if not self._secret:
            if self._fail_closed:
                return JSONResponse(
                    status_code=503,
                    content={"detail": {"code": "GATE_MISCONFIGURED", "user_message": "Service indisponible."}},
                )
            return await call_next(request)
        provided = request.headers.get(INTERNAL_SECRET_HEADER, "")
        if not hmac.compare_digest(provided, self._secret):
            return JSONResponse(
                status_code=401,
                content={"detail": {"code": "UNAUTHORIZED", "user_message": "Requête non autorisée."}},
            )
        return await call_next(request)
