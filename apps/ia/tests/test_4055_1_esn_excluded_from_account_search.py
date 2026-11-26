"""#4055.1 (recette prod 14/10, FAIL) — « télécom manquants » rendait une carte « Cartographie »
de 8 comptes dont CAPGEMINI TECHNOLOGY SERVICES : une ESN est un concurrent potentiel (co-
traitance, sous-traitance), jamais une cible de prospection dans ce listing. Avant ce lot, le
seul garde-fou était une phrase dans `commercial_fit_note` demandant au MODÈLE de vérifier —
texte qu'il n'a pas suivi. Le filtre est maintenant posé en CODE, sur le même référentiel ESN
que l'écran Territoire et `company_archetype.is_known_esn_name` (GA-26, aucun second nom codé).
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services.chat_tools import execute_chat_tool

USER = "99999999-9999-4999-8999-999999999999"

CAPGEMINI = {
    "siren": "999999999",
    "name": "CAPGEMINI TECHNOLOGY SERVICES",
    "city": "Paris",
    "department": "75",
    "headcount": 5000,
    "nafLabel": "Programmation informatique",
}

ORANGE = {
    "siren": "380129866",
    "name": "ORANGE SA",
    "city": "Paris",
    "department": "75",
    "headcount": 5000,
    "nafLabel": "Télécommunications filaires",
}

FREE = {
    "siren": "421938861",
    "name": "FREE SAS",
    "city": "Paris",
    "department": "75",
    "headcount": 1200,
    "nafLabel": "Télécommunications filaires",
}


class _Response:
    def __init__(self, candidates: list[dict[str, Any]]) -> None:
        self.candidates = candidates
        self.degraded: list[Any] = []
        self.query: dict[str, Any] = {}
        self.recommendedSort = "balanced"


def _stub(monkeypatch: pytest.MonkeyPatch, candidates: list[dict[str, Any]]) -> None:
    async def _fake(req: Any) -> Any:
        return _Response(candidates)

    monkeypatch.setattr("app.routers.discover.discover_registry", _fake)


async def _run(**extra: Any) -> dict[str, Any]:
    return await execute_chat_tool(
        "run_account_search", {"sectors": ["telecom"], **extra}, user_id=USER, profile_data=None
    )


@pytest.mark.asyncio
async def test_a_known_esn_is_excluded_from_the_mapping(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub(monkeypatch, [ORANGE, CAPGEMINI, FREE])
    result = await _run()
    names = [item["name"] for item in result["items"]]
    assert "CAPGEMINI TECHNOLOGY SERVICES" not in names
    assert {"ORANGE SA", "FREE SAS"} <= set(names)
    assert result["esn_excluded_count"] == 1


@pytest.mark.asyncio
async def test_the_exclusion_is_named_not_silent(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub(monkeypatch, [CAPGEMINI, ORANGE])
    result = await _run()
    assert "esn_excluded_note" in result
    assert "ESN" in result["esn_excluded_note"]


@pytest.mark.asyncio
async def test_no_known_esn_leaves_the_result_untouched(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub(monkeypatch, [ORANGE, FREE])
    result = await _run()
    assert "esn_excluded_count" not in result
    assert "esn_excluded_note" not in result
    assert {item["name"] for item in result["items"]} == {"ORANGE SA", "FREE SAS"}
