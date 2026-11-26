"""#4362.3 — la définition BellumAI de la taille : TPE < 10 · PME 10-249 · ETI 250-999 · GC ≥ 1 000.

Les mêmes bornes que `apps/web/src/features/discover/lib/discover-size-bounds.ts` : une taille ne se
définit pas deux fois (GA-26), et jamais avec les seuils INSEE (ETI < 5 000, GE ≥ 5 000).
"""

import pytest

from app.services.discover_scoring import (
    SIZE_ETI_MAX,
    SIZE_GC_MIN,
    SIZE_PME_MAX,
    SIZE_PME_MIN,
    SIZE_TPE_MAX,
    _range_for_target_type,
    size_band_for_headcount,
)


@pytest.mark.parametrize(
    ("headcount", "band"),
    [(9, "TPE"), (10, "PME"), (249, "PME"), (250, "ETI"), (999, "ETI"), (1000, "GC"), (4999, "GC"), (5000, "GC")],
)
def test_the_four_bounds(headcount: int, band: str) -> None:
    assert size_band_for_headcount(headcount) == band


@pytest.mark.parametrize("headcount", [None, 0, -3])
def test_no_headcount_means_no_band(headcount: int | None) -> None:
    # Sait dire NON : un effectif absent ou nul n'a aucune taille — on n'invente pas.
    assert size_band_for_headcount(headcount) is None


def test_named_constants_are_the_decided_bounds() -> None:
    assert (SIZE_TPE_MAX, SIZE_PME_MIN, SIZE_PME_MAX, SIZE_ETI_MAX, SIZE_GC_MIN) == (9, 10, 249, 999, 1000)


def test_a_key_account_target_starts_at_one_thousand_not_five_thousand() -> None:
    assert _range_for_target_type("Grands comptes") == (1000, None)
