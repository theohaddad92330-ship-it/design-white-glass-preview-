"""Single entry point for Sentry initialization in the IA service.

Error reporting is centralized through Python's logging module: any `logger.error(...)`
call across the codebase is automatically forwarded to Sentry with the active scope's tags
(correlation_id, route, claude context) attached. Handlers MUST NOT call
`sentry_sdk.capture_exception(...)` directly — keep the logger as the single channel.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from typing import Any

import sentry_sdk
from sentry_sdk.integrations.asyncio import AsyncioIntegration
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.httpx import HttpxIntegration
from sentry_sdk.integrations.logging import LoggingIntegration

# Keys whose values must never reach Sentry (secrets / auth / PII-carrying tokens).
_SENSITIVE_KEY = re.compile(
    r"(authorization|cookie|set-cookie|x-internal-secret|password|secret|token|api[-_]?key|jwt|refresh)",
    re.IGNORECASE,
)


def _scrub(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: ("[Filtered]" if _SENSITIVE_KEY.search(str(k)) else _scrub(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [_scrub(v) for v in value]
    return value


def _mask_strings(value: Any) -> Any:
    """#4113 — e-mails, téléphones, jetons masqués dans toute chaîne d'une trace.

    Réutilise le masque de ``langfuse_client`` (``redact_personal_data``) : un
    masquage vit à un seul endroit. Trace seulement — jamais une réponse d'API.
    """
    from app.services.langfuse_client import redact_personal_data  # noqa: PLC0415

    if isinstance(value, str):
        return redact_personal_data(value)
    if isinstance(value, dict):
        return {k: _mask_strings(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_mask_strings(v) for v in value]
    return value


def _before_breadcrumb(crumb: dict[str, Any], _hint: dict[str, Any]) -> dict[str, Any]:
    return _mask_strings(_scrub(crumb))


def _is_expected_failure(hint: dict[str, Any]) -> bool:
    """#4458 — une exception qui n'est PAS un défaut : l'annulation d'un client déconnecté, ou un échec
    attendu qui porte déjà son issue jusqu'à l'écran (``sentry_expected = True``, ex. un scrape de site
    tiers bloquant, vide ou lent). Les échecs terminaux (crédits, auth) ne portent pas la marque."""
    exc_info = hint.get("exc_info")
    exc = exc_info[1] if isinstance(exc_info, tuple) and len(exc_info) > 1 else None
    return isinstance(exc, asyncio.CancelledError) or getattr(exc, "sentry_expected", False) is True


def _before_send(event: dict[str, Any], _hint: dict[str, Any]) -> dict[str, Any] | None:
    """Defense-in-depth: redact sensitive headers/cookies/body/extra + token query args,
    puis masque de FORME (e-mails, téléphones, jetons) sur tout le reste (#4113).
    Un échec ATTENDU (voir ``_is_expected_failure``) n'est pas envoyé."""
    if _is_expected_failure(_hint):
        return None
    event = _before_send_keys(event)
    return _mask_strings(event)


def _before_send_keys(event: dict[str, Any]) -> dict[str, Any]:
    req = event.get("request")
    if isinstance(req, dict):
        for key in ("headers", "cookies", "data"):
            if key in req:
                req[key] = _scrub(req[key])
        qs = req.get("query_string")
        if isinstance(qs, str):
            req["query_string"] = re.sub(r"(token|code|secret|apikey)=[^&]+", r"\1=[Filtered]", qs, flags=re.IGNORECASE)
    for key in ("extra", "contexts"):
        if key in event:
            event[key] = _scrub(event[key])
    return event


def sentry_release() -> str | None:
    """#4618 — le SHA du commit servi. Railway n'injecte pas ``SENTRY_RELEASE`` : sans repli sur
    ``RAILWAY_GIT_COMMIT_SHA`` toute erreur de l'IA remontait sans ``release``. Absent partout : ``None``
    (jamais une valeur inventée)."""
    return (
        os.environ.get("SENTRY_RELEASE")
        or os.environ.get("RAILWAY_GIT_COMMIT_SHA")
        or os.environ.get("GIT_COMMIT")
        or None
    )


def sentry_environment() -> str:
    """#4618 — l'environnement RÉEL. Sans ``SENTRY_ENVIRONMENT`` ni ``ENV``, les 52 issues de ``bellum-ia``
    sortaient toutes en ``development`` : Railway nomme l'environnement dans ``RAILWAY_ENVIRONMENT_NAME``."""
    return (
        os.environ.get("SENTRY_ENVIRONMENT")
        or os.environ.get("RAILWAY_ENVIRONMENT_NAME")
        or os.environ.get("ENV")
        or "development"
    )


def init_sentry() -> None:
    dsn = os.environ.get("SENTRY_DSN")
    if not dsn:
        return

    sentry_sdk.init(
        dsn=dsn,
        environment=sentry_environment(),
        release=sentry_release(),
        traces_sample_rate=float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "1.0")),
        # INFO logs become breadcrumbs, ERROR+ become Sentry events — no manual capture needed.
        integrations=[
            FastApiIntegration(),
            AsyncioIntegration(),
            HttpxIntegration(),
            LoggingIntegration(level=logging.INFO, event_level=logging.ERROR),
        ],
        send_default_pii=False,
        before_send=_before_send,
        before_breadcrumb=_before_breadcrumb,
    )
