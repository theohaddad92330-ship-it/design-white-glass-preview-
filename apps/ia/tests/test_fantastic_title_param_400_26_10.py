"""Incident 26/10 — Fantastic.jobs a renommé ``title_filter`` en ``title`` et refuse tout
paramètre inconnu (400). Ces tests lisent la requête RÉELLEMENT émise par httpx (transport
simulé, pas un mock de ``_request``) et le journal produit sur un 400."""

from __future__ import annotations

import logging
from datetime import datetime

import httpx
import pytest

from app.services import source_silence
from app.services.data_sources import job_aggregators

KEY = "sk-fantastic-secret-123"


@pytest.fixture
def wire(monkeypatch):
    """Remplace le client httpx par un vrai client à transport simulé ; note les requêtes."""
    seen: list[httpx.Request] = []
    state = {"status": 200, "body": "[]"}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(state["status"], text=state["body"], headers={"content-type": "application/json"})

    real = httpx.AsyncClient

    def factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return real(*args, **kwargs)

    monkeypatch.setattr(job_aggregators.httpx, "AsyncClient", factory)
    monkeypatch.setenv("FANTASTIC_JOBS_API_KEY", KEY)

    async def no_skip(provider):
        return False

    async def no_outcome(*a, **k):
        return None

    monkeypatch.setattr(source_silence, "skip_auth_refused", no_skip)
    monkeypatch.setattr(source_silence, "record_outcome", no_outcome)
    return seen, state


async def test_envoie_title_et_pas_title_filter(wire):
    seen, _state = wire
    await job_aggregators.fantastic_skill_offers("Vue.js")
    assert len(seen) == 1
    params = dict(seen[0].url.params)
    assert params.get("title") == '"Vue.js"'
    assert "title_filter" not in params


async def test_corps_du_400_journalise_sans_url_ni_cle(wire, caplog):
    seen, state = wire
    state["status"] = 400
    state["body"] = '{"detail": "Unknown query parameter: foo_bar"}'
    with caplog.at_level(logging.WARNING):
        result = await job_aggregators.fantastic_skill_offers("Vue.js")
    assert result is None
    assert len(seen) == 1
    text = "\n".join(r.getMessage() for r in caplog.records)
    assert "Unknown query parameter: foo_bar" in text
    assert KEY not in text
    assert "developer.fantastic.jobs" not in text and "http" not in text.replace("HTTP", "")
    assert "title=" not in text


async def test_date_posted_gte_est_un_horodatage_complet(wire):
    """Incident 26/10, seconde cause — le contrat type ``date_posted_gte`` en ``date-time``
    (exemple documenté ``2026-04-20T00:00:00``). Une date seule ``AAAA-MM-JJ`` est refusée, et
    comme le champ vit dans ``_fantastic_params``, elle faisait tomber TOUS les appels Fantastic,
    y compris celui de la fiche entreprise qui n'envoyait pas ``title_filter``."""
    seen, _state = wire
    await job_aggregators.fantastic_skill_offers("Vue.js")
    assert len(seen) == 1
    since = dict(seen[0].url.params)["date_posted_gte"]
    assert "T" in since, f"attendu un horodatage ISO complet, reçu {since!r}"
    datetime.fromisoformat(since)
