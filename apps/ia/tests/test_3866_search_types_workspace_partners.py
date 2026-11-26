"""#3866 (reste) — `run_account_search` type « partenaire » un résultat dont le SIREN est
celui d'un partenaire DÉCLARÉ de l'espace (relation d'espace lue par le pont #3247),
au lieu de ne le faire que sur un partenaire déclaré à la main.

Le type calculé sur la forme juridique et l'activité ne bouge pas pour les autres lignes ;
un pont éteint ne pose rien (jamais un type deviné)."""

from __future__ import annotations

import inspect

import pytest

from app.services import bellum_api, chat_tools

USER = "11111111-1111-4111-8111-111111111111"


@pytest.mark.asyncio
async def test_a_workspace_partner_siren_types_the_row_partner(monkeypatch: pytest.MonkeyPatch) -> None:
    async def access(user_id: str, *, sirens: list[str]) -> dict:
        assert user_id == USER
        return {"123456789": {"paths": [], "is_workspace_partner": {"name": "Acme ESN"}}, "987654321": {"paths": []}}

    monkeypatch.setattr(bellum_api, "access_by_siren", access)
    items = [
        {"name": "Acme", "siren": "123456789", "relation_type": "competing_esn", "relation_label": "ESN concurrente"},
        {"name": "Autre", "siren": "987654321", "relation_type": "end_client", "relation_label": "client final"},
        {"name": "Sans siren", "relation_type": "end_client", "relation_label": "client final"},
    ]
    await chat_tools._attach_workspace_partner_relation(items, USER)
    assert items[0]["relation_type"] == "partner"
    assert items[0]["relation_label"] == "partenaire"
    assert "relation_type_reason" not in items[0]
    assert items[1]["relation_type"] == "end_client"
    assert items[2]["relation_type"] == "end_client"


@pytest.mark.asyncio
async def test_a_dead_bridge_changes_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    async def access(user_id: str, *, sirens: list[str]) -> None:
        return None

    monkeypatch.setattr(bellum_api, "access_by_siren", access)
    items = [
        {"name": "Acme", "siren": "123456789", "relation_type": "competing_esn", "relation_label": "ESN concurrente"}
    ]
    await chat_tools._attach_workspace_partner_relation(items, USER)
    assert items[0]["relation_type"] == "competing_esn"


@pytest.mark.asyncio
async def test_a_failing_bridge_changes_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    async def access(user_id: str, *, sirens: list[str]) -> dict:
        raise RuntimeError("réseau")

    monkeypatch.setattr(bellum_api, "access_by_siren", access)
    items = [{"name": "Acme", "siren": "123456789", "relation_type": "end_client", "relation_label": "client final"}]
    await chat_tools._attach_workspace_partner_relation(items, USER)
    assert items[0]["relation_type"] == "end_client"


def test_the_search_dispatch_calls_it() -> None:
    # L'APPELANT réel : la fonction n'est pas du code mort.
    source = inspect.getsource(chat_tools._execute_chat_tool_dispatch)
    assert "_attach_workspace_partner_relation(" in source
