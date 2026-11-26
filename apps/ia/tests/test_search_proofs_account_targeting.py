"""#2424.13 — `search_proofs` ignorait TOUJOURS le compte nommé.

Laura recevait la bibliothèque de preuves entière quelle que soit la question
posée : `usable_proofs(user_id)` ne portait aucun `account_id`, et côté NestJS
`usableProofs(workspaceId, null)` était appelé en dur
(`copilot-bridge.controller.ts`). Le paramètre de ciblage (`targetAccountId`)
existait déjà dans le service — rien ne le lui transmettait jamais depuis ici.

Ce fichier prouve que l'outil relaie maintenant `account_id`, quand connu,
jusqu'à `bellum_api.usable_proofs`, et retombe sur l'ABSENCE de ciblage sinon
— la bibliothèque entière reste le comportement par défaut, inchangé.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import execute_chat_tool

USER = "11111111-1111-4111-8111-111111111111"
ACCOUNT = "22222222-2222-4222-8222-222222222222"


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)


@pytest.mark.asyncio
async def test_search_proofs_forwards_the_named_account(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, str | None]] = []

    async def _proofs(user_id: str, *, account_id: str | None = None, **_: object) -> list[dict]:
        calls.append((user_id, account_id))
        return []

    monkeypatch.setattr(bellum_api, "usable_proofs", _proofs)
    await execute_chat_tool("search_proofs", {"account_id": ACCOUNT}, user_id=USER, profile_data=None)
    assert calls == [(USER, ACCOUNT)]


@pytest.mark.asyncio
async def test_search_proofs_without_an_account_targets_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    """Témoin : sans compte connu, on ne cible rien — jamais une chaîne vide
    qui se lirait comme un identifiant."""

    calls: list[tuple[str, str | None]] = []

    async def _proofs(user_id: str, *, account_id: str | None = None, **_: object) -> list[dict]:
        calls.append((user_id, account_id))
        return []

    monkeypatch.setattr(bellum_api, "usable_proofs", _proofs)
    await execute_chat_tool("search_proofs", {}, user_id=USER, profile_data=None)
    assert calls == [(USER, None)]
