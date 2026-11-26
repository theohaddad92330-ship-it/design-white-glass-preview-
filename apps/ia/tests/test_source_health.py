"""Degraded-source tracking.

The pipeline swallows a failing source in ~99 places (Brave timeout, Firecrawl
timeout, Pappers down, a rate-limit wait exceeded, a classification batch that
raised). Each one silently shrinks the corpus, which is why two runs of the same
company return different facts and a different contact count with no visible
cause. These tests pin the registry that makes that loss reportable.
"""

from __future__ import annotations

from app.services import source_health


def test_record_and_read_back() -> None:
    cid = "cid-basic"
    source_health.clear_degradations(cid)
    source_health.record_degradation(cid, source="brave", reason="timeout 60s")

    entries = source_health.get_degradations(cid)
    assert entries == [{"source": "brave", "reason": "timeout 60s"}]


def test_unknown_run_is_empty() -> None:
    assert source_health.get_degradations("never-seen") == []


def test_blank_correlation_id_is_a_noop() -> None:
    """Some callers (sync/profiler paths) have no correlation id — recording must
    not crash, and must not pollute a shared bucket."""
    source_health.record_degradation("", source="brave", reason="x")
    assert source_health.get_degradations("") == []


def test_duplicate_source_reason_recorded_once() -> None:
    """Firecrawl times out per URL — 7 pages must not emit 7 identical lines."""
    cid = "cid-dupes"
    source_health.clear_degradations(cid)
    for _ in range(5):
        source_health.record_degradation(cid, source="firecrawl", reason="timeout")

    assert source_health.get_degradations(cid) == [{"source": "firecrawl", "reason": "timeout"}]


def test_same_source_different_reasons_both_kept() -> None:
    cid = "cid-multi"
    source_health.clear_degradations(cid)
    source_health.record_degradation(cid, source="pappers", reason="503")
    source_health.record_degradation(cid, source="pappers", reason="siren introuvable")

    assert len(source_health.get_degradations(cid)) == 2


def test_insertion_order_preserved() -> None:
    cid = "cid-order"
    source_health.clear_degradations(cid)
    for name in ("brave", "firecrawl", "pappers"):
        source_health.record_degradation(cid, source=name, reason="down")

    assert [e["source"] for e in source_health.get_degradations(cid)] == [
        "brave",
        "firecrawl",
        "pappers",
    ]


def test_entries_are_capped_per_run() -> None:
    cid = "cid-cap"
    source_health.clear_degradations(cid)
    for i in range(source_health.MAX_ENTRIES_PER_RUN + 25):
        source_health.record_degradation(cid, source=f"s{i}", reason="down")

    assert len(source_health.get_degradations(cid)) == source_health.MAX_ENTRIES_PER_RUN


def test_clear_removes_the_run() -> None:
    cid = "cid-clear"
    source_health.record_degradation(cid, source="brave", reason="timeout")
    source_health.clear_degradations(cid)
    assert source_health.get_degradations(cid) == []


def test_old_runs_are_evicted() -> None:
    """Long-lived worker: the registry must not grow unbounded."""
    for i in range(source_health.MAX_TRACKED_RUNS + 10):
        source_health.record_degradation(f"evict-{i}", source="brave", reason="down")

    assert len(source_health._RUNS) <= source_health.MAX_TRACKED_RUNS
    # The oldest run is gone, the newest survives.
    assert source_health.get_degradations("evict-0") == []
    assert source_health.get_degradations(f"evict-{source_health.MAX_TRACKED_RUNS + 9}")


def test_summary_is_human_readable() -> None:
    cid = "cid-summary"
    source_health.clear_degradations(cid)
    source_health.record_degradation(cid, source="brave", reason="timeout 60s")
    source_health.record_degradation(cid, source="pappers", reason="503")

    summary = source_health.summarise(cid)
    assert "brave" in summary and "pappers" in summary


def test_summary_empty_when_healthy() -> None:
    assert source_health.summarise("healthy-run") == ""
