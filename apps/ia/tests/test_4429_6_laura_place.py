"""#4429.6 — Laura : « Tolouse » est corrigée et NOMMÉE, un homonyme est dit, jamais un repli muet."""

from __future__ import annotations

from typing import Any

import pytest

from app.services import chat_tools

USER = "77777777-7777-4777-8777-777777777777"


def _commune(name: str, code: str, department: str, department_name: str, population: int) -> dict[str, Any]:
    return {
        "code": code, "name": name, "postalCodes": [], "latitude": 43.6, "longitude": 1.44,
        "population": population, "department": department, "departmentName": department_name, "region": "76",
    }  # fmt: skip


def _stub(monkeypatch: pytest.MonkeyPatch, communes: list[dict[str, Any]]) -> list[Any]:
    seen: list[Any] = []

    async def _search(query: str, **_: Any) -> list[dict[str, Any]]:
        return communes

    class _Response:
        degraded: list[Any] = []
        query: dict[str, Any] = {}
        recommendedSort = "balanced"
        candidates: list[Any] = []
        zoneWidening = None

    async def _fake(req: Any) -> Any:
        seen.append(req)
        return _Response()

    monkeypatch.setattr("app.services.data_sources.geo_communes.search_communes", _search)
    monkeypatch.setattr("app.routers.discover.discover_registry", _fake)
    return seen


async def test_ville_mal_orthographiee_corrigee_cherchee_et_dite(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = _stub(monkeypatch, [_commune("Toulouse", "31555", "31", "Haute-Garonne", 514819)])

    result = await chat_tools.execute_chat_tool(
        "run_account_search", {"city": "Tolouse"}, user_id=USER, profile_data=None
    )

    assert seen and seen[0].filters.city == "Toulouse"
    assert result["place_resolution"]["kind"] == "corrected"
    assert result["place_line"] == "Toulouse (corrigé depuis « Tolouse »)"
    assert "city_not_resolved" not in result


async def test_homonyme_plus_peuplee_et_autres_nommees(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = _stub(
        monkeypatch,
        [
            _commune("Saint-Denis", "97411", "974", "La Réunion", 150000),
            _commune("Saint-Denis", "93066", "93", "Seine-Saint-Denis", 113000),
        ],
    )

    result = await chat_tools.execute_chat_tool(
        "run_account_search", {"city": "Saint-Denis"}, user_id=USER, profile_data=None
    )

    assert seen[0].filters.city == "Saint-Denis"
    assert result["place_resolution"]["kind"] == "homonym"
    assert "Seine-Saint-Denis" in result["place_line"] and "La Réunion" in result["place_line"]


async def test_nom_exact_unique_ne_dit_rien(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub(monkeypatch, [_commune("Toulouse", "31555", "31", "Haute-Garonne", 514819)])

    result = await chat_tools.execute_chat_tool(
        "run_account_search", {"city": "Toulouse"}, user_id=USER, profile_data=None
    )

    assert "place_resolution" not in result and "place_line" not in result


async def test_aucune_commune_reste_dite_par_city_not_resolved(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub(monkeypatch, [])

    result = await chat_tools.execute_chat_tool(
        "run_account_search", {"city": "Xyzzy", "sectors": ["finance"]}, user_id=USER, profile_data=None
    )

    assert result["city_not_resolved"] == "Xyzzy"
    assert "place_line" not in result
