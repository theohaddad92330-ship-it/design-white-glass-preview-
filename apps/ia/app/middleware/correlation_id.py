"""FastAPI correlation-id middleware.

Reads `x-correlation-id` from the incoming request (set upstream by the NestJS API),
stores it in a ContextVar so any downstream async code can retrieve it with
`get_correlation_id()`, and attaches it as a Sentry tag so every event from this request
is filterable by correlation-id in the dashboard.

Replaces the previous ad-hoc pattern where each router read `request.headers.get(...)`
individually. Handlers should call `get_correlation_id()` instead.
"""

from __future__ import annotations

import logging
import uuid
from contextvars import ContextVar

import sentry_sdk
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

CORRELATION_ID_HEADER = "x-correlation-id"
_correlation_id: ContextVar[str] = ContextVar("correlation_id", default="")


def get_correlation_id() -> str:
    return _correlation_id.get()


class CorrelationIdLogFilter(logging.Filter):
    """Pose l'identifiant de corrélation sur CHAQUE ligne de log.

    L'identifiant vivait déjà dans le ContextVar et dans les tags Sentry, mais pas
    dans les logs : en incident, on avait l'identifiant d'un côté et le détail de
    l'exécution de l'autre, sans moyen de les rapprocher. Or c'est ici que se passe
    l'essentiel d'un run (phases, prompts, scrapes, coûts).

    Attaché au HANDLER et non aux loggers : un record émis par une bibliothèque
    tierce traverse quand même le handler, alors qu'il n'aurait jamais vu un filtre
    posé sur nos loggers — et un format qui réclame `%(correlation_id)s` sur un
    record dépourvu de l'attribut lève `KeyError`, c'est-à-dire perd la ligne.

    Hors requête (démarrage, tâche de fond), l'identifiant est vide : on écrit `-`
    plutôt qu'une chaîne vide, pour que la colonne reste lisible.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        # Un appelant peut déjà avoir posé l'identifiant lui-même (`extra=`) : le
        # log d'accès HTTP le fait, parce qu'il s'exécute EN DEHORS du contexte et
        # que le ContextVar y est encore vide. L'écraser ici remettrait `-` sur la
        # ligne qu'on lit en premier.
        provided = getattr(record, "correlation_id", None)
        if not provided or provided == "-":
            record.correlation_id = get_correlation_id() or "-"
        return True


def install_correlation_log_filter(logger: logging.Logger | None = None) -> None:
    """Branche le filtre sur les handlers du logger racine (idempotent)."""
    target = logger or logging.getLogger()
    for handler in target.handlers:
        if not any(isinstance(f, CorrelationIdLogFilter) for f in handler.filters):
            handler.addFilter(CorrelationIdLogFilter())


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        cid = request.headers.get(CORRELATION_ID_HEADER) or str(uuid.uuid4())
        token = _correlation_id.set(cid)

        # Per-request Sentry scope — tags set here don't leak to other requests.
        with sentry_sdk.new_scope() as scope:
            scope.set_tag("correlation_id", cid)
            scope.set_tag("http.route", request.url.path)
            try:
                response: Response = await call_next(request)
            finally:
                _correlation_id.reset(token)

        response.headers[CORRELATION_ID_HEADER] = cid
        return response
