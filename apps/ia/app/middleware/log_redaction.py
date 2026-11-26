"""DECATHLON 11/10 — aucune clé de fournisseur en clair dans les journaux.

Relevé sur les logs du run 9c76e009 : le client HTTP (``httpx``) journalise en
INFO chaque requête, URL complète comprise — ``app_id``/``app_key`` d'un
fournisseur d'offres y apparaissaient en clair. Règle du dépôt : une valeur de
clé ne va jamais dans un journal.

Deux défenses, installées une fois au démarrage (``app.main``) :

1. le journal de requêtes de ``httpx``/``httpcore`` est relevé à WARNING — la
   ligne n'est même plus créée (ni console, ni fil d'Ariane d'erreur) ;
2. un filtre sur les handlers racine masque ce qui ressemble à une clé dans
   toute ligne restante (message d'exception qui recopie une URL, autre client).
"""

from __future__ import annotations

import logging
import re

_MASK = "***"

#: Paramètres de requête dont la VALEUR est un secret.
_QUERY_SECRET_RE = re.compile(
    r"(?i)(?<![a-z0-9_])((?:app_id|app_key|api_key|apikey|api-key|key|token|access_token|client_secret|secret)=)"
    r"[^&\s'\"]+"
)
#: Fournisseurs qui portent la clé dans le CHEMIN de l'URL.
_PATH_SECRET_RE = re.compile(r"(?i)(jooble\.org/api/)[^/\s'\"?]+")

#: Clients HTTP dont le journal INFO recopie l'URL complète.
_NOISY_HTTP_LOGGERS = ("httpx", "httpcore")


def redact_secrets(text: str) -> str:
    """Masque les valeurs de clé d'une ligne, laisse le reste lisible."""
    out = _QUERY_SECRET_RE.sub(lambda m: m.group(1) + _MASK, text)
    return _PATH_SECRET_RE.sub(lambda m: m.group(1) + _MASK, out)


class SecretRedactionFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
        except Exception:  # noqa: BLE001 — un format cassé ne doit pas perdre la ligne
            return True
        redacted = redact_secrets(message)
        if redacted != message:
            record.msg = redacted
            record.args = None
        return True


def install_secret_redaction(logger: logging.Logger | None = None) -> None:
    """Relève le journal des clients HTTP et branche le filtre (idempotent)."""
    for name in _NOISY_HTTP_LOGGERS:
        noisy = logging.getLogger(name)
        if noisy.getEffectiveLevel() < logging.WARNING:
            noisy.setLevel(logging.WARNING)
    target = logger or logging.getLogger()
    for handler in target.handlers:
        if not any(isinstance(f, SecretRedactionFilter) for f in handler.filters):
            handler.addFilter(SecretRedactionFilter())
