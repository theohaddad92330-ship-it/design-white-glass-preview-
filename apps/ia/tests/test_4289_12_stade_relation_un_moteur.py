"""#4289.12 — UN moteur du « stade de relation », deux lecteurs (arbitrage du 26/10/2026).

Avant : le générateur d'alternatives déclarait « même stade de relation » dès que le compte visé ET le candidat
étaient VUS dans le CRM — un prospect et un client actif sortaient « au même stade », alors que les cas similaires
(apps/api, `relationStageOf`) comparent un stade de la liste FERMÉE. Désormais l'IA LIT le stade de l'API par SIREN
(`/internal/copilot/accounts/relation-stages-by-siren`, contrat `relation-stage-read.ts`) et ne déclare le même
stade que pour deux stades CONNUS et ÉGAUX. Un stade non lu ne s'invente pas.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.services import bellum_api
from app.services.sales_context import RELATION_STAGE_LABELS, RELATIONSHIP_STATES
from tests.test_chat_suggest_account_alternatives_tool import (
    _account,
    _candidate,
    _run,
    _stub_owned_account,
    _stub_registry,
)

_TARGET_SIREN = "552120222"
_CANDIDATE_SIREN = "111222333"


def _stub(monkeypatch: pytest.MonkeyPatch, stages: dict[str, Any] | None) -> None:
    _stub_owned_account(monkeypatch, _account())
    _stub_registry(monkeypatch, [_candidate(siren=_CANDIDATE_SIREN, name="Même relation", headcount=400)])
    # Les deux sont VUS dans le CRM : avant #4289.12, cela suffisait à dire « même stade ».
    monkeypatch.setattr("app.services.chat_tools._pool_crm_relation_signal", AsyncMock(return_value={"matched": True}))
    monkeypatch.setattr("app.services.bellum_api.relation_stages_by_siren", AsyncMock(return_value=stages))


async def _alternatives() -> dict[str, Any]:
    return await _run({"account_id": "acc-1", "sectors": ["finance"], "department": "75", "headcount": "1000+"})


@pytest.mark.asyncio
async def test_same_stage_is_said_with_its_label_when_both_stages_are_equal(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub(
        monkeypatch,
        {_TARGET_SIREN: {"relationStage": "client_actif"}, _CANDIDATE_SIREN: {"relationStage": "client_actif"}},
    )
    result = await _alternatives()
    alt = result["alternatives"][0]
    assert alt["same_relation_stage"] is True
    assert "même stade de relation que Société Générale (client actif)" in alt["why_similar"]
    assert result["relation_stage_group"] == ["Même relation"]


@pytest.mark.asyncio
async def test_no_same_stage_when_both_are_in_the_crm_but_at_different_stages(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub(monkeypatch, {_TARGET_SIREN: {"relationStage": "client_actif"}, _CANDIDATE_SIREN: {"relationStage": "froid"}})
    result = await _alternatives()
    alt = result["alternatives"][0]
    assert "same_relation_stage" not in alt
    assert "même stade" not in alt["why_similar"].lower()
    assert "relation_stage_group" not in result


@pytest.mark.asyncio
async def test_no_same_stage_when_the_stage_read_failed(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub(monkeypatch, None)
    result = await _alternatives()
    alt = result["alternatives"][0]
    assert "same_relation_stage" not in alt
    assert "relation_stage_group" not in result


@pytest.mark.asyncio
async def test_no_same_stage_when_only_the_candidate_has_a_known_stage(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub(monkeypatch, {_CANDIDATE_SIREN: {"relationStage": "client_actif"}})
    result = await _alternatives()
    assert "same_relation_stage" not in result["alternatives"][0]


@pytest.mark.asyncio
async def test_bridge_client_keeps_only_closed_list_stages(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, dict[str, Any]]] = []

    async def _post(path: str, payload: dict[str, Any], **_k: Any) -> Any:
        calls.append((path, payload))
        return {
            "bySiren": {
                "111222333": {"relationStage": "client_actif", "source": "missions"},
                "222333444": {"relationStage": "client", "source": "saisi"},  # hors liste fermée
            }
        }

    monkeypatch.setattr("app.services.bellum_api._post", _post)
    out = await bellum_api.relation_stages_by_siren("u-1", sirens=["111222333", "222333444", "abc", "111222333"])
    assert calls == [
        ("/internal/copilot/accounts/relation-stages-by-siren", {"userId": "u-1", "sirens": ["111222333", "222333444"]})
    ]
    assert out == {"111222333": {"relationStage": "client_actif", "source": "missions"}}


@pytest.mark.asyncio
async def test_bridge_client_says_unknown_on_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.services.bellum_api._post", AsyncMock(return_value={"error": "x"}))
    assert await bellum_api.relation_stages_by_siren("u-1", sirens=["111222333"]) is None
    assert await bellum_api.relation_stages_by_siren("u-1", sirens=["abc"]) is None


def _contract(rel: str) -> str | None:
    for parent in Path(__file__).resolve().parents:
        candidate = parent / rel
        if candidate.is_file():
            return re.sub(r"//.*$", "", candidate.read_text(encoding="utf-8"), flags=re.MULTILINE)
    return None


def test_python_copy_of_the_closed_list_matches_the_contract() -> None:
    source = _contract("packages/contracts/src/schemas/sales-context.ts")
    if source is None:
        pytest.skip("monorepo absent (image Railway)")
    match = re.search(r"export const relationshipStateSchema = z\.enum\(\[([^\]]*)\]\)", source)
    assert match is not None
    states = tuple(re.findall(r"'([a-z_0-9]+)'", match.group(1)))
    assert len(states) == 10  # la garde PROUVE qu'elle lit quelque chose
    assert states == RELATIONSHIP_STATES


def test_python_stage_labels_match_the_contract_labels() -> None:
    source = _contract("packages/contracts/src/schemas/case-dimensions.ts")
    if source is None:
        pytest.skip("monorepo absent (image Railway)")
    match = re.search(r"export const CASE_RELATION_LABELS[^=]*= \{([^}]*)\}", source)
    assert match is not None
    labels = dict(re.findall(r"([a-z_0-9]+): '([^']*)'", match.group(1)))
    assert len(labels) == 10
    assert labels == RELATION_STAGE_LABELS
