"""#4408.1 / #4408.2 (recette prod 22/10) — « 10 comptes en IDF dans les services financiers sans gros process
achat » : UN seul compte rendu (ASSURANCES 2000).

Cause : le registre rendait ses ``limit`` premiers comptes (les mieux classés, donc les grands groupes), le code
retirait ensuite les comptes à process d'achat lourd (#4408) et il n'en restait qu'un. Le volume demandé (10) se
tient en lisant PLUS LOIN dans le classement avant de retirer les gros process (doctrine c126) ; les grands groupes
restent à part, avec leur barrière, et ne comptent jamais pour atteindre 10.
"""

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


def _row(i: int, *, big: bool) -> dict[str, Any]:
    return {
        "siren": f"55200{i:04d}",
        "name": f"{'Groupe' if big else 'Petite assurance'} {i}",
        "department": "75",
        "nafCode": "65.12Z",
        "nafLabel": "Autres assurances",
        "sizeClass": "GE" if big else "PME",
        "headcount": 9000 if big else 80,
        "headcountTranche": "42" if big else "21",
    }


def _registry(monkeypatch: pytest.MonkeyPatch, *, big: int, small: int) -> list[Any]:
    """Le registre classe les GRANDS groupes en tête (plus de signaux) puis les petits comptes."""
    asked: list[Any] = []
    pool = [_row(i, big=True) for i in range(big)] + [_row(100 + i, big=False) for i in range(small)]

    async def _fake(req: Any) -> Any:
        asked.append(req)
        return _Response(pool[: req.limit])

    monkeypatch.setattr("app.routers.discover.discover_registry", _fake)
    return asked


@pytest.mark.asyncio
async def test_4408_1_light_purchasing_reads_further_so_ten_small_accounts_are_kept(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asked = _registry(monkeypatch, big=9, small=20)
    out = await execute_chat_tool(
        "run_account_search",
        {"sectors": ["finance"], "region": ["Île-de-France"], "purchasing_process": "light", "limit": 10},
        user_id="u-1",
        profile_data=None,
    )
    assert asked[0].limit > 10, "le registre est lu plus loin que 10 avant de retirer les gros process"
    assert len(out["items"]) == 10
    assert all(item["name"].startswith("Petite") for item in out["items"])
    # Les grands groupes sont à part, avec leur raison, et ne comptent pas.
    assert out["heavy_purchasing_excluded_count"] == 9
    assert all(e["reason"] for e in out["heavy_purchasing_excluded"])
    assert "shortfall" not in out


@pytest.mark.asyncio
async def test_4408_1_without_the_constraint_the_registry_is_read_at_the_asked_volume(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asked = _registry(monkeypatch, big=0, small=30)
    out = await execute_chat_tool(
        "run_account_search", {"sectors": ["finance"], "limit": 10}, user_id="u-1", profile_data=None
    )
    assert asked[0].limit == 10 and len(out["items"]) == 10


@pytest.mark.asyncio
async def test_4408_2_the_requested_count_alone_sets_the_volume(monkeypatch: pytest.MonkeyPatch) -> None:
    """« 10 comptes » dit dans `requested_count` seul : le défaut de 8 ne le réduit plus."""
    _registry(monkeypatch, big=0, small=30)
    out = await execute_chat_tool(
        "run_account_search", {"sectors": ["finance"], "requested_count": 10}, user_id="u-1", profile_data=None
    )
    assert len(out["items"]) == 10 and "shortfall" not in out
