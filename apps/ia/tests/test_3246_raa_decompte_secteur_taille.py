"""#3246 (lot RAA, recette prod 10/10) — « cas similaires à Société Générale » rendait SNCF Réseau gagné et
perdu, « Secteur différent », mais AUCUN décompte « N gagnés / M perdus de même secteur » ni « dont K de
taille comparable ». Quand le secteur ou la taille du compte sont connus mais qu'aucun cas ne les partage,
on le DIT (« aucune »), jamais « 0 gagné / 0 perdu » ; une dimension non renseignée sur le compte se
nomme aussi (« non mesuré n'est jamais 0 »).
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import execute_chat_tool

USER = "33333333-3333-4333-8333-333333333333"


async def _run(monkeypatch: pytest.MonkeyPatch, payload: dict) -> dict:
    async def _similar(*_a: object, **_k: object) -> dict:
        return payload

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "similar_cases", _similar)
    return await execute_chat_tool("find_similar_cases", {"account_id": "a1"}, user_id=USER, profile_data=None)


@pytest.mark.asyncio
async def test_known_sector_and_size_without_shared_case_says_aucune_not_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    out = await _run(
        monkeypatch,
        {
            "cases": [],
            "examined": {"won": 1, "lost": 1},
            "caseMemory": [],
            "targetKnown": {"sector": True, "size": True},
        },
    )
    assert out["caseMemorySentences"] == [
        "aucune affaire gagnée ou perdue du même secteur",
        "aucune affaire de taille comparable (la taille du compte est connue, aucun cas ne la partage)",
    ]
    assert not any("0 gagné" in s or "0 perdu" in s for s in out["caseMemorySentences"])
    assert "examined" not in out


@pytest.mark.asyncio
async def test_unknown_size_is_said_not_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    out = await _run(
        monkeypatch,
        {
            "cases": [],
            "caseMemory": [{"dimension": "secteur", "value": "Banque", "won": 2, "lost": 1}],
            "targetKnown": {"sector": True, "size": False},
        },
    )
    assert out["caseMemorySentences"] == [
        "2 gagnés / 1 perdu de même secteur (Banque)",
        "taille du compte non renseignée : pas de décompte « de taille comparable »",
    ]


@pytest.mark.asyncio
async def test_unknown_sector_is_said(monkeypatch: pytest.MonkeyPatch) -> None:
    out = await _run(
        monkeypatch,
        {"cases": [], "caseMemory": [], "targetKnown": {"sector": False, "size": False}},
    )
    assert out["caseMemorySentences"][0] == "secteur du compte non renseigné : pas de décompte par secteur"


@pytest.mark.asyncio
async def test_size_counted_inside_the_sector_is_not_repeated(monkeypatch: pytest.MonkeyPatch) -> None:
    # sait dire NON : quand la ligne « secteur et taille » existe, aucune phrase d'absence de taille.
    out = await _run(
        monkeypatch,
        {
            "cases": [],
            "caseMemory": [
                {"dimension": "secteur", "value": "Banque", "won": 2, "lost": 1},
                {"dimension": "secteur et taille", "value": "Banque, 500-1000", "won": 1, "lost": 0},
            ],
            "targetKnown": {"sector": True, "size": True},
        },
    )
    assert out["caseMemorySentences"] == [
        "2 gagnés / 1 perdu de même secteur (Banque)",
        "dont 1 gagné / 0 perdu de taille comparable (Banque, 500-1000)",
    ]
