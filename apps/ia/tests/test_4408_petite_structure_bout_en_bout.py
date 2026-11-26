"""#4408 (recette prod 26/10) — la phrase de la recette, SANS le paramètre, de bout en bout.

Les tests voisins fournissent `purchasing_process` eux-mêmes ou ne posent que des GE : ils ne pouvaient pas voir
qu'une ETI (250-4 999 salariés) restait dans la liste, ni que le palier d'élargissement n'était qu'une consigne.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.prompts.laura_acts import widening_line_from_output
from app.services.chat_requested_mode import set_turn_thread
from app.services.chat_tools import execute_chat_tool
from app.services.purchasing_process_filter import heavy_purchasing_reason

USER = "99999999-9999-4999-8999-999999999999"
PHRASE = "trouve-moi des petites structures sans gros process achat en Île-de-France"


def _row(siren: str, name: str, **extra: Any) -> dict[str, Any]:
    return {"siren": siren, "name": name, "city": "Paris", "department": "75", "nafLabel": "Conseil", **extra}


ETI = _row("100000001", "ETI DELTA", sizeClass="ETI", headcountTranche="41", headcount=800)
MILLIER = _row("100000002", "MOYENNE ECHO", sizeClass="PME", headcountTranche="51", headcount=3000)
PME = _row("100000003", "PETITE FOXTROT", sizeClass="PME", headcountTranche="22", headcount=150)
SANS_TAILLE = _row("100000004", "INCONNUE GOLF")


async def _search(monkeypatch: pytest.MonkeyPatch, rows: list[dict[str, Any]], **extra: Any) -> dict[str, Any]:
    class _Response:
        degraded: list[Any] = []
        query: dict[str, Any] = {}
        recommendedSort = "balanced"
        candidates = rows

    async def _fake(req: Any) -> Any:
        return _Response()

    monkeypatch.setattr("app.routers.discover.discover_registry", _fake)
    set_turn_thread(PHRASE, [])
    try:
        return await execute_chat_tool(
            "run_account_search", {"sectors": ["conseil"], "region": ["11"], **extra}, user_id=USER, profile_data=None
        )
    finally:
        set_turn_thread("", [])


@pytest.mark.asyncio
async def test_the_recette_sentence_sets_aside_an_eti_without_the_parameter(monkeypatch: pytest.MonkeyPatch) -> None:
    result = await _search(monkeypatch, [ETI, MILLIER, PME, SANS_TAILLE])
    assert result["heavy_purchasing_excluded"]
    assert [i["name"] for i in result["items"]] == ["PETITE FOXTROT", "INCONNUE GOLF"]
    aside = {d["name"]: d["reason"] for d in result["heavy_purchasing_excluded"]}
    assert set(aside) == {"ETI DELTA", "MOYENNE ECHO"}
    assert "ETI — process d'achat structuré" in aside["ETI DELTA"]
    assert result["purchasing_process_unverified_count"] == 1  # absence n'est pas preuve


def test_a_250_to_999_account_is_heavy_and_a_smaller_one_is_not() -> None:
    assert heavy_purchasing_reason(_row("1", "X", headcountTranche="32"))  # 250-499
    assert heavy_purchasing_reason(_row("2", "Y", headcountTranche="41"))  # 500-999
    assert heavy_purchasing_reason(_row("3", "Z", sizeClass="ETI"))
    assert heavy_purchasing_reason(_row("4", "W", headcountTranche="22")) is None  # 100-199
    assert heavy_purchasing_reason(_row("5", "V")) is None


@pytest.mark.asyncio
async def test_the_widening_level_is_rendered_by_code(monkeypatch: pytest.MonkeyPatch) -> None:
    voisine = _row("100000005", "VOISINE HOTEL", sizeClass="PME", headcountTranche="22", headcount=150,
                   widenedBy={"axis": "size", "code": "PME"})
    result = await _search(monkeypatch, [ETI, PME, voisine, SANS_TAILLE])
    line = widening_line_from_output(result)
    assert line == "3 comptes ; élargi à taille voisine : PME"
    assert "permission" not in line.lower() and "?" not in line
