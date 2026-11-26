"""#2324.39 — Laura PRÉPARE une mise à jour d'opportunité, diff à l'appui.

Mesuré le 18/09 puis le 23/09 (registre `registre-2026-09-18-chat-opportunity-
compiler.md`, #2324.39) : aucun outil `/chat` n'écrivait sur une opportunité,
et « diff avant écriture » rendait 0 résultat. Ce fichier tient le contrat de
`propose_opportunity_update` :

1. l'« avant » du diff est LU (pont `projects/read`), jamais deviné par le
   modèle — un champ inconnu vaut `None`, jamais 0 ;
2. seuls les champs qui CHANGENT entrent dans le diff ; un diff vide se refuse ;
3. gagné/perdu ne se proposent pas depuis le chat (panneau d'effets et raison
   de perte à l'écran) ; une étape hors vocabulaire se refuse ;
4. la preuve est obligatoire ;
5. l'enveloppe est `_proposal()` (« PAS exécutée ») — jamais une écriture.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.services import bellum_api
from app.services.chat_tools import (
    CHAT_TOOLS,
    OPPORTUNITY_UPDATE_STAGES,
    WRITE_TOOL_NAMES,
    execute_chat_tool,
)

USER = "11111111-1111-4111-8111-111111111111"
PROJECT = "33333333-3333-4333-8333-333333333333"
CURRENT = {
    "id": PROJECT,
    "label": "Refonte data",
    "company_name": "SNCF",
    "stage": "qualified",
    "estimated_amount": None,
    "next_step": "Atelier cadrage",
    "risk": None,
}


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _read(*_a: object, **_k: object) -> dict:
        return {"project": dict(CURRENT)}

    monkeypatch.setattr(bellum_api, "project_read", _read)


async def _run(tool_input: dict) -> dict:
    return await execute_chat_tool("propose_opportunity_update", tool_input, user_id=USER, profile_data=None)


def test_registered_and_classified_as_a_write_tool() -> None:
    assert "propose_opportunity_update" in {tool["name"] for tool in CHAT_TOOLS}
    assert "propose_opportunity_update" in WRITE_TOOL_NAMES


def test_stages_mirror_the_typescript_contract_minus_closing() -> None:
    project_ts = (
        Path(__file__).resolve().parents[3] / "packages" / "contracts" / "src" / "schemas" / "project.ts"
    ).read_text(encoding="utf-8")
    block = re.search(r"export const PROJECT_STAGES = \[(.*?)\] as const", project_ts, re.S)
    assert block, "PROJECT_STAGES introuvable — la parité ne lit plus rien"
    stages = re.findall(r"'([a-z_]+)'", block.group(1))
    assert len(stages) >= 9
    assert list(OPPORTUNITY_UPDATE_STAGES) == [s for s in stages if s not in ("won", "lost")]


@pytest.mark.asyncio
async def test_diff_is_frozen_from_the_read_state_and_keeps_only_what_changes() -> None:
    out = await _run(
        {
            "project_id": PROJECT,
            "stage": "confirmed",
            "estimated_amount": 120000,
            "next_step": "Atelier cadrage",  # identique : aucune ligne
            "proof": "Compte rendu du 22/09",
        }
    )
    assert out["status"] == "pending_confirmation"
    proposal = out["proposal"]
    assert proposal["action"] == "propose_opportunity_update"
    assert proposal["project_label"] == "Refonte data"
    assert proposal["changes"] == [
        {"field": "stage", "previous": "qualified", "next": "confirmed"},
        # « avant » inconnu : None, jamais 0.
        {"field": "estimated_amount", "previous": None, "next": 120000},
    ]
    assert proposal["cost_credits"] == 0


@pytest.mark.asyncio
async def test_says_no_to_an_empty_diff_a_closing_stage_an_unknown_stage_and_a_missing_proof() -> None:
    assert "error" in await _run({"project_id": PROJECT, "stage": "qualified", "proof": "x"})
    assert "error" in await _run({"project_id": PROJECT, "stage": "won", "proof": "x"})
    assert "error" in await _run({"project_id": PROJECT, "stage": "signed", "proof": "x"})
    assert "error" in await _run({"project_id": PROJECT, "stage": "confirmed"})
    assert "error" in await _run({"project_id": PROJECT, "estimated_amount": -5, "proof": "x"})


@pytest.mark.asyncio
async def test_unknown_or_foreign_opportunity_prepares_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _not_found(*_a: object, **_k: object) -> dict:
        return {"error": "project_not_found"}

    monkeypatch.setattr(bellum_api, "project_read", _not_found)
    out = await _run({"project_id": PROJECT, "stage": "confirmed", "proof": "x"})
    assert "error" in out and "proposal" not in out


@pytest.mark.asyncio
async def test_a_risk_enters_the_same_diff_2324_37() -> None:
    """#2324.37 — le RISQUE de l'affaire : « avant » lu (None = jamais écrit)."""
    out = await _run({"project_id": PROJECT, "risk": "  Budget 2027 non voté ", "proof": "E-mail du 22/09"})
    assert out["proposal"]["changes"] == [{"field": "risk", "previous": None, "next": "Budget 2027 non voté"}]


def test_the_tool_schema_offers_the_risk_field() -> None:
    tool = next(t for t in CHAT_TOOLS if t["name"] == "propose_opportunity_update")
    assert "risk" in tool["input_schema"]["properties"]
