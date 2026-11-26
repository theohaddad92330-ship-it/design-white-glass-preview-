"""#3704.6 — « donne-moi aussi des besoins » : les demandes actuelles CONNUES sont indiquées par
entreprise (appel d'offres, recrutement — déjà cherchés par le registre sur les premiers rangs),
sans jamais filtrer ; une entreprise sans demande connue reste proposée et l'absence est dite
UNE fois (« pas cherché » ≠ « rien trouvé »), jamais une ligne par entreprise."""

from __future__ import annotations

from typing import Any

import pytest

from app.services.chat_tools import execute_chat_tool
from tests.test_run_account_search_scope import BIJOUTIER, MAISON_LUXE, _candidate, _Response, _stub

THIRD = _candidate("333333333", "ATELIER SOIE", "15.12Z")

TENDER = {"type": "tender", "label": "Refonte du SI RH", "date": "2026-09-20"}
HIRING = {"type": "hiring", "label": "Développeur Java", "date": "2026-10-01", "detail": "CDI · Paris"}
LEGAL = {"type": "legal", "label": "Modification", "date": "2026-09-01"}


async def _run(candidates: list[dict[str, Any]], **extra: Any) -> dict[str, Any]:
    return await execute_chat_tool(
        "run_account_search",
        {"sectors": ["luxury"], "signals": ["tender", "hiring"], **extra},
        user_id="u-1",
        profile_data=None,
    )


@pytest.mark.asyncio
async def test_known_demands_are_listed_per_company_and_nobody_is_dropped(monkeypatch):
    _stub(
        monkeypatch,
        _Response(
            [
                {**MAISON_LUXE, "signalsSearched": True, "signals": [TENDER, HIRING, LEGAL]},
                {**BIJOUTIER, "signalsSearched": True, "signals": []},
                {**THIRD, "signalsSearched": False},
            ]
        ),
    )
    out = await _run([])
    assert [i["name"] for i in out["items"]] == ["MAISON DU CUIR", "ATELIER BIJOU", "ATELIER SOIE"], "jamais un filtre"
    first = out["items"][0]
    # Demande = appel d'offres ou recrutement ; la vie légale n'est pas une demande.
    assert [d["type"] for d in first["current_demands"]] == ["tender", "hiring"]
    assert all(d["date"] for d in first["current_demands"])
    assert "current_demands" not in out["items"][1], "une absence ne fait aucune ligne dans une liste"
    assert "current_demands" not in out["items"][2]
    summary = out["current_demands_summary"]
    assert summary == {"with_known_demand": 1, "searched_none_known": 1, "not_searched": 1}
    assert "pas l'absence de potentiel" in out["current_demands_note"]


@pytest.mark.asyncio
async def test_no_summary_when_needs_were_not_asked(monkeypatch):
    _stub(monkeypatch, _Response([{**MAISON_LUXE, "signalsSearched": True, "signals": [TENDER]}]))
    out = await execute_chat_tool("run_account_search", {"sectors": ["luxury"]}, user_id="u-1", profile_data=None)
    assert "current_demands_summary" not in out


@pytest.mark.asyncio
async def test_needs_note_no_longer_says_the_signals_were_not_consulted(monkeypatch):
    _stub(monkeypatch, _Response([{**MAISON_LUXE, "signalsSearched": True, "signals": [TENDER]}]))
    out = await _run([])
    assert "current_demands" in out["needs_note"]
