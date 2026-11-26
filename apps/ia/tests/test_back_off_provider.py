"""``rate_limiter.back_off_provider`` — le câblage PARTAGÉ entre tous les
fournisseurs pour un 429, généralisé depuis
``data_sources/recherche_entreprises._back_off_from`` (le seul appelant de
``ProviderThrottle.back_off`` avant ce lot).

Comportemental (parsing de ``retry_after``, défaut, plancher) — la couverture
PAR SITE D'APPEL (qui l'appelle, qui ne l'appelle pas) vit dans
``test_provider_429_backoff_wiring.py`` (GA-299). ``retry_after`` suit la même
règle que le patron existant : une valeur numérique de secondes est respectée,
une date HTTP (ou son absence) retombe sur ``default_seconds`` — mal lire une
date produirait une attente absurde.
"""

from __future__ import annotations

import time

import pytest

from app.services import rate_limiter


@pytest.fixture(autouse=True)
def _clean_throttles():
    rate_limiter._reset_cache_for_tests()
    yield
    rate_limiter._reset_cache_for_tests()


@pytest.mark.asyncio
async def test_numeric_retry_after_header_is_honoured() -> None:
    rate_limiter.back_off_provider("test_prov_numeric", "45")
    throttle = rate_limiter.get_throttle("test_prov_numeric")
    assert throttle._cooldown_until - time.monotonic() > 40


@pytest.mark.asyncio
async def test_missing_retry_after_falls_back_to_the_default() -> None:
    rate_limiter.back_off_provider("test_prov_missing", None, default_seconds=12.0)
    throttle = rate_limiter.get_throttle("test_prov_missing")
    remaining = throttle._cooldown_until - time.monotonic()
    assert 10.0 < remaining <= 12.0


@pytest.mark.asyncio
async def test_a_retry_after_date_falls_back_instead_of_waiting_absurdly() -> None:
    rate_limiter.back_off_provider(
        "test_prov_date", "Wed, 21 Oct 2026 07:28:00 GMT", default_seconds=20.0
    )
    throttle = rate_limiter.get_throttle("test_prov_date")
    remaining = throttle._cooldown_until - time.monotonic()
    assert 15.0 < remaining <= 20.0


@pytest.mark.asyncio
async def test_a_numeric_seconds_value_is_accepted_directly() -> None:
    # GitHub gives an absolute reset EPOCH, not a Retry-After string — the
    # caller computes seconds-from-now itself and passes a float/int.
    rate_limiter.back_off_provider("test_prov_float", 5.0)
    throttle = rate_limiter.get_throttle("test_prov_float")
    remaining = throttle._cooldown_until - time.monotonic()
    assert 4.0 < remaining <= 5.0


@pytest.mark.asyncio
async def test_default_seconds_has_a_sane_fallback_when_unspecified() -> None:
    rate_limiter.back_off_provider("test_prov_default", None)
    throttle = rate_limiter.get_throttle("test_prov_default")
    remaining = throttle._cooldown_until - time.monotonic()
    assert remaining > 0
