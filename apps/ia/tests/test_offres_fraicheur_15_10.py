"""#4182 — des offres de 7 mois remontaient seules : les récentes d'abord, les anciennes seulement à défaut."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.services.dated_signals import prefer_recent_offers


def _d(days: int) -> str:
    return (datetime.now(UTC) - timedelta(days=days)).strftime("%Y-%m-%d")


def test_recent_offers_hide_the_old_ones() -> None:
    old, new = {"title": "old", "date": _d(210)}, {"title": "new", "date": _d(10)}
    assert prefer_recent_offers([old, new]) == [new]


def test_old_offers_kept_when_nothing_is_recent_and_keep_their_date() -> None:
    old = [{"title": "a", "date": _d(210)}, {"title": "b", "date": _d(120)}]
    out = prefer_recent_offers(old)
    assert out == old and out[0]["date"] == old[0]["date"]


def test_undated_offer_counts_as_recent_and_order_is_kept() -> None:
    a, b, c = {"title": "a", "date": _d(5)}, {"title": "b"}, {"title": "c", "date": "pas une date"}
    assert prefer_recent_offers([a, b, c]) == [a, b, c]


def test_empty_and_non_list() -> None:
    assert prefer_recent_offers([]) == []
    assert prefer_recent_offers(None) == []  # type: ignore[arg-type]
