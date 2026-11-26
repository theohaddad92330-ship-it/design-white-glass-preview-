"""C5 — Postgres cache of PUBLIC per-company source data.

Covers: hit/miss counting, expiry, write-through via provider_cache, the
SOURCE_CACHE_DISABLED break-glass, the fresh-re-run (< 1 h) bypass, the
public-data-only guarantees (reserved run stamp, empty stamp payload), and
the SQL shape of the Postgres store (idempotent DDL, upsert, expiry filter).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from app.services import provider_cache, scrape_cache, source_cache


class MemoryStore:
    """In-memory stand-in for ``_PgStore`` honouring the same contract:
    ``get`` returns fresh (payload, expires_at) or None; ``put`` upserts."""

    def __init__(self) -> None:
        self.rows: dict[tuple[str, str, str], tuple[Any, datetime]] = {}
        self.puts: list[tuple[str, str, str]] = []

    async def get(self, source: str, category: str, key: str):
        row = self.rows.get((source, category, key))
        if row is None:
            return None
        payload, expires_at = row
        if expires_at <= datetime.now(UTC):
            return None
        return payload, expires_at

    async def put(self, source: str, category: str, key: str, payload: Any, ttl_s: int) -> None:
        self.rows[(source, category, key)] = (payload, datetime.now(UTC) + timedelta(seconds=ttl_s))
        self.puts.append((source, category, key))


@pytest.fixture
def store(monkeypatch) -> MemoryStore:
    ms = MemoryStore()

    async def _fake_store():
        return ms

    monkeypatch.setattr(source_cache, "_store", _fake_store)
    return ms


@pytest.fixture
def no_redis(monkeypatch):
    """Force the Redis tier off so tests exercise the Postgres tier alone."""
    monkeypatch.setattr(provider_cache, "_redis", AsyncMock(return_value=None))
    monkeypatch.setattr(scrape_cache, "_redis", AsyncMock(return_value=None))


# ── Namespace → (source, category) mapping ───────────────────────────────────


def test_split_namespace_known_and_unknown():
    assert source_cache.split_namespace("jobs:apec") == ("apec", "jobs")
    assert source_cache.split_namespace("pappers:company") == ("pappers", "company")
    assert source_cache.split_namespace("bodacc:signals") == ("bodacc", "legal")
    assert source_cache.split_namespace("scrape:firecrawl") == ("firecrawl", "scrape")
    # Unknown namespaces store verbatim (source=namespace, no category).
    assert source_cache.split_namespace("something:new") == ("something:new", "")


# ── Roundtrip / expiry / counters ────────────────────────────────────────────


async def test_get_put_roundtrip_and_counters(store: MemoryStore):
    await source_cache.begin_run(account_id="", company="Doctolib")
    assert await source_cache.get("jobs:apec", "doctolib") is None  # cold

    await source_cache.put("jobs:apec", "doctolib", [{"title": "Dev"}], 3600)
    entry = await source_cache.get("jobs:apec", "doctolib")
    assert entry is not None
    payload, remaining = entry
    assert payload == [{"title": "Dev"}]
    assert 0 < remaining <= 3600
    # Rows land under the mapped (source, category) columns, keyed by company.
    assert ("apec", "jobs", "doctolib") in store.rows


async def test_expired_row_is_a_miss(store: MemoryStore):
    store.rows[("apec", "jobs", "doctolib")] = (
        [{"title": "Dev"}],
        datetime.now(UTC) - timedelta(seconds=5),
    )
    assert await source_cache.get("jobs:apec", "doctolib") is None


async def test_empty_key_or_none_payload_never_stored(store: MemoryStore):
    await source_cache.put("jobs:apec", "", [{"x": 1}], 60)
    await source_cache.put("jobs:apec", "doctolib", None, 60)
    assert store.rows == {}
    assert await source_cache.get("jobs:apec", "") is None


def test_hit_and_miss_counters_and_savings():
    ctx_stats = source_cache._fresh_stats()
    token = source_cache._run_stats.set(ctx_stats)
    try:
        source_cache.record_hit("pappers:company")
        source_cache.record_hit("jobs:apec")  # free source → 0 €
        source_cache.record_miss("news:brave")
        stats = source_cache.run_stats()
    finally:
        source_cache._run_stats.reset(token)
    assert stats["hits"] == {"pappers": 1, "apec": 1}
    assert stats["misses"] == {"brave_news": 1}
    assert stats["hit_count"] == 2 and stats["miss_count"] == 1
    assert stats["estimated_saved_eur"] == pytest.approx(0.02)
    assert stats["bypassed"] is False


def test_run_stats_without_open_run_is_zeroed():
    stats = source_cache.run_stats()
    assert stats == {
        "hits": {},
        "misses": {},
        "hit_count": 0,
        "miss_count": 0,
        "estimated_saved_eur": 0.0,
        "bypassed": False,
    }


# ── Write-through via provider_cache (the collector's wiring point) ──────────


async def test_provider_cache_writes_through_and_hits_postgres(store: MemoryStore, no_redis):
    await source_cache.begin_run(account_id="", company="SNCF")
    calls = 0

    async def fetch():
        nonlocal calls
        calls += 1
        return {"siren": "552049447"}

    first = await provider_cache.cached_json("pappers:company", "sncf", fetch, ttl=60)
    second = await provider_cache.cached_json("pappers:company", "sncf", fetch, ttl=60)
    assert first == second == {"siren": "552049447"}
    assert calls == 1  # miss → live fetch → write-through; then a durable hit
    assert ("pappers", "company", "sncf") in store.rows

    stats = source_cache.run_stats()
    assert stats["misses"] == {"pappers": 1}
    assert stats["hits"] == {"pappers": 1}
    assert stats["estimated_saved_eur"] == pytest.approx(0.02)


async def test_provider_cache_postgres_hit_backfills_redis(store: MemoryStore, monkeypatch):
    """A durable (L2) hit repopulates Redis (L1) with the REMAINING ttl so the
    Redis copy can never outlive the Postgres expiry."""

    class FakeRedis:
        def __init__(self) -> None:
            self.store: dict[str, str] = {}
            self.last_ex: int | None = None

        async def get(self, key: str):
            return self.store.get(key)

        async def set(self, key: str, value: str, ex: int | None = None):
            self.store[key] = value
            self.last_ex = ex

    fake = FakeRedis()
    monkeypatch.setattr(provider_cache, "_redis", AsyncMock(return_value=fake))
    store.rows[("pappers", "company", "sncf")] = (
        {"siren": "552049447"},
        datetime.now(UTC) + timedelta(seconds=120),
    )
    assert await provider_cache.get_json("pappers:company", "sncf") == {"siren": "552049447"}
    assert fake.store  # backfilled
    assert fake.last_ex is not None and fake.last_ex <= 120


async def test_scrape_cache_uses_postgres_tier(store: MemoryStore, no_redis):
    await source_cache.begin_run(account_id="", company="Doctolib")
    url = "https://doctolib.fr/about"
    assert await scrape_cache.get_markdown(url) is None  # cold → miss counted
    await scrape_cache.set_markdown(url, "# Doctolib")
    assert await scrape_cache.get_markdown(url) == "# Doctolib"
    assert ("firecrawl", "scrape", url) in store.rows

    stats = source_cache.run_stats()
    assert stats["hits"] == {"firecrawl": 1}
    assert stats["misses"] == {"firecrawl": 1}
    assert stats["estimated_saved_eur"] == pytest.approx(0.01)


# ── Break-glass kill switch ──────────────────────────────────────────────────


async def test_kill_switch_disables_reads_and_writes(store: MemoryStore, no_redis, monkeypatch):
    monkeypatch.setenv("SOURCE_CACHE_DISABLED", "true")
    await source_cache.begin_run(account_id="acc-1", company="SNCF")
    calls = 0

    async def fetch():
        nonlocal calls
        calls += 1
        return {"v": calls}

    assert await provider_cache.cached_json("pappers:company", "sncf", fetch, ttl=60) == {"v": 1}
    assert await provider_cache.cached_json("pappers:company", "sncf", fetch, ttl=60) == {"v": 2}
    assert calls == 2  # every call goes live
    assert store.rows == {} and store.puts == []  # nothing written, no run stamp
    stats = source_cache.run_stats()
    assert stats["hit_count"] == 0 and stats["miss_count"] == 0  # silent when off


# ── Fresh-re-run bypass (< 1 h) ──────────────────────────────────────────────


async def test_rerun_within_window_bypasses_reads_but_still_writes(store: MemoryStore, no_redis):
    # LOT (15/10) DATA-A point 3 — le contournement ne vaut que pour les sources GRATUITES (BODACC ici).
    # First run of the account: stamps it, no bypass.
    await source_cache.begin_run(account_id="acc-42", company="SNCF")
    assert source_cache.reads_bypassed() is False
    # #3989.10 — la clé du tampon est l'ENTREPRISE seule : jamais l'account_id client.
    assert ("__run__", "rerun", "co:sncf") in store.rows
    assert not any("acc-42" in k[2] for k in store.rows)

    await source_cache.put("bodacc:signals", "sncf", {"siren": "552049447"}, 3600)

    # Re-run of the SAME account < 1 h → the user wants fresh data.
    await source_cache.begin_run(account_id="acc-42", company="SNCF")
    assert source_cache.reads_bypassed() is True

    calls = 0

    async def fetch():
        nonlocal calls
        calls += 1
        return {"siren": "552049447", "fresh": True}

    got = await provider_cache.cached_json("bodacc:signals", "sncf", fetch, ttl=3600)
    assert calls == 1  # cached value ignored — live fetch despite a fresh row
    assert got["fresh"] is True
    # Write-through still refreshed the shared cache for everyone else.
    assert store.rows[("bodacc", "legal", "sncf")][0]["fresh"] is True
    assert source_cache.run_stats()["bypassed"] is True


async def test_rerun_never_repays_a_paid_source(store: MemoryStore, no_redis):
    # LOT (15/10) DATA-A point 3 — Pappers (crédits), Firecrawl (page), Brave : une relance < 1 h
    # est servie du cache 30 j, jamais repayée. Un namespace INCONNU est payant par défaut.
    await source_cache.begin_run(account_id="acc-42", company="SNCF")
    await source_cache.put("pappers:company", "sncf", {"siren": "552049447"}, 3600)
    await source_cache.put("scrape:firecrawl", "u", {"md": "x"}, 3600)
    await source_cache.put("jobs:theirstack", "sncf", {"n": 1}, 3600)
    await source_cache.begin_run(account_id="acc-42", company="SNCF")
    assert source_cache.reads_bypassed() is True  # le run reste marqué « relance »

    async def live():
        raise AssertionError("appel payant repartant sur une relance < 1 h")

    assert await provider_cache.cached_json("pappers:company", "sncf", live, ttl=3600) == {"siren": "552049447"}
    assert await provider_cache.cached_json("jobs:theirstack", "sncf", live, ttl=3600) == {"n": 1}
    assert await provider_cache.cached_json("inconnu:paye", "k", lambda: _const({"a": 1}), ttl=60) == {"a": 1}
    assert source_cache.reads_bypassed_for("pappers:company") is False
    assert source_cache.reads_bypassed_for("inconnu:paye") is False
    assert source_cache.reads_bypassed_for("bodacc:signals") is True
    assert source_cache.reads_bypassed_for("registry:recherche_entreprises") is True


async def _const(value):
    return value


async def test_rerun_after_window_is_not_bypassed(store: MemoryStore):
    store.rows[("__run__", "rerun", "acc-42")] = ({}, datetime.now(UTC) - timedelta(seconds=5))
    await source_cache.begin_run(account_id="acc-42", company="SNCF")
    assert source_cache.reads_bypassed() is False


async def test_different_company_is_not_bypassed(store: MemoryStore):
    # #3989.10 — la clé est l'entreprise : une AUTRE entreprise n'est jamais une relance.
    await source_cache.begin_run(account_id="acc-1", company="SNCF")
    await source_cache.begin_run(account_id="acc-1", company="RATP")
    assert source_cache.reads_bypassed() is False


# ── Public-data-only guarantees ──────────────────────────────────────────────


async def test_run_stamp_is_reserved_and_payload_empty(store: MemoryStore):
    await source_cache.begin_run(account_id="acc-9", company="SNCF")
    payload, _ = store.rows[("__run__", "rerun", "co:sncf")]
    assert payload == {}  # only "this company ran at fetched_at" — no user data
    # The reserved family is unreachable through the public get/put.
    assert await source_cache.get("__run__", "co:sncf") is None
    await source_cache.put("__run__", "co:sncf", {"leak": True}, 60)
    assert store.rows[("__run__", "rerun", "co:sncf")][0] == {}


async def test_store_errors_degrade_to_live_fetch(monkeypatch, no_redis):
    class BoomStore:
        async def get(self, *_a):
            raise RuntimeError("pg down")

        async def put(self, *_a):
            raise RuntimeError("pg down")

    async def _fake_store():
        return BoomStore()

    monkeypatch.setattr(source_cache, "_store", _fake_store)
    await source_cache.begin_run(account_id="acc-1", company="X")  # must not raise
    assert await source_cache.get("jobs:apec", "x") is None
    await source_cache.put("jobs:apec", "x", [{"a": 1}], 60)  # must not raise

    async def fetch():
        return [{"live": True}]

    assert await provider_cache.cached_json("jobs:apec", "x", fetch, ttl=60) == [{"live": True}]


async def test_no_store_configured_is_a_noop(monkeypatch):
    monkeypatch.delenv("SOURCE_CACHE_PG_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setattr(source_cache, "_store_obj", None)
    await source_cache.begin_run(account_id="acc-1", company="X")
    assert await source_cache.get("jobs:apec", "x") is None
    await source_cache.put("jobs:apec", "x", [{"a": 1}], 60)  # silent no-op


# ── Postgres store SQL shape (no live PG needed) ─────────────────────────────


class FakeCursor:
    def __init__(self, row=None) -> None:
        self._row = row

    async def fetchone(self):
        return self._row


class FakeConn:
    closed = False

    def __init__(self) -> None:
        self.executed: list[tuple[str, tuple | None]] = []

    async def execute(self, sql: str, params: tuple | None = None):
        self.executed.append((" ".join(sql.split()), params))
        return FakeCursor()

    async def close(self):
        self.closed = True


async def test_pg_store_runs_idempotent_ddl_once_and_upserts(monkeypatch):
    conn = FakeConn()

    async def _fake_connect(url: str):
        return conn

    monkeypatch.setattr(source_cache, "_connect", _fake_connect)
    pg = source_cache._PgStore("postgresql://example/db")

    await pg.put("pappers", "company", "sncf", {"siren": "552049447"}, 3600)
    await pg.get("pappers", "company", "sncf")

    sqls = [sql for sql, _ in conn.executed]
    assert any(s.startswith("CREATE TABLE IF NOT EXISTS source_cache") for s in sqls)
    assert any("CREATE INDEX IF NOT EXISTS source_cache_expires_at_idx" in s for s in sqls)
    assert sum(s.startswith("CREATE TABLE") for s in sqls) == 1  # DDL ran once
    upsert = next(s for s in sqls if s.startswith("INSERT INTO source_cache"))
    assert "ON CONFLICT (source, category, company_key)" in upsert
    select = next(s for s in sqls if s.startswith("SELECT payload"))
    assert "expires_at > now()" in select  # expiry enforced server-side


async def test_pg_store_resets_connection_on_error(monkeypatch):
    conns: list[Any] = []

    class FlakyConn(FakeConn):
        async def execute(self, sql: str, params: tuple | None = None):
            await super().execute(sql, params)
            if params is not None:  # DDL passes, the parametrised op blows up
                raise RuntimeError("connection dropped")
            return FakeCursor()

    async def _fake_connect(url: str):
        conn = FlakyConn()
        conns.append(conn)
        return conn

    monkeypatch.setattr(source_cache, "_connect", _fake_connect)
    pg = source_cache._PgStore("postgresql://example/db")
    with pytest.raises(RuntimeError):
        await pg.get("pappers", "company", "sncf")
    assert conns[0].closed  # broken connection was closed…
    with pytest.raises(RuntimeError):
        await pg.get("pappers", "company", "sncf")
    assert len(conns) == 2  # …and the next op reconnected


# ── Metrics injection (phase 1 collector) ────────────────────────────────────


async def test_begin_run_before_task_fanout_shares_stats_with_children(store: MemoryStore, no_redis):
    """The collector fans out sources with asyncio.create_task AFTER begin_run:
    child tasks must share (not copy) the run counters."""
    import asyncio

    await source_cache.begin_run(account_id="", company="SNCF")

    async def child():
        source_cache.record_hit("pappers:company")

    await asyncio.create_task(child())
    assert source_cache.run_stats()["hits"] == {"pappers": 1}


def test_phase1_metrics_expose_source_cache_stats(client):
    from tests.test_phase1_research import (
        MOCK_BRAVE_RESULTS,
        MOCK_BUNDLE_WITH_CONTENT,
        MOCK_PROFILE,
        _claude_side_effect,
        _facts,
        _signals,
        _strategy,
    )

    with (
        patch("app.routers.phase1_research.research_brave", new_callable=AsyncMock, return_value=MOCK_BRAVE_RESULTS),
        patch("app.routers.phase1_research.research_pappers", new_callable=AsyncMock, return_value=MOCK_PROFILE),
        patch(
            "app.routers.phase1_research.research_firecrawl",
            new_callable=AsyncMock,
            return_value=MOCK_BUNDLE_WITH_CONTENT,
        ),
        patch(
            "app.routers.phase1_research.call_claude",
            new_callable=AsyncMock,
            side_effect=_claude_side_effect(_facts(), _signals(), _strategy()),
        ),
    ):
        res = client.post("/phase/1/research", json={"company_name": "SNCF"})

    assert res.status_code == 200, res.text
    sc = res.json()["data"]["_api_metrics"]["source_cache"]
    assert set(sc) == {"hits", "misses", "hit_count", "miss_count", "estimated_saved_eur", "bypassed"}
    assert sc["bypassed"] is False


async def test_rerun_stamp_is_shared_across_accounts_and_reads_legacy_key(store: MemoryStore, no_redis):
    # #3989.10 — le MÊME nom d'entreprise relancé par un AUTRE espace < 1 h est une relance :
    # la clé ne porte plus l'account_id. L'ancienne forme (clé = account_id) reste lue.
    await source_cache.begin_run(account_id="acc-1", company="  SNCF ")
    assert source_cache.reads_bypassed() is False
    await source_cache.begin_run(account_id="acc-2", company="sncf")
    assert source_cache.reads_bypassed() is True
    # Transition : un tampon écrit à l'ancienne (account_id) bloque encore la lecture.
    store.rows[("__run__", "rerun", "acc-9")] = ({}, datetime.now(UTC) + timedelta(hours=1))
    await source_cache.begin_run(account_id="acc-9", company="Autre SA")
    assert source_cache.reads_bypassed() is True
