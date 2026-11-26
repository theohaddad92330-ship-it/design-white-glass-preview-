"""#3769.2 (lot M06, recette prod 09/10) — « priorise mes comptes » puis
« seulement en Occitanie » : Laura reposait une question, faute de filtre.
`get_portfolio_priorities` ne prenait AUCUN paramètre ; il prend désormais
`region` (code INSEE) et/ou `departments`, appliqués sur le siège RÉEL
(`accounts.headquarters`, code postal), jamais deviné.

Ce que ce fichier verrouille :
  1. sans critère géographique, la sortie est inchangée (relais tel quel) ;
  2. avec `region`, seuls les comptes dont le siège y est restent, dans leur
     catégorie d'origine, et les compteurs / catégories vides suivent ;
  3. un siège sans code postal n'est JAMAIS rangé hors zone : il se NOMME
     (`unlocated`), il ne se compte pas en « 0 » ;
  4. un code de région inconnu se dit, il ne filtre rien en silence.
"""

from __future__ import annotations

import copy

import pytest

from app.services import bellum_api
from app.services.chat_tools import PORTFOLIO_PRIORITIES_TOOL, execute_chat_tool

USER = "33333333-3333-4333-8333-333333333333"


def _row(i: str, bucket: str, hq: str | None) -> dict:
    return {
        "id": i,
        "companyName": f"Compte {i}",
        "bucket": bucket,
        "reason": "r",
        "lastActionAt": None,
        "headquarters": hq,
    }


_PRIORITIES = {
    "now": [_row("tls", "now", "1 allée X, 31000 Toulouse"), _row("par", "now", "7 rue Y, 75013 Paris")],
    "toVerify": [_row("mtp", "to_verify", "2 rue Z, 34000 Montpellier")],
    "toWatch": [_row("lyo", "to_watch", "3 quai, 69002 Lyon"), _row("nohq", "to_watch", None)],
    "notNow": [_row("nim", "not_now", "4 bd, 30000 Nîmes")],
    "capacityCap": 8,
    "emptyBuckets": [],
    "diversityNotes": [],
    "counts": {"now": 2, "toVerify": 1, "toWatch": 2, "notNow": 1, "total": 6, "outsideNow": 4},
}


@pytest.fixture(autouse=True)
def _bridge(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _portfolio_priorities(*_a: object, **_k: object) -> dict:
        return copy.deepcopy(_PRIORITIES)

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "portfolio_priorities", _portfolio_priorities)


async def _run(tool_input: dict) -> dict:
    return await execute_chat_tool("get_portfolio_priorities", tool_input, user_id=USER, profile_data=None)


def test_the_schema_exposes_region_and_departments() -> None:
    props = PORTFOLIO_PRIORITIES_TOOL["input_schema"]["properties"]
    assert "76" in props["region"]["enum"]
    assert props["departments"]["type"] == "array"


@pytest.mark.asyncio
async def test_without_a_geo_criterion_the_relay_is_unchanged() -> None:
    out = await _run({})
    assert {k: out[k] for k in _PRIORITIES} == _PRIORITIES
    assert "geoFilter" not in out


@pytest.mark.asyncio
async def test_occitanie_keeps_only_accounts_headquartered_there_in_their_bucket() -> None:
    out = await _run({"region": "76"})
    assert [r["id"] for r in out["now"]] == ["tls"]
    assert [r["id"] for r in out["toVerify"]] == ["mtp"]
    assert out["toWatch"] == []
    assert [r["id"] for r in out["notNow"]] == ["nim"]
    assert out["emptyBuckets"] == ["to_watch"]
    assert out["counts"] == {"now": 1, "toVerify": 1, "toWatch": 0, "notNow": 1, "total": 3, "outsideNow": 2}
    geo = out["geoFilter"]
    assert geo["label"] == "Occitanie"
    assert geo["kept"] == 3
    assert geo["outside"] == 2
    # A missing headquarters is NAMED, never counted as "outside".
    assert geo["unlocated"] == ["Compte nohq"]


@pytest.mark.asyncio
async def test_departments_filter_alone() -> None:
    out = await _run({"departments": ["34"]})
    assert [r["id"] for r in out["toVerify"]] == ["mtp"]
    assert out["now"] == [] and "now" in out["emptyBuckets"]
    assert out["geoFilter"]["label"] == "Hérault (34)"


@pytest.mark.asyncio
async def test_an_unknown_region_says_so_and_filters_nothing() -> None:
    out = await _run({"region": "zz"})
    assert {k: out[k] for k in _PRIORITIES} == _PRIORITIES
    assert "geoFilter" not in out
    assert "geoFilterIgnored" in out


@pytest.mark.asyncio
async def test_the_ranking_card_names_the_zone_and_the_unlocated_accounts() -> None:
    from app.services.known_shape_gate import shape_read_from_tool

    out = await _run({"region": "76"})
    card = shape_read_from_tool("get_portfolio_priorities", out)["blocks"]["account_ranking"]
    assert "Zone : Occitanie" in card["axes"]
    assert [item["name"] for item in card["items"]] == ["Compte tls", "Compte mtp"]
    assert any("Compte nohq" in line for line in card["not_evaluated"])


@pytest.mark.asyncio
async def test_without_a_zone_the_card_carries_no_zone_axis() -> None:
    from app.services.known_shape_gate import shape_read_from_tool

    out = await _run({})
    card = shape_read_from_tool("get_portfolio_priorities", out)["blocks"]["account_ranking"]
    assert not any(axis.startswith("Zone") for axis in card["axes"])
