"""#2852.6-53 (suite) — enveloppe canonique de résultat d'outil câblée sur
`get_account_coverage_map` et `get_account_manager_review`, sixième et
septième outils réels après search_workspace_contacts/search_workspace_accounts/
get_accounts_by_owner/get_account_contacts/get_account_timeline/get_account_briefing.

Lectures à UN seul enregistrement (pas de liste, pas de `total`/`truncated`)
sur un pont interne (`bellum_api`) — même contrat que `get_account_briefing` :
`not_covered` quand le pont est éteint, `provider_error` quand il ne répond
pas, `empty` (jamais un code de permission distinct) quand le compte est
introuvable ou hors portefeuille, `success` sinon.

#3277.1 (épopée #3277, BEL-SC-225 suite) — `get_account_strategy_5p` rejoint
ce même contrat : la MÊME enveloppe, sur le MÊME pont interne.

#3258.14 (épopée #3362, lot E25 30/09) — `get_account_interest_penetrability`
rejoint ce même contrat, encore : la MÊME enveloppe, sur le MÊME pont interne
(`AccountInterestPenetrabilityService.matrixFor`, déjà la maison canonique de
la fiche compte et du panneau Pilotage — aucun second calcul de quadrant).
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import execute_chat_tool

USER = "55555555-5555-4555-8555-555555555555"


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)


@pytest.mark.parametrize(
    ("tool_name", "bridge_attr", "result_type"),
    [
        ("get_account_coverage_map", "account_coverage_map", "account_coverage_map"),
        ("get_account_manager_review", "account_manager_review", "account_manager_review"),
        ("get_account_strategy_5p", "account_strategy_5p", "account_strategy_5p"),
        (
            "get_account_interest_penetrability",
            "account_interest_penetrability",
            "account_interest_penetrability",
        ),
    ],
)
class TestAccountSingleRecordEnvelope:
    async def _run(self, tool_name: str, tool_input: dict) -> dict:
        return await execute_chat_tool(tool_name, tool_input, user_id=USER, profile_data=None)

    @pytest.mark.asyncio
    async def test_missing_account_id_names_invalid_input(self, tool_name, bridge_attr, result_type) -> None:
        result = await self._run(tool_name, {})
        assert result["status"] == "invalid_input"
        assert result["result_type"] == result_type
        assert result["error_code"] == "missing_account_id"
        assert result["suggested_next_step"]

    @pytest.mark.asyncio
    async def test_bridge_off_names_not_covered(
        self, monkeypatch: pytest.MonkeyPatch, tool_name, bridge_attr, result_type
    ) -> None:
        monkeypatch.setattr(bellum_api, "is_configured", lambda: False)
        result = await self._run(tool_name, {"account_id": "a-1"})
        assert result["status"] == "not_covered"
        assert result["result_type"] == result_type

    @pytest.mark.asyncio
    async def test_no_response_names_provider_error(
        self, monkeypatch: pytest.MonkeyPatch, tool_name, bridge_attr, result_type
    ) -> None:
        async def _none(*_a: object, **_k: object) -> None:
            return None

        monkeypatch.setattr(bellum_api, bridge_attr, _none)
        result = await self._run(tool_name, {"account_id": "a-1"})
        assert result["status"] == "provider_error"
        assert result["result_type"] == result_type

    @pytest.mark.asyncio
    async def test_foreign_or_missing_account_names_empty_never_a_distinct_permission_code(
        self, monkeypatch: pytest.MonkeyPatch, tool_name, bridge_attr, result_type
    ) -> None:
        async def _foreign(*_a: object, **_k: object) -> dict:
            return {"error": "account_not_found"}

        monkeypatch.setattr(bellum_api, bridge_attr, _foreign)
        result = await self._run(tool_name, {"account_id": "a-x"})
        assert result["status"] == "empty"
        assert "error_code" not in result

    @pytest.mark.asyncio
    async def test_a_real_result_names_success(
        self, monkeypatch: pytest.MonkeyPatch, tool_name, bridge_attr, result_type
    ) -> None:
        async def _ok(*_a: object, **_k: object) -> dict:
            return {"kind": "any"}

        monkeypatch.setattr(bellum_api, bridge_attr, _ok)
        result = await self._run(tool_name, {"account_id": "a-1"})
        assert result["status"] == "success"
        assert result["result_type"] == result_type
        assert result["sources_consulted"] == ["bellum_workspace"]
        assert result["sources_succeeded"] == ["bellum_workspace"]
