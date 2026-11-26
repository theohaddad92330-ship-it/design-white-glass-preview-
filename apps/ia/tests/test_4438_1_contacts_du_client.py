"""#4438.1 (recette prod 23/10) — « liste complète des ESN concurrentes chez Airbus avec leurs contacts » : les
contacts rendus étaient ceux des ESN (Thales DMS), pas ceux du client. L'outil dit lui-même de quel compte
viennent les contacts, dans sa description ET dans sa sortie."""

from __future__ import annotations

from typing import Any

import pytest

from app.services import chat_tools
from app.services.chat_tools import ESN_ON_ACCOUNT_CONTACTS_RULE, ESN_ON_ACCOUNT_TOOL, execute_chat_tool


def test_the_tool_description_pins_the_contacts_to_the_client_account() -> None:
    assert ESN_ON_ACCOUNT_CONTACTS_RULE in ESN_ON_ACCOUNT_TOOL["description"]
    assert "JAMAIS les contacts des ESN" in ESN_ON_ACCOUNT_CONTACTS_RULE


@pytest.mark.asyncio
async def test_the_output_names_the_client_account_as_the_contacts_scope(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _owned(*_a: Any, **_k: Any) -> dict[str, Any]:
        return {"id": "acc-airbus"}

    async def _partners(_user: str, account_id: str) -> dict[str, Any]:
        return {"partners": [{"name": "ALTEN"}], "account_id": account_id}

    monkeypatch.setattr("app.services.ownership.fetch_owned_account", _owned)
    monkeypatch.setattr("app.services.supabase_client.get_supabase", lambda: object())
    monkeypatch.setattr("app.services.bellum_api.is_configured", lambda: True)
    monkeypatch.setattr("app.services.bellum_api.account_partners", _partners)
    out = await execute_chat_tool("get_esn_on_account", {"account_id": "acc-airbus"}, user_id="u-1", profile_data=None)
    assert out["contacts_scope"]["kind"] == "client_account"
    assert out["contacts_scope"]["account_id"] == "acc-airbus"
    assert chat_tools is not None
