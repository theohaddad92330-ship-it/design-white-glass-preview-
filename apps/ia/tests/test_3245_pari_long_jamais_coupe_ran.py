"""#3245 (RAN, recette ND 10/10 en prod) — Réglages marquaient Accor ET AIRBUS « Pari long »,
la réponse « Où investir » ne citait qu'AIRBUS.

Cause : la carte `account_ranking` de la priorisation était plafonnée à 20 lignes dans l'ordre de
la règle ; avec 0 compte « maintenant » et 55 « à surveiller », le 21e compte — Accor — sortait de
la carte. Un pari DÉCLARÉ n'est jamais coupé par le plafond, et sa ligne dit « Pari long ».
"""

from __future__ import annotations

import copy

import pytest

from app.services import bellum_api
from app.services.chat_tools import execute_chat_tool
from app.services.known_shape_gate import shape_read_from_tool

USER = "44444444-4444-4444-8444-444444444444"


def _watch(i: int, name: str | None = None, **extra: object) -> dict:
    return {
        "id": f"w{i}",
        "companyName": name or f"Compte {i}",
        "bucket": "to_watch",
        "reason": "Compte compatible, sans mouvement actuel.",
        "headquarters": None,
        **extra,
    }


def _output() -> dict:
    watch = [_watch(i) for i in range(55)]
    watch[1] = _watch(1, "AIRBUS", betHorizon="long")
    watch[40] = _watch(40, "Accor", betHorizon="long")
    return {
        "now": [],
        "toVerify": [],
        "toWatch": watch,
        "notNow": [],
        "emptyBuckets": ["now", "to_verify", "not_now"],
        "declaredBets": [
            {"id": "w1", "companyName": "AIRBUS", "bucket": "to_watch", "betHorizon": "long"},
            {"id": "w40", "companyName": "Accor", "bucket": "to_watch", "betHorizon": "long"},
        ],
        "counts": {"now": 0, "toVerify": 0, "toWatch": 55, "notNow": 0, "total": 55, "outsideNow": 55},
    }


def test_a_declared_long_bet_beyond_the_ranking_cap_is_still_on_the_card() -> None:
    card = shape_read_from_tool("get_portfolio_priorities", _output())["blocks"]["account_ranking"]
    names = [item["name"] for item in card["items"]]
    assert "Accor" in names and "AIRBUS" in names
    accor = next(item for item in card["items"] if item["name"] == "Accor")
    assert any("Pari long" in line for line in accor["why"])
    # Le plafond reste le plafond pour les comptes non déclarés.
    assert len(names) == 20


def test_an_undeclared_account_never_says_long_bet() -> None:
    card = shape_read_from_tool("get_portfolio_priorities", _output())["blocks"]["account_ranking"]
    plain = next(item for item in card["items"] if item["name"] == "Compte 0")
    assert not any("Pari long" in line for line in plain["why"])


@pytest.mark.asyncio
async def test_declared_bets_survive_the_relay(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _pp(*_a: object, **_k: object) -> dict:
        return copy.deepcopy(_output())

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "portfolio_priorities", _pp)
    out = await execute_chat_tool("get_portfolio_priorities", {}, user_id=USER, profile_data=None)
    assert [b["companyName"] for b in out["declaredBets"]] == ["AIRBUS", "Accor"]
