"""#4045 (14/10) — l'ANALYSE écrit les offres de TOUTES ses sources dans le cache partagé
par SIREN (même variante que Découvrir) et RELIT ce qu'un autre espace y a rangé."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.services import provider_cache, public_facts, source_cache
from tests.test_phase1_research import (
    MOCK_BUNDLE_WITH_CONTENT,
    MOCK_PROFILE,
    _claude_side_effect,
    _facts,
    _signals,
    _strategy,
)

_SIREN = MOCK_PROFILE.siren


def _offer(title: str, url: str, source: str) -> dict:
    return {
        "title": title, "date": "2026-10-10", "contractType": "CDI", "url": url,
        "source": source, "location": "Paris", "skills": [], "company": "SNCF",
    }


@pytest.fixture
def rows(monkeypatch: pytest.MonkeyPatch) -> dict[tuple[str, str, str], tuple[Any, datetime]]:
    store: dict[tuple[str, str, str], tuple[Any, datetime]] = {}

    class MemoryStore:
        async def get(self, source: str, category: str, key: str):
            row = store.get((source, category, key))
            return row if row and row[1] > datetime.now(UTC) else None

        async def put(self, source: str, category: str, key: str, payload: Any, ttl_s: int) -> None:
            store[(source, category, key)] = (payload, datetime.now(UTC) + timedelta(seconds=ttl_s))

    async def _store() -> MemoryStore:
        return MemoryStore()

    monkeypatch.setattr(source_cache, "_store", _store)
    monkeypatch.setattr(provider_cache, "_redis", AsyncMock(return_value=None))
    return store


def _run_analysis(client: TestClient, **patched: Any) -> Any:
    base: dict[str, Any] = {
        "research_brave": AsyncMock(return_value=[]),
        "research_pappers": AsyncMock(return_value=MOCK_PROFILE),
        "research_firecrawl": AsyncMock(return_value=MOCK_BUNDLE_WITH_CONTENT),
        "press_signals": AsyncMock(return_value=[]),
        "public_tenders": AsyncMock(return_value=[]),
        "legal_signals": AsyncMock(return_value=[]),
        "it_job_signals": AsyncMock(return_value=[]),
        "it_job_signals_apec": AsyncMock(return_value=[]),
        "it_job_signals_ats": AsyncMock(return_value=[]),
        "it_job_signals_careers": AsyncMock(return_value=[]),
    }
    base.update(patched)
    stack = [patch(f"app.routers.phase1_research.{name}", mock) for name, mock in base.items()]
    stack.append(
        patch(
            "app.routers.phase1_research.call_claude",
            new_callable=AsyncMock,
            side_effect=_claude_side_effect(_facts(), _signals(), _strategy()),
        )
    )
    from contextlib import ExitStack

    with ExitStack() as es:
        for p in stack:
            es.enter_context(p)
        return client.post("/phase/1/research", json={"company_name": "SNCF", "siren": _SIREN})


def _shared_variants(rows: dict) -> set[str]:
    return {key.split("|", 1)[1] for (src, cat, key) in rows if src == "public_facts" and cat == "jobs"}


def test_the_analysis_writes_every_direct_source_under_the_canonical_variant(
    client: TestClient, rows: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    res = _run_analysis(
        client,
        it_job_signals=AsyncMock(return_value=[_offer("Dev Java", "https://ft/1", "france_travail")]),
        it_job_signals_apec=AsyncMock(return_value=[_offer("Architecte", "https://ap/1", "apec")]),
        it_job_signals_ats=AsyncMock(return_value=[_offer("SRE", "https://gh/1", "greenhouse")]),
        it_job_signals_careers=AsyncMock(return_value=[_offer("Data engineer", "https://c/1", "careers")]),
    )
    assert res.status_code == 200, res.text
    written = _shared_variants(rows)
    for source in ("france_travail", "apec", "ats", "careers"):
        assert public_facts.jobs_fact_variant(source, None, True) in written, source


def test_the_analysis_writes_the_aggregator_offers_and_never_an_internship(
    client: TestClient, rows: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("THEIRSTACK_API_KEY", "k")
    ts = [_offer("Développeur Rust", "https://ts/1", "theirstack"), _offer("Stage dev", "https://ts/2", "theirstack")]
    ts[1]["contractType"] = "Stage"
    with (
        patch("app.services.data_sources.job_aggregators.theirstack_jobs", AsyncMock(return_value=ts)),
        patch("app.services.data_sources.job_aggregators.adzuna_jobs", AsyncMock(return_value=[])),
        patch("app.services.data_sources.job_aggregators.jooble_jobs", AsyncMock(return_value=[])),
        patch("app.services.data_sources.job_aggregators.fantastic_jobs", AsyncMock(return_value=[])),
    ):
        res = _run_analysis(client)
    assert res.status_code == 200
    stored = [
        row
        for (src, cat, key), (payload, _) in rows.items()
        if src == "public_facts" and cat == "jobs" and key.endswith("|" + public_facts.jobs_fact_variant("theirstack", None, True))
        for row in payload["rows"]
    ]
    assert [r["title"] for r in stored if "stage" not in r["title"].lower()] == ["Développeur Rust"]


def test_the_analysis_rereads_what_discover_or_another_space_already_stored(
    client: TestClient, rows: dict
) -> None:
    fresh = datetime.now(UTC) + timedelta(days=3)

    def seed(source: str, offers: list[dict]) -> None:
        variant = public_facts.jobs_fact_variant(source, None, True)
        rows[("public_facts", "jobs", f"siren:{_SIREN}|{variant}")] = (
            {"collectedAt": datetime.now(UTC).isoformat(), "rows": offers},
            fresh,
        )

    seed("france_travail", [_offer("Dev Java", "https://ft/1", "france_travail")])
    seed("theirstack", [_offer("Data engineer", "https://ts/1", "theirstack")])
    ft = AsyncMock(return_value=[])
    ts = AsyncMock(return_value=[])
    with patch("app.services.data_sources.job_aggregators.theirstack_jobs", ts):
        res = _run_analysis(client, it_job_signals=ft)
    assert res.status_code == 200, res.text
    ft.assert_not_awaited()
    ts.assert_not_awaited()


def test_a_provider_without_key_never_writes_a_searched_nothing(client: TestClient, rows: dict) -> None:
    """Sans clé, rien n'a été cherché : un vide rangé fermerait la porte, 24 h, à l'espace qui a une clé."""
    res = _run_analysis(client)
    assert res.status_code == 200
    written = _shared_variants(rows)
    for source in ("adzuna", "jooble", "theirstack", "fantastic", "mantiks"):
        assert public_facts.jobs_fact_variant(source, None, True) not in written, source
