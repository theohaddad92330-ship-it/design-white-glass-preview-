"""#4408 — « pas de gros process achat » : un paramètre EXPLICITE de l'outil, appliqué en CODE.

Recette 21/10 : « 10 comptes en Île-de-France, services financiers, sans gros process achat, qui
recrutent des profils IT » rendait Malakoff Humanis et Harmonie Mutuelle (mutuelles nationales). La
contrainte n'avait aucune porte : le modèle la lisait, le code ne la voyait pas (régression de #3705).
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services.chat_tools import RUN_ACCOUNT_SEARCH_TOOL, execute_chat_tool
from app.services.purchasing_process_filter import heavy_purchasing_reason, split_heavy_purchasing

USER = "99999999-9999-4999-8999-999999999999"


def _row(siren: str, name: str, **extra: Any) -> dict[str, Any]:
    return {"siren": siren, "name": name, "city": "Paris", "department": "75", "nafLabel": "Assurance", **extra}


MUTUELLE_GE = _row("775691140", "MALAKOFF HUMANIS", sizeClass="GE", headcountTranche="52", headcount=9999)
ASSUREUR = _row("775665631", "GRAND ASSUREUR SA", sizeClass="GE", headcountTranche="53", headcount=20000)
PME_A = _row("111111111", "COURTAGE ALPHA", sizeClass="PME", headcountTranche="22", headcount=199)
PME_B = _row("222222222", "MUTUELLE BETA", sizeClass="PME", headcountTranche="21", headcount=99)
NO_SIZE = _row("333333333", "INCONNUE GAMMA")


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
        "run_account_search", {"sectors": ["finance"], "region": ["11"], **extra}, user_id=USER, profile_data=None
    )


def test_the_tool_schema_exposes_the_constraint() -> None:
    props = RUN_ACCOUNT_SEARCH_TOOL["input_schema"]["properties"]
    assert props["purchasing_process"]["enum"] == ["light"]
    description = props["purchasing_process"]["description"].lower()
    assert "petite structure" in description and "process" in description


def test_the_reason_is_measured_on_what_the_registry_knows() -> None:
    assert "GE" in (heavy_purchasing_reason(MUTUELLE_GE) or "")
    assert heavy_purchasing_reason(ASSUREUR)
    assert heavy_purchasing_reason(_row("4", "X", headcountTranche="52"))  # 5 000+ sans catégorie
    assert heavy_purchasing_reason(PME_A) is None
    assert heavy_purchasing_reason(NO_SIZE) is None  # aucune donnée de taille : jamais écarté


def test_a_computed_barrier_of_an_analysed_account_wins() -> None:
    locked = _row("5", "ANALYSÉE", sizeClass="PME", accessBarrier={"access_class": "D", "label": "Verrouillage probable"})
    assert "Verrouillage probable" in (heavy_purchasing_reason(locked) or "")


def test_split_keeps_order_and_names_each_reason() -> None:
    kept, dropped = split_heavy_purchasing([MUTUELLE_GE, PME_A, ASSUREUR, NO_SIZE])
    assert [r["name"] for r in kept] == ["COURTAGE ALPHA", "INCONNUE GAMMA"]
    assert [d["name"] for d in dropped] == ["MALAKOFF HUMANIS", "GRAND ASSUREUR SA"]
    assert all(d["reason"] for d in dropped)


@pytest.mark.asyncio
async def test_heavy_accounts_leave_the_main_selection_and_are_named(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub(monkeypatch, [MUTUELLE_GE, ASSUREUR, PME_A, PME_B])
    result = await _run(purchasing_process="light")
    assert [i["name"] for i in result["items"]] == ["COURTAGE ALPHA", "MUTUELLE BETA"]
    discarded = result["heavy_purchasing_excluded"]
    assert {d["name"] for d in discarded} == {"MALAKOFF HUMANIS", "GRAND ASSUREUR SA"}
    assert all(d["reason"] for d in discarded)
    assert result["heavy_purchasing_excluded_count"] == 2
    assert result["criteria"]["purchasing_process"] == "light"
    assert "ne compte" in result["heavy_purchasing_excluded_note"].lower()


@pytest.mark.asyncio
async def test_without_the_constraint_they_stay(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub(monkeypatch, [MUTUELLE_GE, ASSUREUR, PME_A, PME_B])
    result = await _run()
    assert len(result["items"]) == 4
    assert "heavy_purchasing_excluded" not in result


@pytest.mark.asyncio
async def test_a_candidate_without_size_data_stays_and_the_answer_says_so(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub(monkeypatch, [MUTUELLE_GE, NO_SIZE, PME_A])
    result = await _run(purchasing_process="light")
    assert "INCONNUE GAMMA" in [i["name"] for i in result["items"]]
    assert result["purchasing_process_unverified_count"] == 1


@pytest.mark.asyncio
async def test_established_small_structures_come_before_unverified_ones(monkeypatch: pytest.MonkeyPatch) -> None:
    """#4408.1 (re-recette 26/10) — 1 petite structure établie sur 10 rendus : le critère doit PESER en sélection.

    Un compte sans donnée de taille reste (jamais écarté sur une absence), mais il passe APRÈS ceux dont la
    petite taille est établie, et porte `purchasing_verified: false`.
    """
    _stub(monkeypatch, [NO_SIZE, PME_A, PME_B])
    result = await _run(purchasing_process="light")
    assert [i["name"] for i in result["items"]] == ["COURTAGE ALPHA", "MUTUELLE BETA", "INCONNUE GAMMA"]
    assert [i["purchasing_verified"] for i in result["items"]] == [True, True, False]
