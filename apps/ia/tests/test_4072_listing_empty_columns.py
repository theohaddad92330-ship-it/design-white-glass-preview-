"""R46 (/chat, compte réel) — « on n'affiche pas ce qu'on n'a pas » : une colonne vide sur TOUTES les lignes
ne s'affiche pas (Personne / E-mail sur une liste de comptes), et le total annoncé est le nombre de lignes rendues."""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from app.services import record_listing as rl


def _accounts(count: int, read: int) -> dict[str, Any]:
    records = [rl._record(company=f"Société {i}", label="Banque", at=f"2026-10-{i % 28 + 1:02d}") for i in range(count)]
    return rl._fetched(records=records, records_read=read, window_applies=False)


def _run(fetched: dict[str, Any], monkeypatch: pytest.MonkeyPatch, **tool_input: Any) -> dict[str, Any]:
    async def fake(*_a: Any, **_k: Any) -> dict[str, Any]:
        return fetched

    monkeypatch.setattr(rl, "_fetch_accounts", fake)
    monkeypatch.setattr(rl.bellum_api, "is_configured", lambda: True)
    return asyncio.run(rl.run_list_records("u-1", {"source": "accounts", **tool_input}))


def test_columns_empty_on_every_row_are_dropped(monkeypatch: pytest.MonkeyPatch) -> None:
    out = _run(_accounts(84, 82), monkeypatch)
    columns = out["card"]["columns"]
    assert "Personne" not in columns and "E-mail" not in columns
    assert "Société" in columns
    assert all(len(row["cells"]) == len(columns) for row in out["card"]["rows"])


def test_a_column_filled_on_one_row_stays(monkeypatch: pytest.MonkeyPatch) -> None:
    fetched = _accounts(3, 3)
    fetched["records"][1] = rl._record(company="Société 1", person="Marie Durand")
    columns = _run(fetched, monkeypatch)["card"]["columns"]
    assert "Personne" in columns and "E-mail" not in columns


def test_announced_total_is_the_number_of_rendered_rows(monkeypatch: pytest.MonkeyPatch) -> None:
    out = _run(_accounts(84, 82), monkeypatch)
    assert out["rows_total"] == 84
    assert out["records_read"] == 84
    assert out["card"]["note"].startswith("84 éléments lus · 84 lignes")


def test_a_partial_read_keeps_its_larger_announced_total(monkeypatch: pytest.MonkeyPatch) -> None:
    out = _run(_accounts(50, 120), monkeypatch)
    assert out["records_read"] == 120
