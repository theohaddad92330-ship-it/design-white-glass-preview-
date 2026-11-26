"""Phase 1 must report which sources it lost, and why.

`_derive_source_health` used to infer health from item counts alone, and only
for brave / firecrawl / pappers. The five dated-signal feeds and the Data
Gateway could each disappear from the prompt with nothing anywhere recording it
— so a run built on a thinner corpus looked identical to a complete one. That is
the observable half of "les analyses ne sont pas constantes".
"""

from __future__ import annotations

import pytest

from app.models.agent_envelope import SourceHealth
from app.routers.phase1_research import _derive_source_health, _warnings_from_health
from app.services import source_health as registry


@pytest.fixture(autouse=True)
def _clean() -> None:
    registry.clear_degradations("cid-test")
    yield
    registry.clear_degradations("cid-test")


_HEALTHY_METRICS = {"brave_results_count": 12, "firecrawl_pages_scraped": 5, "pappers_siren": "123456789"}


def test_healthy_run_reports_everything_ok() -> None:
    health = _derive_source_health(_HEALTHY_METRICS, "cid-test")
    assert health["brave"] == SourceHealth.OK
    assert health["firecrawl"] == SourceHealth.OK
    assert health["pappers"] == SourceHealth.OK
    assert _warnings_from_health(health, "cid-test") == []


def test_a_recorded_failure_marks_the_source_down() -> None:
    registry.record_degradation("cid-test", source="firecrawl", reason="timeout 180s")
    health = _derive_source_health(_HEALTHY_METRICS, "cid-test")
    # Counts said "ok" (5 cached pages came back) — the recorded failure wins.
    assert health["firecrawl"] == SourceHealth.DOWN


def test_dated_signal_sources_surface_even_though_metrics_ignore_them() -> None:
    registry.record_degradation("cid-test", source="france_travail", reason="503")
    registry.record_degradation("cid-test", source="decp", reason="timeout")

    health = _derive_source_health(_HEALTHY_METRICS, "cid-test")
    assert health["france_travail"] == SourceHealth.DOWN
    assert health["decp"] == SourceHealth.DOWN


def test_warning_carries_the_recorded_reason() -> None:
    registry.record_degradation("cid-test", source="brave", reason="timeout 60s")
    health = _derive_source_health({"firecrawl_pages_scraped": 5, "pappers_siren": "1"}, "cid-test")

    warnings = _warnings_from_health(health, "cid-test")
    brave = next(w for w in warnings if w.context["source"] == "brave")
    assert "timeout 60s" in brave.message
    assert brave.context["reason"] == "timeout 60s"


def test_warning_without_a_recorded_reason_stays_clean() -> None:
    """Count-derived 'down' has no cause to report — no empty parentheses."""
    health = _derive_source_health({"brave_results_count": 0, "firecrawl_pages_scraped": 5, "pappers_siren": "1"}, "cid-test")
    brave = next(w for w in _warnings_from_health(health, "cid-test") if w.context["source"] == "brave")
    assert "(" not in brave.message
    assert "reason" not in brave.context


def test_every_recorded_source_has_a_user_facing_message() -> None:
    """A source that degrades but has no template would be silently swallowed
    again — defeating the point."""
    for name in ("brave", "firecrawl", "pappers", "brave_news", "france_travail",
                 "bodacc", "boamp", "decp", "data_gateway", "classify_batch"):
        registry.clear_degradations("cid-test")
        registry.record_degradation("cid-test", source=name, reason="down")
        health = _derive_source_health(_HEALTHY_METRICS, "cid-test")
        warnings = _warnings_from_health(health, "cid-test")
        assert any(w.context["source"] == name for w in warnings), f"{name} has no warning template"


def test_degradations_do_not_leak_between_runs() -> None:
    registry.record_degradation("cid-other", source="brave", reason="timeout")
    health = _derive_source_health(_HEALTHY_METRICS, "cid-test")
    assert health["brave"] == SourceHealth.OK
    registry.clear_degradations("cid-other")
