"""One-line HTTP access log per FastAPI request.

Mirrors the NestJS `HttpLoggingInterceptor` so the two services have the same
shape of access log: `METHOD /path → status (Xms)`. Errors surface as warning
lines with the exception message — no more silent 5xx replies.
"""

from __future__ import annotations

import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.middleware.correlation_id import CORRELATION_ID_HEADER

logger = logging.getLogger("http")


class HttpLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        method = request.method
        path = request.url.path
        # Ce middleware tourne volontairement À L'EXTÉRIEUR de celui qui pose
        # l'identifiant de corrélation (pour qu'une requête rejetée laisse quand
        # même une ligne d'accès) : le ContextVar n'est donc pas encore rempli, et
        # le filtre de log écrirait `-` sur la ligne qu'on lit en PREMIER. On lit
        # donc l'en-tête directement. Absent = `-`, jamais un identifiant inventé.
        cid = request.headers.get(CORRELATION_ID_HEADER) or "-"

        try:
            response: Response = await call_next(request)
        except Exception as exc:  # noqa: BLE001 — propagate after logging
            duration_ms = int((time.perf_counter() - start) * 1000)
            logger.warning("%s %s → 500 %s (%dms)", method, path, exc, duration_ms, extra={"correlation_id": cid})
            raise

        duration_ms = int((time.perf_counter() - start) * 1000)
        if response.status_code >= 500:
            logger.error("%s %s → %d (%dms)", method, path, response.status_code, duration_ms, extra={"correlation_id": cid})
        elif response.status_code >= 400:
            logger.warning("%s %s → %d (%dms)", method, path, response.status_code, duration_ms, extra={"correlation_id": cid})
        else:
            logger.info("%s %s → %d (%dms)", method, path, response.status_code, duration_ms, extra={"correlation_id": cid})
        return response
