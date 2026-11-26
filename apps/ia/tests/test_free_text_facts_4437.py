"""#4437 (Louis 21/10) — le texte libre LU (intitulés d'offres) est rattaché par le modèle à un type de fait,
une compétence et une famille métier, sur un EXTRAIT réellement lu, puis rangé avec le fait (cache commun).

Garde-fous qui disent NON : un extrait absent du texte lu, une compétence absente de l'extrait, une famille
hors liste fermée, un type de fait inconnu — le rattachement tombe (jamais une donnée fabriquée) ; le modèle
en panne laisse les offres telles quelles."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.services import free_text_facts


def _offers() -> list[dict]:
    return [
        {"title": "Développeur React / TypeScript H/F", "url": "https://o/1"},
        {"title": "Comptable fournisseurs", "url": "https://o/2"},
        {"title": "Data Engineer Spark", "url": "https://o/3"},
    ]


def _model(items: list[dict[str, Any]]) -> AsyncMock:
    return AsyncMock(return_value=({"items": items}, None))


@pytest.mark.asyncio
async def test_a_title_is_attached_to_a_fact_type_a_skill_and_a_family_on_a_real_extract() -> None:
    call = _model(
        [
            {
                "index": 0,
                "factType": "hiring",
                "skill": "React",
                "family": "developpement",
                "extract": "Développeur React",
            },
            {"index": 2, "factType": "hiring", "skill": "Spark", "family": "data_ia", "extract": "Data Engineer Spark"},
        ]
    )
    rows = await free_text_facts.attach_offer_titles(_offers(), call=call)
    assert rows[0]["attached"] == {
        "factType": "hiring",
        "skill": "React",
        "family": "developpement",
        "extract": "Développeur React",
    }
    assert "attached" not in rows[1]  # rien rattaché : aucune ligne inventée
    assert rows[2]["attached"]["family"] == "data_ia"
    call.assert_awaited_once()


@pytest.mark.asyncio
async def test_an_attachment_without_a_real_extract_says_no() -> None:
    call = _model(
        [
            # extrait jamais lu dans l'intitulé
            {
                "index": 0,
                "factType": "hiring",
                "skill": "React",
                "family": "developpement",
                "extract": "Lead React Native",
            },
            # compétence absente de l'extrait
            {"index": 1, "factType": "hiring", "skill": "SAP", "family": "developpement", "extract": "Comptable"},
            # famille hors liste fermée
            {"index": 2, "factType": "hiring", "skill": "Spark", "family": "magie", "extract": "Data Engineer Spark"},
        ]
    )
    rows = await free_text_facts.attach_offer_titles(_offers(), call=call)
    assert all("attached" not in row for row in rows)


@pytest.mark.asyncio
async def test_an_unknown_fact_type_or_index_says_no() -> None:
    call = _model(
        [
            {
                "index": 0,
                "factType": "rumeur",
                "skill": "React",
                "family": "developpement",
                "extract": "Développeur React",
            },
            {"index": 9, "factType": "hiring", "skill": None, "family": None, "extract": "Développeur React"},
        ]
    )
    rows = await free_text_facts.attach_offer_titles(_offers(), call=call)
    assert all("attached" not in row for row in rows)


@pytest.mark.asyncio
async def test_a_model_failure_leaves_the_offers_untouched() -> None:
    call = AsyncMock(side_effect=RuntimeError("overloaded"))
    rows = await free_text_facts.attach_offer_titles(_offers(), call=call)
    assert rows == _offers()


@pytest.mark.asyncio
async def test_nothing_to_read_means_no_model_call() -> None:
    call = _model([])
    assert await free_text_facts.attach_offer_titles([], call=call) == []
    assert await free_text_facts.attach_offer_titles([{"title": "  "}], call=call) == [{"title": "  "}]
    call.assert_not_called()
