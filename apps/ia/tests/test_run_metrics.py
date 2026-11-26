"""Per-run time + cost metrics for every provider.

The pipeline reported one duration per phase and a Claude token cost. Nothing
else was measured, so "the analysis is too long" could not be split into Brave
vs Firecrawl vs Claude vs queueing on our own rate limiter — and "what does a
run cost" only ever answered for Claude.
"""

from __future__ import annotations

import asyncio

import pytest

from app.services import run_metrics


@pytest.fixture(autouse=True)
def _clean():
    yield
    for cid in list(run_metrics._RUNS):
        run_metrics.clear_metrics(cid)


def test_records_a_call() -> None:
    run_metrics.record_call("m1", "brave", duration_ms=1200, wait_ms=300)
    assert run_metrics.get_metrics("m1")["brave"] == {
        "calls": 1,
        "errors": 0,
        "duration_ms": 1200,
        "wait_ms": 300,
        "cost_usd": 0.0,
    }


def test_calls_accumulate_per_provider() -> None:
    for _ in range(7):
        run_metrics.record_call("m2", "firecrawl", duration_ms=1000)
    m = run_metrics.get_metrics("m2")["firecrawl"]
    assert m["calls"] == 7
    assert m["duration_ms"] == 7000


def test_errors_are_counted_separately() -> None:
    run_metrics.record_call("m3", "apollo", duration_ms=10, ok=True)
    run_metrics.record_call("m3", "apollo", duration_ms=10, ok=False)
    m = run_metrics.get_metrics("m3")["apollo"]
    assert m["calls"] == 2 and m["errors"] == 1


def test_wait_is_tracked_apart_from_duration() -> None:
    """A throttle problem and a slow API have opposite remedies — they must not
    collapse into one number."""
    run_metrics.record_call("m4", "claude", duration_ms=2000, wait_ms=8000)
    m = run_metrics.get_metrics("m4")["claude"]
    assert m["duration_ms"] == 2000 and m["wait_ms"] == 8000


def test_cost_can_be_attached_after_the_call() -> None:
    run_metrics.record_call("m5", "claude", duration_ms=100)
    run_metrics.record_cost("m5", "claude", 0.0123)
    m = run_metrics.get_metrics("m5")["claude"]
    assert m["calls"] == 1, "record_cost must not count an extra call"
    assert m["cost_usd"] == pytest.approx(0.0123)


def test_total_cost_sums_every_provider() -> None:
    run_metrics.record_call("m6", "claude", duration_ms=1, cost_usd=0.10)
    run_metrics.record_call("m6", "apollo", duration_ms=1, cost_usd=0.02)
    assert run_metrics.total_cost_usd("m6") == pytest.approx(0.12)


def test_blank_correlation_id_is_a_noop() -> None:
    run_metrics.record_call("", "brave", duration_ms=10)
    assert run_metrics.get_metrics("") == {}


def test_unknown_run_is_empty() -> None:
    assert run_metrics.get_metrics("nope") == {}
    assert run_metrics.total_cost_usd("nope") == 0.0


@pytest.mark.asyncio
async def test_timed_measures_and_marks_success() -> None:
    async with run_metrics.timed("m7", "pappers"):
        await asyncio.sleep(0.02)
    m = run_metrics.get_metrics("m7")["pappers"]
    assert m["duration_ms"] >= 15 and m["errors"] == 0


@pytest.mark.asyncio
async def test_timed_records_and_flags_a_raising_block() -> None:
    with pytest.raises(RuntimeError):
        async with run_metrics.timed("m8", "firecrawl"):
            raise RuntimeError("boom")
    m = run_metrics.get_metrics("m8")["firecrawl"]
    assert m["calls"] == 1 and m["errors"] == 1


def test_provider_count_is_capped() -> None:
    for i in range(run_metrics.MAX_PROVIDERS_PER_RUN + 20):
        run_metrics.record_call("m9", f"p{i}", duration_ms=1)
    assert len(run_metrics.get_metrics("m9")) == run_metrics.MAX_PROVIDERS_PER_RUN


def test_old_runs_are_evicted() -> None:
    for i in range(run_metrics.MAX_TRACKED_RUNS + 5):
        run_metrics.record_call(f"ev-{i}", "brave", duration_ms=1)
    assert len(run_metrics._RUNS) <= run_metrics.MAX_TRACKED_RUNS


def test_summary_is_slowest_first_and_shows_cost_and_waits() -> None:
    run_metrics.record_call("m10", "brave", duration_ms=1000)
    run_metrics.record_call("m10", "firecrawl", duration_ms=55000, wait_ms=3000)
    run_metrics.record_call("m10", "claude", duration_ms=12000, cost_usd=0.25)

    s = run_metrics.summarise("m10")
    assert s.index("firecrawl") < s.index("claude") < s.index("brave")
    assert "wait 3.0s" in s
    assert "$0.25" in s


def test_summary_empty_when_nothing_measured() -> None:
    assert run_metrics.summarise("silent") == ""
