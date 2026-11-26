"""#3246 / #3210.1 (lot Q02, recette prod 09/10 soir) — les recommandations ne disaient que
le TOTAL (« 3 gagnés et 2 perdus ») au lieu de « N gagnés / M perdus de même secteur ».
L'outil `find_similar_cases` rend désormais, par dimension (secteur, taille, position de
groupe), une phrase prête à citer, calculée sur `caseMemory` — jamais une probabilité, jamais
un nom de client, et une dimension sans cas n'a aucune ligne (pas de « 0 / 0 » inventé).
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
async def test_each_dimension_gets_its_own_won_lost_sentence(monkeypatch: pytest.MonkeyPatch) -> None:
    out = await _run(
        monkeypatch,
        {
            "cases": [],
            "caseMemory": [
                {"dimension": "secteur", "value": "Banque", "won": 2, "lost": 1},
                {"dimension": "taille", "value": "500-1000", "won": 1, "lost": 1},
                {"dimension": "position dans un groupe", "value": "filiale", "won": 0, "lost": 1},
            ],
        },
    )
    sentences = out["caseMemorySentences"]
    assert "2 gagnés / 1 perdu de même secteur (Banque)" in sentences
    assert "1 gagné / 1 perdu de même taille (500-1000)" in sentences
    assert "0 gagné / 1 perdu de même position dans un groupe (filiale)" in sentences


@pytest.mark.asyncio
async def test_the_bare_total_leaves_the_payload_when_the_sentences_exist(monkeypatch: pytest.MonkeyPatch) -> None:
    # #3246 (lot Q06, recette 10/10) : la réponse disait « 3 gagnés et 2 perdus » au TOTAL — le modèle
    # lisait `examined` à côté des phrases. Avec des phrases par ressemblance, le total nu ne voyage plus.
    out = await _run(
        monkeypatch,
        {
            "cases": [],
            "examined": {"won": 3, "lost": 2},
            "caseMemory": [{"dimension": "secteur", "value": "Banque", "won": 2, "lost": 1}],
        },
    )
    assert out["caseMemorySentences"] == ["2 gagnés / 1 perdu de même secteur (Banque)"]
    assert "examined" not in out


@pytest.mark.asyncio
async def test_without_sentences_the_total_stays_named_as_a_total(monkeypatch: pytest.MonkeyPatch) -> None:
    # sait dire NON : aucune ressemblance connue → le total reste, et reste un total (aucun secteur inventé).
    out = await _run(monkeypatch, {"cases": [], "examined": {"won": 3, "lost": 2}, "caseMemory": []})
    assert out["examined"] == {"won": 3, "lost": 2}


@pytest.mark.asyncio
async def test_no_memory_line_means_no_sentence_never_a_zero_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    out = await _run(monkeypatch, {"cases": [], "caseMemory": []})
    assert out.get("caseMemorySentences") in (None, [])


@pytest.mark.asyncio
async def test_a_line_with_nothing_on_both_sides_is_dropped_and_junk_ignored(monkeypatch: pytest.MonkeyPatch) -> None:
    out = await _run(
        monkeypatch,
        {
            "cases": [],
            "caseMemory": [
                {"dimension": "secteur", "value": "Banque", "won": 0, "lost": 0},
                {"dimension": "taille", "value": "x", "won": "beaucoup", "lost": None},
                "pas un objet",
            ],
        },
    )
    assert out.get("caseMemorySentences") in (None, [])


@pytest.mark.asyncio
async def test_sector_comes_first_then_size_as_a_dont(monkeypatch: pytest.MonkeyPatch) -> None:
    # #3246 (décision Louis 10/10) : secteur d'abord, la taille vient en second (« dont K … de taille comparable »).
    out = await _run(
        monkeypatch,
        {
            "cases": [],
            "caseMemory": [
                {"dimension": "taille", "value": "500-1000", "won": 1, "lost": 2},
                {"dimension": "secteur et taille", "value": "Banque, 500-1000", "won": 1, "lost": 1},
                {"dimension": "secteur", "value": "Banque", "won": 2, "lost": 1},
            ],
        },
    )
    assert out["caseMemorySentences"][0] == "2 gagnés / 1 perdu de même secteur (Banque)"
    assert out["caseMemorySentences"][1] == "dont 1 gagné / 1 perdu de taille comparable (Banque, 500-1000)"
    assert "1 gagné / 2 perdus de même taille (500-1000)" in out["caseMemorySentences"][2:]


@pytest.mark.asyncio
async def test_no_same_sector_case_says_so_then_gives_the_size_count(monkeypatch: pytest.MonkeyPatch) -> None:
    out = await _run(
        monkeypatch,
        {"cases": [], "caseMemory": [{"dimension": "taille", "value": "500-1000", "won": 1, "lost": 2}]},
    )
    assert out["caseMemorySentences"] == [
        "aucune affaire gagnée ou perdue du même secteur",
        "1 gagné / 2 perdus de même taille (500-1000)",
    ]


@pytest.mark.asyncio
async def test_the_bridge_payload_is_otherwise_relayed_untouched(monkeypatch: pytest.MonkeyPatch) -> None:
    out = await _run(monkeypatch, {"cases": [{"accountId": "g"}]})
    assert out["cases"] == [{"accountId": "g"}]
    assert "caseMemorySentences" not in out
