"""#4734 — annuaires French Tech : ce que l'annuaire DIT, rattaché par SIREN, jamais par le seul nom."""

from __future__ import annotations

from datetime import date

import httpx
import pytest

from app.services.data_sources import french_tech as ft

CSV = """Nom;SIREN;Label;Programme;Promotion;Lien
Acme;123 456 789;Next40;French Tech 120;2025;https://annuaire.example/acme
Sans Siren;;Next40;French Tech 120;2025;https://annuaire.example/x
Mauvais;12345;Membre;;;https://annuaire.example/y
Javascript;987654321;Membre;;2024;javascript:alert(1)
"""

JSON_ROWS = [
    {"name": "Acme", "siren": "123456789", "label": "Capital French Tech", "year": 2024, "date": "2026-09-01"},
    {"name": "Nom seul", "label": "Next40"},
]


def test_csv_rows_are_kept_only_with_a_valid_siren() -> None:
    rows = ft.parse_directory(CSV, collected_on=date(2026, 10, 28))
    assert {r["siren"] for r in rows} == {"123456789", "987654321"}  # ni sans SIREN, ni à 5 chiffres


def test_a_row_says_what_the_directory_says_dated_and_linked() -> None:
    acme = next(r for r in ft.parse_directory(CSV, collected_on=date(2026, 10, 28)) if r["siren"] == "123456789")
    assert acme["label"] == "Next40"
    assert acme["programme"] == "French Tech 120"
    assert acme["year"] == "2025"
    assert acme["date"] == "2026-10-28"  # la date de COLLECTE quand l'annuaire n'en porte pas
    assert acme["url"] == "https://annuaire.example/acme"


def test_a_link_that_is_not_http_is_dropped_not_kept() -> None:
    row = next(r for r in ft.parse_directory(CSV, collected_on=date(2026, 10, 28)) if r["siren"] == "987654321")
    assert row["url"] is None


def test_json_directories_are_read_too_and_a_row_without_siren_never_matches_on_name() -> None:
    rows = ft.parse_directory(__import__("json").dumps({"data": JSON_ROWS}), collected_on=date(2026, 10, 28))
    assert [r["siren"] for r in rows] == ["123456789"]
    assert rows[0]["date"] == "2026-09-01"


def test_garbage_is_nothing() -> None:
    assert ft.parse_directory("<html>pas un annuaire", collected_on=date(2026, 10, 28)) == []
    assert ft.parse_directory("", collected_on=date(2026, 10, 28)) == []


def test_the_signal_is_the_label_never_a_funding_nor_a_promise() -> None:
    rows = ft.parse_directory(CSV, collected_on=date(2026, 10, 28))
    signals = ft.signals_for("123 456 789", rows, today=date(2026, 10, 28))
    assert len(signals) == 1
    s = signals[0]
    assert s["type"] == "ecosystem"
    assert "Next40" in s["label"] and "2025" in s["label"]
    assert s["url"] == "https://annuaire.example/acme"
    assert "french tech" not in s["detail"].lower()  # aucune source nommée à l'écran
    text = (s["label"] + s["detail"]).lower()
    assert "levée" not in text and "prometteu" not in text


def test_a_company_absent_from_the_directories_has_no_line() -> None:
    rows = ft.parse_directory(CSV, collected_on=date(2026, 10, 28))
    assert ft.signals_for("555555555", rows, today=date(2026, 10, 28)) == []
    assert ft.signals_for("", rows, today=date(2026, 10, 28)) == []


def test_an_old_label_becomes_unknown_it_does_not_vanish() -> None:
    rows = ft.parse_directory(CSV, collected_on=date(2023, 1, 5))
    signals = ft.signals_for("123456789", rows, today=date(2026, 10, 28))
    assert len(signals) == 1
    assert signals[0]["status"] == "unknown"
    assert signals[0]["date"] == "2023-01-05"


def test_fresh_label_is_known() -> None:
    rows = ft.parse_directory(CSV, collected_on=date(2026, 10, 1))
    assert ft.signals_for("123456789", rows, today=date(2026, 10, 28))[0]["status"] == "known"


async def test_no_directory_configured_is_a_strict_no_op(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("FRENCH_TECH_DIRECTORY_URLS", raising=False)
    assert ft.configured_directories() == []
    assert await ft.french_tech_signals("123456789") == []


async def test_a_configured_directory_is_read_once_for_many_companies(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(
        "FRENCH_TECH_DIRECTORY_URLS", "https://annuaire.example/a.csv, ftp://nope, https://annuaire.example/b.csv"
    )
    monkeypatch.setenv("SOURCE_CACHE_DISABLED", "1")
    ft._memory.clear()
    hits: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        hits.append(str(request.url))
        return httpx.Response(200, text=CSV if request.url.path.endswith("a.csv") else "")

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    import asyncio

    out = await asyncio.gather(*[ft.french_tech_signals("123456789", client=client) for _ in range(4)])
    assert sorted(set(hits)) == ["https://annuaire.example/a.csv", "https://annuaire.example/b.csv"]
    assert len(hits) == 2  # un fil, une lecture, même sous quatre appels simultanés
    assert all(len(o) == 1 for o in out)


# --- #4734.1/.2 — une date partielle reste partielle ; l'automatique plafonne à la RÉGION -------------------------

PARTIAL = """SIREN;Label;Date
111111111;Next40;2026
222222222;Capital French Tech;2026-03
333333333;Membre;2026-03-12
"""


def test_a_partial_published_date_stays_partial_and_is_never_completed() -> None:
    rows = {r["siren"]: r for r in ft.parse_directory(PARTIAL, collected_on=date(2026, 10, 28))}
    assert rows["111111111"]["date"] == "2026"  # pas « 2026-01-01 », pas « 2026-12-31 », pas la date de collecte
    assert rows["222222222"]["date"] == "2026-03"
    assert rows["333333333"]["date"] == "2026-03-12"


def test_a_partial_date_reaches_the_signal_as_published_and_is_judged_on_its_whole_period() -> None:
    rows = ft.parse_directory(PARTIAL, collected_on=date(2026, 10, 28))
    s = ft.signals_for("111111111", rows, today=date(2026, 10, 28))[0]
    assert s["date"] == "2026" and s["status"] == "known"
    old = ft.parse_directory("SIREN;Label;Date\n111111111;Next40;2023\n", collected_on=date(2026, 10, 28))
    assert ft.signals_for("111111111", old, today=date(2026, 10, 28))[0]["status"] == "unknown"


def test_regional_directories_are_declared_with_their_region_and_national_ones_without() -> None:
    import os

    os.environ["FRENCH_TECH_DIRECTORY_URLS"] = "https://n.example/a.csv, 53@https://r.example/b.csv"
    try:
        assert ft.configured_directories() == ["https://n.example/a.csv"]  # sans région connue : national seul
        assert ft.configured_directories(region="53") == ["https://n.example/a.csv", "https://r.example/b.csv"]
        assert ft.configured_directories(region="11") == ["https://n.example/a.csv"]  # jamais la France entière
    finally:
        del os.environ["FRENCH_TECH_DIRECTORY_URLS"]


async def test_a_regional_directory_of_another_region_is_never_fetched(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FRENCH_TECH_DIRECTORY_URLS", "53@https://r.example/bretagne.csv, 11@https://r.example/idf.csv")
    monkeypatch.setenv("SOURCE_CACHE_DISABLED", "1")
    ft._memory.clear()
    hits: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        hits.append(str(request.url))
        return httpx.Response(200, text=CSV)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    assert await ft.french_tech_signals("123456789", client=client) == []
    assert hits == []  # aucune région connue : zéro réseau
    out = await ft.french_tech_signals("123456789", client=client, region="53")
    assert hits == ["https://r.example/bretagne.csv"] and len(out) == 1
