"""Un signal daté du 29, 30 ou 31 garde SON jour.

``_parse_signal_date`` bornait le jour à 28 (``min(28, day)``) : toute date de fin
de mois reculait d'un à trois jours — l'âge d'un signal, son tri et sa fraîcheur
étaient faux, et ``test_discover_hiring_search`` rougissait un jour sur dix
(« il y a 5 jours » tombant un 29). Un jour hors du mois (31/04) se borne au
dernier jour RÉEL du mois, jamais au 28.
"""

from datetime import date

import pytest

from app.services.signal_freshness import _parse_signal_date


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("2026-09-29", date(2026, 9, 29)),
        ("2026-09-30", date(2026, 9, 30)),
        ("2026-10-31", date(2026, 10, 31)),
        ("2028-02-29", date(2028, 2, 29)),  # bissextile
        ("2026-02-30", date(2026, 2, 28)),  # hors du mois → dernier jour réel
        ("2026-04-31", date(2026, 4, 30)),
        ("2026-09-15", date(2026, 9, 15)),
        ("2026-09", date(2026, 9, 1)),
        ("2026", date(2026, 1, 1)),
    ],
)
def test_parse_signal_date_keeps_end_of_month_day(raw: str, expected: date) -> None:
    assert _parse_signal_date(raw) == expected


def test_parse_signal_date_without_year_is_undated() -> None:
    assert _parse_signal_date("hier") is None
