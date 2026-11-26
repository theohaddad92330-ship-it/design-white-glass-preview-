"""#4473 — la clé du service n'a pas la portée requise : un échec NOMMÉ, jamais un 502 opaque.

La cause n'est pas du code (la clé se pose côté fournisseur, c'est un geste humain) : ce module
ne fait que RECONNAÎTRE l'échec, pour que l'écran le dise en français, que le journal le
distingue d'un défaut de code, et qu'aucun contenu ne soit fabriqué à la place.

Jamais le texte du fournisseur ni une valeur de clé dans une réponse ou un journal.
"""

from __future__ import annotations

import anthropic
from fastapi.responses import JSONResponse

#: Code court lu par l'API (forme `^[a-z0-9_]{1,80}$`) et marqueur de journal / Sentry.
KEY_SCOPE_CODE = "model_key_scope_missing"
#: Ce qui voyage jusqu'à l'écran : la cause, sans jargon ni nom de fournisseur.
KEY_SCOPE_USER_MESSAGE = "La clé du service n'a pas la portée requise. L'équipe a été notifiée."

_PROVIDER_PHRASE = "not scoped to a workspace"


def is_key_scope_error(exc: BaseException) -> bool:
    """Un refus 4xx du fournisseur dont la cause est la portée de la clé — et rien d'autre."""
    if not isinstance(exc, anthropic.APIStatusError):
        return False
    return _PROVIDER_PHRASE in str(exc).lower()


def key_scope_response() -> JSONResponse:
    """Le 502 lisible : code court + message français, aucun contenu."""
    return JSONResponse(
        status_code=502,
        content={"detail": KEY_SCOPE_CODE, "user_message": KEY_SCOPE_USER_MESSAGE},
    )
