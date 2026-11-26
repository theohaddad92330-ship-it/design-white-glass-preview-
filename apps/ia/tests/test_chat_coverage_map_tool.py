"""#2308 (LAU-FINAL-049) — la carte de couverture d'un compte, depuis le chat.

Mesuré le 18/09/2026 : « les ingrédients existent presque tous, le plat
n'existe pas » — `chat_tools.py` portait 34 fonctions dont aucune n'exposait
`CoverageService.computeChatCoverageMapForAccount` (le pont
`internal/copilot/account/coverage-map`) à la conversation. Ce fichier
vérifie que `get_account_coverage_map` RELAIE ce calcul (aucun second calcul,
aucune donnée inventée) et que l'absence de trou ne produit jamais un
`headline` fabriqué.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool

USER = "22222222-2222-4222-8222-222222222222"


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)


async def _run(tool_input: dict) -> dict:
    return await execute_chat_tool("get_account_coverage_map", tool_input, user_id=USER, profile_data=None)


def test_registry_exposes_the_tool() -> None:
    names = {t["name"] for t in CHAT_TOOLS}
    assert "get_account_coverage_map" in names


def test_the_description_warns_unknown_is_never_a_fact() -> None:
    # GA-259 tenue jusqu'au modèle : c'est la description qu'il lit.
    tool = next(t for t in CHAT_TOOLS if t["name"] == "get_account_coverage_map")
    description = str(tool["description"])
    assert "IMPORTANT" in description
    assert "inconnu" in description.lower()


@pytest.mark.asyncio
async def test_relays_the_named_axes_and_the_top_gap_headline(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _coverage_map(*_a: object, **_k: object) -> dict:
        return {
            "account_id": "a-1",
            "generated_at": "2026-09-22T00:00:00.000Z",
            "meaning": "Ce que nous savons, jamais ce que le marché fait.",
            "role_families": [{"role_family": "sponsor", "label": "Sponsor", "state": "unknown", "contact_count": 0}],
            "perimeters": [],
            "sales_stages": [],
            "gaps": [
                {
                    "id": "role_family:sponsor",
                    "axis": "role_family",
                    "key": "sponsor",
                    "label": "Sponsor",
                    "reason": "Aucun sponsor identifié.",
                    "state": "unknown",
                    "priority_category": "bloque_action",
                    "suggested_action": "recherche_ciblee",
                }
            ],
        }

    monkeypatch.setattr(bellum_api, "account_coverage_map", _coverage_map)
    result = await _run({"account_id": "a-1"})
    assert result["meaning"] == "Ce que nous savons, jamais ce que le marché fait."
    assert result["role_families"][0]["role_family"] == "sponsor"
    assert "Sponsor" in result["headline"]


@pytest.mark.asyncio
async def test_no_gap_produces_no_invented_headline(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _coverage_map(*_a: object, **_k: object) -> dict:
        return {"account_id": "a-1", "role_families": [], "perimeters": [], "sales_stages": [], "gaps": []}

    monkeypatch.setattr(bellum_api, "account_coverage_map", _coverage_map)
    result = await _run({"account_id": "a-1"})
    assert result["headline"] is None
    assert "error" not in result


@pytest.mark.asyncio
async def test_refuses_a_foreign_or_missing_account(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _coverage_map(*_a: object, **_k: object) -> dict:
        return {"error": "account_not_found"}

    monkeypatch.setattr(bellum_api, "account_coverage_map", _coverage_map)
    result = await _run({"account_id": "a-x"})
    assert "error" in result
    assert "role_families" not in result


@pytest.mark.asyncio
async def test_bridge_not_configured_says_so_instead_of_an_empty_map(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: False)
    result = await _run({"account_id": "a-1"})
    assert "error" in result
    assert "role_families" not in result


@pytest.mark.asyncio
async def test_requires_an_account_id() -> None:
    result = await _run({})
    assert "error" in result
