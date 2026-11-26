"""LUD.5 — Laura : « qui recrutent en méthodes / qualité » ne présente comme recruteuse qu'une entreprise
portant une offre DATÉE du métier demandé ; un espace IT garde le comportement d'avant."""

from __future__ import annotations

from typing import Any

import pytest

from app.services.chat_tools import execute_chat_tool
from tests.test_run_account_search_scope import BIJOUTIER, MAISON_LUXE, _candidate, _Response, _stub

THIRD = _candidate("333333333", "ATELIER SOIE", "15.12Z")
METHODES = {"type": "hiring", "label": "Recrutement — Technicien méthodes", "date": "2026-10-10"}
JAVA = {"type": "hiring", "label": "Recrutement — Développeur Java", "date": "2026-10-11"}
TENDER = {"type": "tender", "label": "AO maintenance", "date": "2026-09-20"}
INDUSTRIAL = {"offerDomain": "industrial_engineering"}


def _rows() -> _Response:
    return _Response(
        [
            {**MAISON_LUXE, "signalsSearched": True, "signals": [METHODES, JAVA, TENDER]},
            {**BIJOUTIER, "signalsSearched": True, "signals": [JAVA]},
            {**THIRD, "signalsSearched": False},
        ]
    )


async def _run(profile: dict | None, **extra: Any) -> dict[str, Any]:
    return await execute_chat_tool(
        "run_account_search",
        {"sectors": ["luxury"], "signals": ["hiring"], "offer": "méthodes qualité", **extra},
        user_id="u-1",
        profile_data=profile,
    )


@pytest.mark.asyncio
async def test_only_companies_with_a_dated_offer_of_the_trade_recruit(monkeypatch):
    _stub(monkeypatch, _rows())
    out = await _run(INDUSTRIAL)
    first, second, third = out["items"]
    assert [d["label"] for d in first["current_demands"] if d["type"] == "hiring"] == [
        "Recrutement — Technicien méthodes"
    ], "l'offre Java n'est pas une demande pour ce métier"
    assert all(d["date"] for d in first["current_demands"])
    assert "current_demands" not in second and "current_demands" not in third
    assert out["recruiting_companies"] == [first["name"]]
    assert "Ne présente jamais" in out["recruiting_note"]
    assert out["current_demands_summary"] == {"with_known_demand": 1, "searched_none_known": 1, "not_searched": 1}
    assert [i["name"] for i in out["items"]] == [first["name"], second["name"], third["name"]], "jamais un filtre"


@pytest.mark.asyncio
async def test_signals_searched_is_reported_on_every_row(monkeypatch):
    _stub(monkeypatch, _rows())
    out = await _run(INDUSTRIAL)
    assert [i["signals_searched"] for i in out["items"]] == [True, True, False]


@pytest.mark.asyncio
async def test_it_space_without_trade_keeps_the_historical_listing(monkeypatch):
    # Non-régression IT : pas de métier nommé, pas de pack filtré → toutes les offres sont des demandes.
    _stub(monkeypatch, _rows())
    out = await execute_chat_tool(
        "run_account_search",
        {"sectors": ["luxury"], "signals": ["hiring"]},
        user_id="u-1",
        profile_data={"offerDomain": "esn_it"},
    )
    first = out["items"][0]
    assert [d["label"] for d in first["current_demands"] if d["type"] == "hiring"] == [
        "Recrutement — Technicien méthodes",
        "Recrutement — Développeur Java",
    ]
