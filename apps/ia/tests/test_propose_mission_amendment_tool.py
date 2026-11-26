"""#2423.9 — Laura prépare l'avenant, elle n'annonce jamais l'accord obtenu.

Mesuré le 23/09/2026 (registre `.claude/notes/registre-2026-09-20-chat-
lot5.md`, #2423.9) : `MissionAmendmentService` existe côté API (propose/list/
changeStatus), mais AUCUN outil `/chat` ne l'appelle — `git grep -n
"amendment\\|avenant" apps/ia/app/services/chat_tools.py` rendait 0 résultat.
Ce fichier tient le contrat du nouvel outil `propose_mission_amendment` :

1. il exige `mission_id`/`event_type`/`effective_from`/`proof` — jamais un
   avenant sans preuve ni date d'effet ;
2. `event_type` est validé contre le vocabulaire des seize événements connus,
   `pause_cause` contre les quatre causes, et une pause qui COMMENCE exige sa
   cause (#2423.7) ;
3. il vérifie que la mission appartient à l'espace (lecture des avenants déjà
   proposés) AVANT de préparer quoi que ce soit — jamais de proposition sur
   une mission introuvable ;
4. il rend une enveloppe `_proposal()` (« PAS exécutée », `pending_
   confirmation`) qui porte `previous_term`/`new_term` — le DIFF — jamais un
   avenant déjà écrit.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, WRITE_TOOL_NAMES, execute_chat_tool

USER = "11111111-1111-4111-8111-111111111111"
MISSION = "22222222-2222-4222-8222-222222222222"


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "mission_amendments", _amendments_ok)


async def _amendments_ok(*_a: object, **_k: object) -> dict:
    return {"amendments": []}


async def _run(tool_input: dict) -> dict:
    return await execute_chat_tool(
        "propose_mission_amendment", tool_input, user_id=USER, profile_data=None
    )


def _valid_input(**overrides: object) -> dict:
    base = {
        "mission_id": MISSION,
        "event_type": "daily_rate_change",
        "effective_from": "2026-10-01",
        "proof": "E-mail du client du 22/09 confirmant le nouveau TJM",
        "previous_term": {"daily_rate": 550},
        "new_term": {"daily_rate": 600},
    }
    base.update(overrides)
    return base


def test_tool_is_registered_at_the_end_of_chat_tools() -> None:
    # ⚠️ Il n'est plus le DERNIER — #1950.4 (`describe_plan`) a suivi le même
    # jour (vague 28, 23/09/2026), puis #2391 (`propose_focus_plan`), #2324.39
    # (`propose_opportunity_update`), #2376 (`prepare_cold_call`) et #2276
    # (`plan_laura_job`) EN FIN à leur tour. Ce qui se garde est sa position
    # RELATIVE, juste après `get_mission_start_readiness` et avant
    # `propose_focus_plan`, jamais un rang absolu.
    names = [tool["name"] for tool in CHAT_TOOLS]
    assert names.index("propose_mission_amendment") == names.index("get_mission_start_readiness") + 1
    assert names.index("propose_mission_amendment") < names.index("propose_focus_plan")
    assert names.index("propose_focus_plan") < names.index("plan_laura_job")


def test_is_classified_as_a_write_tool() -> None:
    # Une carte qui ÉCRIT au clic (une fois validée) rejoint la famille des
    # propositions — jamais parallélisée avec un autre appel.
    assert "propose_mission_amendment" in WRITE_TOOL_NAMES


@pytest.mark.asyncio
async def test_requires_mission_id() -> None:
    result = await _run(_valid_input(mission_id=""))
    assert "error" in result
    assert "mission" in result["error"].lower()


@pytest.mark.asyncio
async def test_rejects_an_unknown_event_type() -> None:
    result = await _run(_valid_input(event_type="teleportation"))
    assert "error" in result
    assert "type de changement inconnu" in result["error"].lower()


@pytest.mark.asyncio
async def test_requires_effective_from() -> None:
    result = await _run(_valid_input(effective_from=""))
    assert "error" in result
    assert "effet" in result["error"].lower()


@pytest.mark.asyncio
async def test_requires_proof() -> None:
    result = await _run(_valid_input(proof=""))
    assert "error" in result
    assert "preuve" in result["error"].lower()


@pytest.mark.asyncio
async def test_a_pause_start_without_a_cause_is_refused() -> None:
    result = await _run(
        _valid_input(event_type="pause_start", previous_term=None, new_term=None)
    )
    assert "error" in result
    assert "cause" in result["error"].lower()


@pytest.mark.asyncio
async def test_a_pause_start_with_an_unknown_cause_is_refused() -> None:
    result = await _run(
        _valid_input(event_type="pause_start", pause_cause="vacances_surprise")
    )
    assert "error" in result


@pytest.mark.asyncio
async def test_a_pause_start_with_a_named_cause_is_accepted(monkeypatch: pytest.MonkeyPatch) -> None:
    result = await _run(
        _valid_input(
            event_type="pause_start",
            pause_cause="client_closure",
            previous_term=None,
            new_term=None,
        )
    )
    assert result["status"] == "pending_confirmation"
    assert result["proposal"]["pause_cause"] == "client_closure"


@pytest.mark.asyncio
async def test_an_unknown_or_foreign_mission_is_refused_before_any_proposal(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _amendments_none(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "mission_amendments", _amendments_none)
    result = await _run(_valid_input())
    assert "error" in result
    assert result.get("status") != "pending_confirmation"


@pytest.mark.asyncio
async def test_a_valid_proposal_is_never_executed_and_carries_the_diff() -> None:
    result = await _run(_valid_input())
    assert result["status"] == "pending_confirmation"
    assert "PAS exécutée" in result["message"]
    proposal = result["proposal"]
    assert proposal["mission_id"] == MISSION
    assert proposal["event_type"] == "daily_rate_change"
    assert proposal["proof"]
    # Le DIFF que l'écran affichera AVANT toute mise en vigueur — jamais
    # seulement le nouveau terme, sans l'ancien.
    assert proposal["previous_term"] == {"daily_rate": 550}
    assert proposal["new_term"] == {"daily_rate": 600}


@pytest.mark.asyncio
async def test_never_announces_an_agreement_obtained_in_its_own_description() -> None:
    tool = next(item for item in CHAT_TOOLS if item["name"] == "propose_mission_amendment")
    description = tool["description"]
    assert "JAMAIS" in description
    assert "accord déjà obtenu" in description
