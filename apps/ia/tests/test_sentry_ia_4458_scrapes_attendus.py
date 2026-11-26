"""#4458 (part IA) — un échec de scrape ATTENDU (403, site bloquant, page vide, timeout, panne Firecrawl) et
l'annulation d'un client déconnecté sont déjà portés par ``scrape_status`` / ``error_code`` jusqu'à l'écran :
ils ne partent pas à Sentry. Un échec TERMINAL (crédits, auth, quota) reste un défaut et part."""

from __future__ import annotations

import asyncio

import pytest

from app.sentry_init import _before_send
from app.services.firecrawl import FirecrawlScrapeError, _ScrapeOutcome


def _event_for(exc: BaseException) -> tuple[dict, dict]:
    return {"exception": {"values": [{"type": type(exc).__name__}]}}, {"exc_info": (type(exc), exc, None)}


@pytest.mark.parametrize(
    "exc",
    [
        _ScrapeOutcome("error", "WEBSITE_BLOCKED"),
        _ScrapeOutcome("empty", None),
        _ScrapeOutcome("timeout", "TIMEOUT"),
        _ScrapeOutcome("error", "FIRECRAWL_INTERNAL"),
        asyncio.CancelledError(),
    ],
)
def test_echec_attendu_ne_part_pas_a_sentry(exc: BaseException) -> None:
    event, hint = _event_for(exc)
    assert _before_send(event, hint) is None


def test_echec_terminal_part_toujours() -> None:
    event, hint = _event_for(FirecrawlScrapeError("INSUFFICIENT_CREDITS", url="https://x.test"))
    assert _before_send(event, hint) == event


def test_evenement_sans_exception_inchange() -> None:
    event = {"message": "hello", "level": "error"}
    assert _before_send(event, {}) == event
