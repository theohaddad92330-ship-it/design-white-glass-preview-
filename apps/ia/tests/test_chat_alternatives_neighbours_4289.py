"""#4289.4 / #4289.2 (recette 23/10) — « alternatives à Thales défense » ne rendait RIEN.

Cause : un candidat sans fait d'accessibilité mesuré est écarté (#3181.5) ; quand TOUS l'étaient, la carte
disparaissait. Le vide se détaille désormais par des comptes VOISINS (secteur, taille), nommés comme tels —
jamais présentés comme « plus accessibles » — et le stade de relation (#4289.12 : le même STADE que la cible, lu
sur le moteur de l'API) regroupe les alternatives qui le partagent.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.services.known_shape_gate import shape_read_from_tool
from tests.test_chat_suggest_account_alternatives_tool import (
    _account,
    _candidate,
    _run,
    _stub_owned_account,
    _stub_registry,
)


@pytest.mark.asyncio
async def test_candidates_without_an_easier_fact_come_back_as_named_neighbours(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_owned_account(monkeypatch, _account())
    _stub_registry(monkeypatch, [_candidate(department="75", headcount=None, siren="222", name="Voisin SA")])
    result = await _run({"account_id": "acc-1", "sectors": ["finance"], "department": "75", "headcount": "1000+"})
    assert result["alternatives"] == []
    neighbours = result["neighbours"]
    assert [n["account"]["name"] for n in neighbours] == ["Voisin SA"]
    assert neighbours[0]["why_similar"]
    assert "why_easier" not in neighbours[0]  # jamais présenté comme « plus accessible »
    assert result["neighbours_note"]


@pytest.mark.asyncio
async def test_neighbours_render_as_a_ranking_card(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_owned_account(monkeypatch, _account())
    _stub_registry(monkeypatch, [_candidate(department="75", headcount=None, siren="222", name="Voisin SA")])
    result = await _run({"account_id": "acc-1", "sectors": ["finance"], "department": "75", "headcount": "1000+"})
    read = shape_read_from_tool("suggest_account_alternatives", result)
    assert read["blocks"], read
    block = next(iter(read["blocks"].values()))
    assert [row["name"] for row in block["items"]] == ["Voisin SA"]


@pytest.mark.asyncio
async def test_same_relation_stage_groups_candidates_sharing_the_targets_stage(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # #4289.12 — le même STADE (lu sur le moteur de l'API), plus « tous deux vus dans le CRM ».
    _stub_owned_account(monkeypatch, _account())
    _stub_registry(monkeypatch, [_candidate(siren="111222333", name="Même relation", headcount=400)])
    monkeypatch.setattr("app.services.chat_tools._pool_crm_relation_signal", AsyncMock(return_value={"matched": True}))
    monkeypatch.setattr(
        "app.services.bellum_api.relation_stages_by_siren",
        AsyncMock(
            return_value={
                "552120222": {"relationStage": "ancien_client"},
                "111222333": {"relationStage": "ancien_client"},
            }
        ),
    )
    result = await _run({"account_id": "acc-1", "sectors": ["finance"], "department": "75", "headcount": "1000+"})
    alt = result["alternatives"][0]
    assert alt["same_relation_stage"] is True
    assert "même stade de relation" in alt["why_similar"].lower()
    assert result["relation_stage_group"] == ["Même relation"]
