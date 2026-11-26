"""#4408.1 (recette prod 28/10) — « une recherche rend 3 comptes » et Laura écrit « le palier régional voisin n'a pas
été lancé » : elle ANNONÇAIT qu'elle n'élargissait pas. Épopée #4433 (Louis 21/10) : Laura AGIT, les paliers se DISENT
après avoir été parcourus. Borne tranchée par Louis le 27/10 au soir (c144) : l'élargissement AUTOMATIQUE plafonne à la
RÉGION ; la France entière reste un geste explicite — jamais lancée toute seule."""

from __future__ import annotations

from typing import Any

import pytest

from app.services.chat_tools import execute_chat_tool


class _Response:
    def __init__(self, candidates: list[dict[str, Any]]) -> None:
        self.candidates = candidates
        self.degraded: list[dict[str, Any]] = []
        self.query: dict[str, Any] = {}
        self.recommendedSort = "balanced"


def _row(i: int, department: str) -> dict[str, Any]:
    return {
        "siren": f"44100{i:04d}",
        "name": f"Compte {i}",
        "department": department,
        "nafCode": "65.12Z",
        "nafLabel": "Autres assurances",
        "sizeClass": "PME",
        "headcount": 80,
        "headcountTranche": "21",
    }


def _registry(monkeypatch: pytest.MonkeyPatch, *, in_department: int, in_region: int) -> list[Any]:
    """Le département (31) rend ``in_department`` comptes ; sa région entière en ajoute ``in_region`` (autres départements)."""
    asked: list[Any] = []

    async def _fake(req: Any) -> Any:
        asked.append(req)
        zone = {d for d in (req.filters.department, *(req.filters.departments or [])) if d}
        rows = [_row(i, "31") for i in range(in_department)]
        if len(zone) > 1:
            rows += [_row(100 + i, "34") for i in range(in_region)]
        return _Response(rows)

    monkeypatch.setattr("app.routers.discover.discover_registry", _fake)
    return asked


_SEARCH = {"sectors": ["finance"], "department": "31", "requested_count": 10}


@pytest.mark.asyncio
async def test_thin_result_launches_the_regional_tier_and_names_it(monkeypatch: pytest.MonkeyPatch) -> None:
    asked = _registry(monkeypatch, in_department=3, in_region=30)
    out = await execute_chat_tool("run_account_search", dict(_SEARCH), user_id="u-1", profile_data=None)
    assert len(asked) == 2, "le palier régional est LANCÉ, pas annoncé"
    assert len(out["items"]) >= 10
    assert out["zone_widening"]["tier"] == "region"
    assert "région" in out["zone_line"]
    blob = str(out).casefold()
    # Sait dire NON : aucune phrase qui annonce un palier non lancé, aucune demande de permission.
    assert "n'a pas été lancé" not in blob
    assert "au-delà du dernier palier" not in blob
    # La taille des comptes rendus est ANNONCÉE (« 10 PME »), jamais un « 0 grand groupe » nu : une absence ne fait
    # aucune ligne.
    assert "PME" in out["size_line"] and "grand" not in out["size_line"] and "0 " not in out["size_line"].replace("10 ", "")


@pytest.mark.asyncio
async def test_auto_widening_stops_at_the_region_never_france(monkeypatch: pytest.MonkeyPatch) -> None:
    asked = _registry(monkeypatch, in_department=3, in_region=0)
    out = await execute_chat_tool("run_account_search", dict(_SEARCH), user_id="u-1", profile_data=None)
    assert len(asked) == 2, "département puis région, et STOP : aucune requête France"
    assert not any(not (r.filters.department or r.filters.departments or r.filters.regions) for r in asked)
    assert "toute la France" not in str(out)
    assert "n'a pas été lancé" not in str(out).casefold()
    # Sait dire NON : un manque qui reste après la région se DIT avec le palier atteint, il ne « propose » pas un palier
    # qu'on n'aurait pas lancé.
    assert "au-delà du dernier palier" not in str(out).casefold()
    assert "région" in out["zone_line"]


@pytest.mark.asyncio
async def test_enough_accounts_widen_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    asked = _registry(monkeypatch, in_department=30, in_region=9)
    out = await execute_chat_tool("run_account_search", dict(_SEARCH), user_id="u-1", profile_data=None)
    assert len(asked) == 1
    assert "zone_widening" not in out
