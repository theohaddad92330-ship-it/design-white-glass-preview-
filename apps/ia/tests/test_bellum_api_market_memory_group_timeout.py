"""Recette prod du 29/09 (#3177/#3225, RÉFUTÉ) — « le groupe La Poste et ses
filiales » : Laura répondait « La mémoire marché n'a pas répondu » alors que le
pont (`market/context-group`) et son contrat (DTO zod) sont corrects — prouvé
par `copilot-bridge.controller.spec.ts` côté NestJS.

`market_memory_context_for_group` fait fan-out sur jusqu'à `MARKET_MEMORY_GROUP_MAX_ENTITIES`
(6) entités, chacune déclenchant plusieurs lectures Postgres côté `coverageFor`
(`resolveDetailed` + la ligne de signal + trois tables observées) — jusqu'à 6×
le travail d'une lecture PAR IDENTITÉ (`market_memory_context_for`, une seule
entité). Le même module réserve déjà un budget plus long pour un fan-out
comparable (`talent_territory_facts`, `_TERRITORY_TIMEOUT_S = 30.0`) ; la
lecture de groupe héritait à tort du timeout d'UNE lecture (`_TIMEOUT_S = 12.0`
secondes) — sous la latence Railway → Supabase (eu-west-1) mesurée en
production, un scope de groupe complet peut dépasser ce budget alors qu'une
lecture par identité seule ne le dépasse jamais. `_post` traite un timeout
comme les deux autres cas « on ne sait pas » (pont éteint, 4xx/5xx) : il rend
``None``, et c'est exactement le message vu en recette.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services import bellum_api


async def test_market_memory_context_for_group_uses_the_group_fan_out_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    async def fake_post(path: str, payload: dict[str, Any], *, timeout_s: float = bellum_api._TIMEOUT_S):
        captured["path"] = path
        captured["timeout_s"] = timeout_s
        return {"status": "ok", "matches": [], "truncated": False}

    monkeypatch.setattr(bellum_api, "_post", fake_post)

    result = await bellum_api.market_memory_context_for_group(
        "user-1",
        root_account_id="account-1",
        entities=[{"ref": "account-1", "companyName": "La Poste"}],
    )

    assert result == {"status": "ok", "matches": [], "truncated": False}
    assert captured["path"] == "/internal/copilot/market/context-group"
    # Le point du bug : ce timeout n'est PLUS celui d'une lecture identité
    # unique — il doit couvrir le fan-out, comme `talent_territory_facts`.
    assert captured["timeout_s"] == bellum_api._MARKET_MEMORY_GROUP_TIMEOUT_S
    assert captured["timeout_s"] > bellum_api._TIMEOUT_S


async def test_market_memory_context_for_single_identity_keeps_the_default_timeout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Témoin — la lecture PAR IDENTITÉ (une seule entité, `market/context`) ne
    doit PAS hériter du budget de groupe : c'est une lecture bornée à trois
    requêtes, le timeout par défaut lui suffit toujours."""
    captured: dict[str, Any] = {}

    async def fake_post(path: str, payload: dict[str, Any], *, timeout_s: float = bellum_api._TIMEOUT_S):
        captured["timeout_s"] = timeout_s
        return {"status": "ok", "coverage": None}

    monkeypatch.setattr(bellum_api, "_post", fake_post)

    await bellum_api.market_memory_context_for("user-1", ref="account-1", company_name="La Poste")

    assert captured["timeout_s"] == bellum_api._TIMEOUT_S
