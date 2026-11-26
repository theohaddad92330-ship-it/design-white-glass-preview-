"""Enrichissement en ligne du brief commercial (briefs comptes, point 44, 01/10/2026).

« On enrichit en ligne sur ce qui manque » : AVANT l'appel modèle, les manques
BLOQUANTS (siège non résolu, aucun site, aucun projet/signal récent) déclenchent
une recherche web ciblée — et SEULEMENT eux. Connecteur déjà utilisé par le
pipeline (``brave_search.search_web``, mocké ici : aucun réseau). Sans clé =
no-op strict. Borné : ≤ 3 requêtes par compte. France uniquement.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.prompts.bellum_commercial_brief import build_user_prompt
from app.services.commercial_brief_enrichment import (
    MAX_QUERIES,
    detect_gaps,
    enrich_missing,
)

_SEARCH = "app.services.commercial_brief_enrichment.search_web"

_SEAT = {"value": "Paris 13e", "source": "registry"}
_COMPLETE = {"website": "https://bpce.fr", "recent_signals": [{"title": "Contrat 2026"}]}


def _hit(url: str, title: str = "Titre", description: str = "Extrait") -> dict[str, str]:
    return {"title": title, "description": description, "url": url}


# ── Détection des manques ────────────────────────────────────────────────────


def test_no_gap_when_seat_site_and_recent_activity_are_known():
    assert detect_gaps(_SEAT, _COMPLETE) == []


def test_each_blocking_gap_is_named():
    assert detect_gaps(None, _COMPLETE) == ["headquarters"]
    assert detect_gaps(_SEAT, {"recent_signals": [{"t": 1}]}) == ["website"]
    assert detect_gaps(_SEAT, {"website": "https://x.fr"}) == ["recent_activity"]
    assert detect_gaps(None, {}) == ["headquarters", "website", "recent_activity"]


def test_a_seat_without_value_is_a_gap():
    assert detect_gaps({"value": "", "source": "registry"}, _COMPLETE) == ["headquarters"]


def test_any_recent_signal_family_counts_as_recent_activity():
    for key in ("recent_signals", "public_tenders", "awarded_contracts", "program_names", "it_job_signals"):
        assert detect_gaps(_SEAT, {"website": "https://x.fr", key: [{"a": 1}]}) == [], key


# ── Recherche ciblée ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_gap_triggers_one_query_and_returns_web_facts_with_url(monkeypatch):
    monkeypatch.setenv("BRAVE_API_KEY", "k")
    with patch(_SEARCH, new=AsyncMock(return_value=[_hit("https://www.exemple.fr/siege")])) as search:
        out = await enrich_missing("BPCE", None, _COMPLETE)
    assert search.await_count == 1
    assert out.gaps == ["headquarters"]
    assert out.queries == 1
    assert out.facts == [
        {
            "gap": "headquarters",
            "source": "web",
            "url": "https://www.exemple.fr/siege",
            "title": "Titre",
            "excerpt": "Extrait",
        }
    ]
    assert "France" in search.await_args.args[0]
    assert "BPCE" in search.await_args.args[0]


@pytest.mark.asyncio
async def test_no_gap_means_no_query(monkeypatch):
    monkeypatch.setenv("BRAVE_API_KEY", "k")
    with patch(_SEARCH, new=AsyncMock(return_value=[])) as search:
        out = await enrich_missing("BPCE", _SEAT, _COMPLETE)
    search.assert_not_awaited()
    assert (out.gaps, out.queries, out.facts) == ([], 0, [])


@pytest.mark.asyncio
async def test_without_key_no_query_at_all(monkeypatch):
    monkeypatch.delenv("BRAVE_API_KEY", raising=False)
    with patch(_SEARCH, new=AsyncMock(return_value=[_hit("https://a.fr")])) as search:
        out = await enrich_missing("BPCE", None, {})
    search.assert_not_awaited()
    # Les manques restent NOMMÉS (le brief les écrit dans « ce qu'on ne sait pas »).
    assert out.gaps == ["headquarters", "website", "recent_activity"]
    assert (out.queries, out.facts) == (0, [])


@pytest.mark.asyncio
async def test_queries_are_capped_at_three_per_account(monkeypatch):
    monkeypatch.setenv("BRAVE_API_KEY", "k")
    with patch(_SEARCH, new=AsyncMock(return_value=[_hit("https://a.fr")])) as search:
        out = await enrich_missing("BPCE", None, {})
    assert MAX_QUERIES == 3
    assert search.await_count == 3 == out.queries


@pytest.mark.asyncio
async def test_foreign_hits_are_dropped_france_only(monkeypatch):
    monkeypatch.setenv("BRAVE_API_KEY", "k")
    hits = [_hit("https://www.bpce.co.uk/hq"), _hit("https://www.bpce.com/siege"), _hit("https://www.bpce.fr/x")]
    with patch(_SEARCH, new=AsyncMock(return_value=hits)):
        out = await enrich_missing("BPCE", None, _COMPLETE)
    assert [f["url"] for f in out.facts] == ["https://www.bpce.com/siege", "https://www.bpce.fr/x"]


@pytest.mark.asyncio
async def test_a_failing_connector_never_breaks_the_brief(monkeypatch):
    monkeypatch.setenv("BRAVE_API_KEY", "k")
    with patch(_SEARCH, new=AsyncMock(side_effect=RuntimeError("boom"))):
        out = await enrich_missing("BPCE", None, {})
    assert out.facts == []
    assert out.gaps == ["headquarters", "website", "recent_activity"]


# ── Le prompt ────────────────────────────────────────────────────────────────


def test_user_prompt_unchanged_without_web_facts():
    base = build_user_prompt("BPCE", _SEAT, {"a": 1}, {})
    assert build_user_prompt("BPCE", _SEAT, {"a": 1}, {}, web_facts=[]) == base
    assert "recherche_web" not in base


def test_user_prompt_carries_web_facts_as_fenced_data_with_url():
    fact = {"gap": "headquarters", "source": "web", "url": "https://a.fr/x", "title": "T", "excerpt": "E"}
    prompt = build_user_prompt("BPCE", None, {}, {}, web_facts=[fact])
    assert "<recherche_web>" in prompt and "</recherche_web>" in prompt
    assert "https://a.fr/x" in prompt and '"source":"web"' in prompt
