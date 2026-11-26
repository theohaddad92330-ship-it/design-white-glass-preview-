"""#2852.6-53 (lot V22, suite) — enveloppe canonique de résultat d'outil
câblée sur `get_account_timeline`, cinquième outil réel après
search_workspace_contacts/search_workspace_accounts/get_accounts_by_owner/
get_account_contacts.

Particularité de ce cinquième outil : il utilise déjà `tool_error_taxonomy`
(``tool_error_payload``/``ToolErrorCode``) pour ses deux échecs pont —
``error_code``/``retryable`` sont un contrat ACTIF lu par
``tool_resilience.execute_chat_tool_resilient`` pour décider d'une nouvelle
tentative automatique. On NE remplace PAS ce contrat par celui de
``tool_result_envelope`` (deux vocabulaires d'erreur pour la même situation
romprait « un réglage vit à un seul endroit », GA-26) : on ADDITIONNE
`status`/`result_type`/`suggested_next_step` par-dessus, `error_code` et
`retryable` restent ceux déjà posés par la taxonomie.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import execute_chat_tool

USER = "33333333-3333-4333-8333-333333333333"


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)


async def _run(tool_input: dict) -> dict:
    return await execute_chat_tool("get_account_timeline", tool_input, user_id=USER, profile_data=None)


@pytest.mark.asyncio
async def test_missing_account_id_names_invalid_input() -> None:
    result = await _run({})
    assert result["status"] == "invalid_input"
    assert result["error_code"] == "missing_account_id"
    assert result["suggested_next_step"]


@pytest.mark.asyncio
async def test_bridge_off_names_not_covered_and_keeps_the_taxonomy_contract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: False)
    result = await _run({"account_id": "a-1"})
    assert result["status"] == "not_covered"
    # Contrat existant (tool_error_taxonomy), pas remplacé.
    assert result["error_code"] == "source_not_covered"
    assert result["retryable"] is False


@pytest.mark.asyncio
async def test_bridge_failure_names_provider_error_and_stays_retryable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _timeline(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "account_timeline", _timeline)
    result = await _run({"account_id": "a-1"})
    assert result["status"] == "provider_error"
    # Contrat existant lu par tool_resilience.py : ne casse jamais le retry.
    assert result["error_code"] == "temporarily_unavailable"
    assert result["retryable"] is True


@pytest.mark.asyncio
async def test_foreign_or_missing_account_names_empty_never_a_distinct_permission_code(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _timeline(*_a: object, **_k: object) -> dict:
        return {"error": "account_not_found"}

    monkeypatch.setattr(bellum_api, "account_timeline", _timeline)
    result = await _run({"account_id": "a-x"})
    assert result["status"] == "empty"
    assert "error_code" not in result


@pytest.mark.asyncio
async def test_a_real_empty_history_names_empty_with_sources(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _timeline(*_a: object, **_k: object) -> dict:
        return {"events": []}

    monkeypatch.setattr(bellum_api, "account_timeline", _timeline)
    result = await _run({"account_id": "a-1"})
    assert result["status"] == "empty"
    assert result["sources_consulted"] == ["bellum_workspace"]
    assert result["sources_succeeded"] == ["bellum_workspace"]


@pytest.mark.asyncio
async def test_a_capped_history_names_partial_with_its_reason(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _timeline(*_a: object, **_k: object) -> dict:
        return {
            "events": [
                {"id": f"action:{i}", "kind": "action", "at": "2026-07-03T09:00:00Z", "label": f"E{i}"}
                for i in range(25)
            ]
        }

    monkeypatch.setattr(bellum_api, "account_timeline", _timeline)
    result = await _run({"account_id": "a-1"})
    assert result["status"] == "partial"
    assert result["partial_reason"]
    assert result["returned_count"] == 20


@pytest.mark.asyncio
async def test_a_short_history_names_success(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _timeline(*_a: object, **_k: object) -> dict:
        return {"events": [{"id": "action:1", "kind": "action", "at": "2026-07-03T09:00:00Z", "label": "E1"}]}

    monkeypatch.setattr(bellum_api, "account_timeline", _timeline)
    result = await _run({"account_id": "a-1"})
    assert result["status"] == "success"
    assert "partial_reason" not in result
