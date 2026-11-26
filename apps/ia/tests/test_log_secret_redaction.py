"""DECATHLON 11/10 — aucune clé de fournisseur en clair dans les journaux.

Relevé sur les logs Railway du run 9c76e009 : le client HTTP journalisait en INFO
l'URL complète d'une recherche d'offres, ``app_id``/``app_key`` compris. Ces
tests tiennent la règle « jamais une valeur dans un journal » (CLAUDE.md) :
le journal de requêtes du client HTTP est relevé à WARNING, et toute ligne qui
porterait encore une clé (message d'exception, autre client) est masquée.
"""

from __future__ import annotations

import io
import logging

from app.middleware.log_redaction import SecretRedactionFilter, install_secret_redaction, redact_secrets

_SECRET = "s3cr3tValue42"


def test_redact_masks_query_keys_and_path_keys() -> None:
    line = (
        f"HTTP Request: GET https://api.adzuna.com/v1/api/jobs/fr/search/1?app_id=abc123&app_key={_SECRET}"
        f"&what=DECATHLON \"HTTP/1.1 200 OK\" POST https://jooble.org/api/{_SECRET} token={_SECRET}"
    )
    out = redact_secrets(line)
    assert _SECRET not in out
    assert "abc123" not in out
    # Ce qui n'est pas secret reste lisible : on doit pouvoir diagnostiquer.
    assert "what=DECATHLON" in out
    assert "api.adzuna.com/v1/api/jobs/fr/search/1" in out


def test_redact_does_not_touch_ordinary_lines() -> None:
    line = "adzuna search failed (status 403) for 'DECATHLON'"
    assert redact_secrets(line) == line


def test_the_service_installs_the_redaction_at_startup() -> None:
    import app.main  # noqa: F401 — l'installation se fait à l'import du service

    assert logging.getLogger("httpx").getEffectiveLevel() >= logging.WARNING
    assert any(
        isinstance(f, SecretRedactionFilter) for h in logging.getLogger().handlers for f in h.filters
    )


def _capture() -> tuple[logging.Logger, io.StringIO, logging.Handler]:
    root = logging.getLogger()
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(logging.Formatter("%(name)s %(message)s"))
    root.addHandler(handler)
    return root, stream, handler


def test_installed_redaction_masks_a_propagated_record_and_quiets_httpx() -> None:
    root, stream, handler = _capture()
    old_root_level = root.level
    httpx_logger = logging.getLogger("httpx")
    old_httpx_level = httpx_logger.level
    try:
        root.setLevel(logging.INFO)
        install_secret_redaction()
        assert any(isinstance(f, SecretRedactionFilter) for f in handler.filters)
        # Le journal de requêtes du client HTTP (INFO) ne sort plus.
        httpx_logger.info("HTTP Request: GET https://api.adzuna.com/x?app_key=%s", _SECRET)
        assert _SECRET not in stream.getvalue()
        assert httpx_logger.getEffectiveLevel() >= logging.WARNING
        # Une ligne d'un autre module qui porte une clé (message d'exception) est masquée.
        logging.getLogger("app.services.data_sources.job_aggregators").warning(
            "jooble search failed for %r: %s", "DECATHLON", f"Client error for url https://jooble.org/api/{_SECRET}"
        )
        text = stream.getvalue()
        assert "jooble search failed for 'DECATHLON'" in text
        assert _SECRET not in text
    finally:
        root.removeHandler(handler)
        root.setLevel(old_root_level)
        httpx_logger.setLevel(old_httpx_level)
