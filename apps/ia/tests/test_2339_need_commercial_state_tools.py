"""#2339.1/.2/.3/.5/.6/.8/.10/.11/.13 (épopée #2795) — les sept lectures de
l'état canonique commercial & staffing d'un besoin, côté chat.

`CommercialTransitionsService` enregistre déjà les quatre sujets de la chaîne
besoin → shortlist → positionnement → mission ; ce que la conversation ne
pouvait pas encore LIRE. Chaque outil ici :
- refuse HONNÊTEMENT (jamais une réponse vide) quand le pont n'est pas
  configuré ou que le besoin est introuvable ;
- relaie le calcul du pont TEL QUEL, sans second calcul ;
- nomme ce qui manque plutôt que de le taire (`get_need_field_overview`,
  `get_mission_start_checklist`).
"""

from __future__ import annotations

import pytest

from app.services import bellum_api, chat_tools

USER = "22222222-2222-4222-8222-222222222222"


@pytest.fixture(autouse=True)
def _clear_bridge_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("API_INTERNAL_URL", raising=False)
    monkeypatch.delenv("INTERNAL_API_SECRET", raising=False)


async def _run(name: str, payload: dict | None = None) -> dict:
    return await chat_tools.execute_chat_tool(name, payload or {}, user_id=USER, profile_data=None)


TOOL_NAMES = (
    "get_need_journal",
    "get_need_mission_handoff_check",
    "get_need_field_overview",
    "find_need_duplicates",
    "get_mission_start_checklist",
    "get_need_summary",
    "get_need_conversion_result",
    "get_need_no_go_state",
)


def test_all_seven_tools_are_declared_before_push_profile_stays_last() -> None:
    names = [str(tool["name"]) for tool in chat_tools.CHAT_TOOLS]
    for name in TOOL_NAMES:
        assert name in names
    # `push_profile` reste le DERNIER outil du catalogue
    # (`test_chat_push_profile_tool.py:test_push_profile_is_declared_and_appended_last`) :
    # les sept le rejoignent AVANT lui, jamais après.
    assert names[-1] == "push_profile"
    push_profile_index = names.index("push_profile")
    for name in TOOL_NAMES:
        assert names.index(name) < push_profile_index


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "name,payload",
    [
        ("get_need_journal", {"need_id": "n-1"}),
        ("get_need_mission_handoff_check", {"need_id": "n-1"}),
        ("get_need_field_overview", {"need_id": "n-1"}),
        ("find_need_duplicates", {"need_id": "n-1"}),
        ("get_mission_start_checklist", {"mission_id": "m-1"}),
        ("get_need_summary", {"need_id": "n-1"}),
        ("get_need_conversion_result", {"need_id": "n-1"}),
        ("get_need_no_go_state", {"need_id": "n-1"}),
    ],
)
async def test_each_tool_refuses_rather_than_answering_empty_when_bridge_unconfigured(
    name: str, payload: dict
) -> None:
    result = await _run(name, payload)
    assert "error" in result
    assert not any(isinstance(value, (list, int, float)) and value for value in result.values())


@pytest.mark.asyncio
async def test_each_tool_requires_its_identifier_before_calling_the_bridge(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _explode(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("aucun appel réseau sans identifiant")

    monkeypatch.setattr("httpx.AsyncClient", _explode)
    for name in ("get_need_journal", "get_need_mission_handoff_check", "get_need_field_overview"):
        result = await _run(name, {})
        assert "error" in result
    result = await _run("get_mission_start_checklist", {})
    assert "error" in result


@pytest.mark.asyncio
async def test_need_journal_relays_the_merged_entries_unchanged(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def journal(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {
            "needId": "n-1",
            "status": "qualified",
            "entries": [
                {"subjectLabel": "need", "toState": "qualified", "occurredAt": "2026-09-20T10:00:00Z"},
                {"subjectLabel": "mission", "toState": "active", "occurredAt": "2026-09-25T10:00:00Z"},
            ],
        }

    monkeypatch.setattr(bellum_api, "need_journal", journal)
    result = await _run("get_need_journal", {"need_id": "n-1"})
    assert result["status"] == "qualified"
    assert [entry["subjectLabel"] for entry in result["entries"]] == ["need", "mission"]


@pytest.mark.asyncio
async def test_need_missing_from_the_workspace_is_said_not_silently_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def none_result(*_args: object, **_kwargs: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "need_journal", none_result)
    result = await _run("get_need_journal", {"need_id": "n-inconnu"})
    assert "error" in result
    assert "introuvable" in result["error"]


@pytest.mark.asyncio
async def test_mission_handoff_check_names_every_missing_prerequisite(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def check(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {
            "needId": "n-1",
            "status": "client_review",
            "allowed": False,
            "missing": ["consultant_engaged"],
            "existingMissionId": None,
        }

    monkeypatch.setattr(bellum_api, "need_mission_handoff_check", check)
    result = await _run("get_need_mission_handoff_check", {"need_id": "n-1"})
    assert result["allowed"] is False
    assert result["missing"] == ["consultant_engaged"]


@pytest.mark.asyncio
async def test_field_overview_names_the_field_and_distinguishes_the_two_absences(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def read(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {"title": "Architecte Java", "skills": [{"term": "java"}]}

    monkeypatch.setattr(bellum_api, "need_read", read)
    result = await _run("get_need_field_overview", {"need_id": "n-1"})
    by_field = {row["field"]: row for row in result["fields"]}
    assert by_field["title"]["present"] is True
    assert by_field["seniority"] == {"field": "seniority", "present": False, "value": None, "reason_absent": "non_renseigne"}
    # `work_to_do` n'est PAS tenu par le besoin enregistré : absence distincte.
    assert by_field["work_to_do"]["reason_absent"] == "non_suivi"


@pytest.mark.asyncio
async def test_find_need_duplicates_relays_candidates_without_ever_merging(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def duplicates(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {"needId": "n-1", "candidates": [{"needId": "n-2", "title": "Architecte Java", "status": "to_qualify", "reason": "meme_intitule"}]}

    monkeypatch.setattr(bellum_api, "need_duplicates", duplicates)
    result = await _run("find_need_duplicates", {"need_id": "n-1"})
    assert result["candidates"][0]["reason"] == "meme_intitule"
    # L'outil ne fusionne rien : aucune clé d'écriture dans le résultat.
    assert "merged" not in result and "mergedInto" not in result


@pytest.mark.asyncio
async def test_mission_start_checklist_names_seven_tracked_items_never_twelve(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def readiness(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {"verdict": "ready_with_reserves", "missing": [], "reserves": ["daily_rate"]}

    monkeypatch.setattr(bellum_api, "mission_start_readiness", readiness)
    result = await _run("get_mission_start_checklist", {"mission_id": "m-1"})
    assert result["tracked_count"] == 7
    assert len(result["items"]) == 7
    assert result["catalogued_count"] == 12
    assert "je ne les invente pas" in result["note"]
    daily_rate = next(item for item in result["items"] if item["key"] == "daily_rate")
    assert daily_rate == {"key": "daily_rate", "label": "TJM", "done": False, "reserve": True}


@pytest.mark.asyncio
async def test_need_summary_splits_known_from_unknown_fields(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def read(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {"title": "Architecte Java", "status": "qualified"}

    monkeypatch.setattr(bellum_api, "need_read", read)
    result = await _run("get_need_summary", {"need_id": "n-1"})
    assert result["status"] == "qualified"
    known_fields = {row["field"] for row in result["known"]}
    assert "title" in known_fields
    unknown_fields = {row["field"] for row in result["unknown"]}
    assert "work_to_do" in unknown_fields


@pytest.mark.asyncio
async def test_need_conversion_result_names_proof_fields_never_guessed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def missions(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {"needId": "n-1", "missions": [{"id": "m-1", "submissionId": "sub-9", "crmDealId": None, "opportunityId": "opp-1"}]}

    monkeypatch.setattr(bellum_api, "need_missions", missions)
    result = await _run("get_need_conversion_result", {"need_id": "n-1"})
    assert result["missions"][0]["submissionId"] == "sub-9"


@pytest.mark.asyncio
async def test_need_conversion_result_empty_list_is_not_an_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def missions(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {"needId": "n-1", "missions": []}

    monkeypatch.setattr(bellum_api, "need_missions", missions)
    result = await _run("get_need_conversion_result", {"need_id": "n-1"})
    assert result == {"needId": "n-1", "missions": []}
    assert "error" not in result


@pytest.mark.asyncio
async def test_no_go_state_relays_the_named_reasons(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def no_go(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {"needId": "n-1", "status": "won", "noGo": True, "reasons": ["mission_dupliquee"]}

    monkeypatch.setattr(bellum_api, "need_no_go_state", no_go)
    result = await _run("get_need_no_go_state", {"need_id": "n-1"})
    assert result["noGo"] is True
    assert result["reasons"] == ["mission_dupliquee"]
