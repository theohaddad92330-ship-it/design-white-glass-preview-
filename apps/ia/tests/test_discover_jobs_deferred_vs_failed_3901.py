"""#3901 — une collecte d'offres DIFFÉRÉE par notre limiteur n'est pas une source tombée."""

from __future__ import annotations

from app.routers.discover import _jobs_failure_reason
from app.services import source_health
from app.services.company_filters import DegradeReason


def _noted(*codes: str) -> list[str]:
    with source_health.watch_fetch_errors() as errors:
        for code in codes:
            source_health.note_fetch_error("x", code)
    return list(errors)


def test_limiter_wait_only_is_deferred() -> None:
    assert _jobs_failure_reason(_noted(DegradeReason.TIME_BUDGET)) == DegradeReason.TIME_BUDGET


def test_a_real_status_error_wins_over_a_deferral() -> None:
    errors = _noted(DegradeReason.TIME_BUDGET, DegradeReason.UPSTREAM_ERROR)
    assert _jobs_failure_reason(errors) == DegradeReason.UPSTREAM_ERROR


def test_uncoded_error_is_not_guessed_as_deferred() -> None:
    assert _jobs_failure_reason(_noted("")) == DegradeReason.NETWORK_ERROR


def test_fetch_error_stays_a_plain_string() -> None:
    assert _noted(DegradeReason.RATE_LIMITED) == ["x"]
