"""DISCOVER-OFFRES (15/10, point D) — le semis du cache commun d'offres depuis les analyses déjà faites."""

from __future__ import annotations

import importlib.util
import sys
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.routers import discover as discover_router
from app.services import provider_cache, public_facts, source_cache

_PATH = Path(__file__).resolve().parents[1] / "scripts" / "seed_jobs_cache_from_analyses.py"
_spec = importlib.util.spec_from_file_location("seed_jobs_cache_from_analyses", _PATH)
seed = importlib.util.module_from_spec(_spec)  # type: ignore[arg-type]
sys.modules[_spec.name] = seed  # type: ignore[union-attr]
_spec.loader.exec_module(seed)  # type: ignore[union-attr]

NOW = datetime(2026, 10, 15, 12, 0, tzinfo=UTC)


def _account(days: int, siren: str = "640000001", jobs: list[dict] | None = None, **over: Any) -> dict:
    return {
        "id": f"id-{siren}-{days}",
        "siren": siren,
        "website": None,
        "signals_collected_at": (NOW - timedelta(days=days)).isoformat(),
        "it_job_signals": jobs
        if jobs is not None
        else [
            {"title": "Développeur Java", "city": "Lille", "date": "2026-10-01", "contract_type": "CDI", "url": "https://j/1", "source": "x"},
            {"title": "Stage Data Analyst", "city": "Lille", "date": "2026-10-02", "contract_type": "Stage", "url": "https://j/2", "source": "x"},
        ],
        **over,
    }


class MemoryStore:
    def __init__(self) -> None:
        self.rows: dict[tuple[str, str, str], tuple[Any, datetime]] = {}

    async def get(self, source: str, category: str, key: str):
        row = self.rows.get((source, category, key))
        return None if row is None or row[1] <= datetime.now(UTC) else row

    async def put(self, source: str, category: str, key: str, payload: Any, ttl_s: int) -> None:
        self.rows[(source, category, key)] = (payload, datetime.now(UTC) + timedelta(seconds=ttl_s))


@pytest.fixture
def store(monkeypatch: pytest.MonkeyPatch) -> MemoryStore:
    ms = MemoryStore()
    monkeypatch.setattr(source_cache, "_store", AsyncMock(return_value=ms))
    monkeypatch.setattr(provider_cache, "_redis", AsyncMock(return_value=None))
    return ms


def test_a_10_day_old_account_is_seeded_and_a_40_day_old_one_is_ignored() -> None:
    plan = seed.build_plan([_account(10, "640000001"), _account(40, "640000002")], NOW)
    assert list(plan.entries) == ["siren:640000001"]
    assert plan.skipped_old == 1 and plan.accounts_seeded == 1


def test_internships_are_removed_and_the_contract_is_mapped() -> None:
    (entry,) = seed.build_plan([_account(10)], NOW).entries.values()
    assert [o["title"] for o in entry.rows] == ["Développeur Java"]
    assert entry.rows[0]["contractType"] == "CDI"


def test_the_expiry_is_the_collection_date_plus_30_days() -> None:
    (entry,) = seed.build_plan([_account(10)], NOW).entries.values()
    assert entry.collected_at == NOW - timedelta(days=10)
    assert entry.ttl_s(NOW) == 20 * 24 * 3600


def test_only_public_fields_travel() -> None:
    jobs = [{"title": "Dev", "url": "https://j/1", "workspace_id": "ws-1", "note": "perso", "crm": {"x": 1}}]
    (entry,) = seed.build_plan([_account(5, jobs=jobs)], NOW).entries.values()
    assert set(entry.rows[0]) <= set(seed._FIELDS)
    assert not public_facts._carries_private_data(entry.rows)


def test_company_key_is_the_siren_else_the_domain_else_nothing() -> None:
    plan = seed.build_plan(
        [_account(5, "640000001"), _account(5, "", website="https://www.exemple.fr/x"), _account(5, "", website=None)], NOW
    )
    assert sorted(plan.entries) == ["domain:exemple.fr", "siren:640000001"]
    assert plan.skipped_no_key == 1


def test_two_accounts_of_one_company_merge_without_duplicates() -> None:
    plan = seed.build_plan([_account(5), _account(8)], NOW)
    (entry,) = plan.entries.values()
    assert len(entry.rows) == 1 and entry.collected_at == NOW - timedelta(days=5)


async def _accounts(*rows: dict) -> AsyncIterator[dict]:
    for r in rows:
        yield r


async def test_dry_run_counts_and_writes_nothing(store: MemoryStore, capsys: pytest.CaptureFixture[str]) -> None:
    write = AsyncMock(return_value=0)
    plan = await seed.run(dry_run=True, accounts=lambda: _accounts(_account(10), _account(40, "640000002")), write=write, now=NOW)
    write.assert_not_called()
    assert store.rows == {}
    assert (plan.accounts_seen, len(plan.entries), plan.offers) == (2, 1, 1)
    assert "[dry-run] comptes lus=2 semés=1 entreprises=1 offres=1" in capsys.readouterr().out


async def test_real_run_is_idempotent_and_discover_reads_it_back(store: MemoryStore, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(seed, "datetime", type("D", (datetime,), {"now": classmethod(lambda cls, tz=None: NOW)}))
    for _ in range(2):
        await seed.run(dry_run=False, accounts=lambda: _accounts(_account(10)), now=NOW)
    assert len(store.rows) == 1
    ((_, _, key), (payload, _expiry)) = next(iter(store.rows.items()))
    assert key == "siren:640000001|merged" and payload["collectedAt"] == (NOW - timedelta(days=10)).isoformat()
    # Découvrir RELIT cette variante (sans aucun appel) et applique le tri du vendeur à la lecture.
    peeked = await discover_router._peek_shared_jobs("siren:640000001", "esn_it", False)
    assert [o["title"] for o in peeked["merged"] or []] == ["Développeur Java"]
    assert [o["title"] for o in discover_router._domain_rows(peeked["merged"] or [], pack=None, all_roles=False)] == ["Développeur Java"]


async def test_real_run_refuses_to_run_without_any_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(provider_cache, "cache_available", AsyncMock(return_value=False))
    with pytest.raises(SystemExit):
        await seed.run(dry_run=False, accounts=lambda: _accounts(_account(10)), now=NOW)


def test_the_variant_respects_the_shared_fact_contract() -> None:
    assert public_facts.VARIANT.match(seed.VARIANT)
    assert public_facts.jobs_fact_variant("merged", None, False) == "merged"


def test_the_analysis_rereads_the_merged_fact_before_buying_anything() -> None:
    import inspect

    from app.routers import phase1_research

    source = inspect.getsource(phase1_research)
    assert 'jobs_fact_variant("merged", seller_pack, collect_all_roles)' in source
    # DECATHLON 30/10 — « assez » se compte dans le métier du vendeur (`trade_offer_count`).
    assert "if trade_offer_count(known, trade_terms) >= ENOUGH_OFFERS_FOR_NO_PURCHASE:" in source
