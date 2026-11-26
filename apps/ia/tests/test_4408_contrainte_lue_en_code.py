"""#4408.1 — recette prod du 25/10 : « petite structure, sans gros process achat » rendait SG, BNP, MACIF, AXA, CCF.

Le correctif du 21/10 n'agit que si le MODÈLE passe `purchasing_process: light` à l'outil ; en prod il ne le
passait pas, donc le code ne voyait aucune contrainte. La consigne de l'utilisateur est désormais lue EN CODE,
dans le message du tour : le modèle ne peut plus l'oublier.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services.chat_requested_mode import set_turn_thread
from app.services.chat_tools import execute_chat_tool
from app.services.purchasing_process_filter import light_purchasing_asked

USER = "99999999-9999-4999-8999-999999999999"


@pytest.mark.parametrize(
    "message",
    [
        "petite structure, sans gros process achat",
        "Je veux des comptes SANS GROS PROCESS D'ACHAT",
        "pas de gros processus achats",
        "des PME, pas de grands groupes",
        "plutôt une petite structure",
    ],
)
def test_the_constraint_is_read_from_the_message(message: str) -> None:
    assert light_purchasing_asked(message, ())


@pytest.mark.parametrize(
    "message",
    ["10 banques en Île-de-France", "des grands groupes de l'assurance", "process achat structuré bienvenu", ""],
)
def test_no_constraint_is_never_invented(message: str) -> None:
    assert not light_purchasing_asked(message, ())


def test_an_earlier_user_turn_still_holds() -> None:
    history = ({"role": "user", "content": "petite structure, sans gros process achat"}, {"role": "assistant", "content": "ok"})
    assert light_purchasing_asked("et à Lyon ?", history)


def test_an_assistant_turn_never_sets_the_constraint() -> None:
    assert not light_purchasing_asked("et à Lyon ?", ({"role": "assistant", "content": "pas de gros process achat"},))


def _row(siren: str, name: str, **extra: Any) -> dict[str, Any]:
    return {"siren": siren, "name": name, "city": "Paris", "department": "75", "nafLabel": "Banque", **extra}


GRANDS = [
    _row("552120222", "SOCIETE GENERALE", sizeClass="GE", headcountTranche="53", headcount=20000),
    _row("662042449", "BNP PARIBAS", sizeClass="GE", headcountTranche="53", headcount=20000),
    _row("775665631", "MACIF", sizeClass="GE", headcountTranche="52", headcount=9999),
]
PETIT = _row("111111111", "COURTAGE ALPHA", sizeClass="PME", headcountTranche="22", headcount=199)


@pytest.mark.asyncio
async def test_big_groups_leave_the_ranking_even_when_the_model_forgets_the_parameter(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _Response:
        degraded: list[Any] = []
        query: dict[str, Any] = {}
        recommendedSort = "balanced"
        candidates = [*GRANDS, PETIT]

    async def _fake(req: Any) -> Any:
        return _Response()

    monkeypatch.setattr("app.routers.discover.discover_registry", _fake)
    set_turn_thread("petite structure, sans gros process achat", [])
    try:
        result = await execute_chat_tool(
            "run_account_search", {"sectors": ["finance"], "region": ["11"]}, user_id=USER, profile_data=None
        )
    finally:
        set_turn_thread("", [])
    assert [i["name"] for i in result["items"]] == ["COURTAGE ALPHA"]
    assert {d["name"] for d in result["heavy_purchasing_excluded"]} == {"SOCIETE GENERALE", "BNP PARIBAS", "MACIF"}
    assert result["criteria"]["purchasing_process"] == "light"
