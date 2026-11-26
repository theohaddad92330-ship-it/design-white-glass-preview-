"""#2407.9 — Laura cite l'écart entre le bon de commande et la fin opérationnelle.

`po_valid_until` (la validité du bon de commande, donnée `finance:read`) voyage
jusqu'au copilote SEULEMENT quand le pont l'a servie — c'est-à-dire quand la
personne qui chatte porte `finance:read` (précédent « LOT 15, ARBITRAGE B »). Sans
ce droit, l'outil le DIT : jamais une absence qui se lirait « pas de bon de
commande ».
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import MISSIONS_ENDING_TOOL, execute_chat_tool

USER = "22222222-2222-4222-8222-222222222222"


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)


async def _run(tool_input: dict | None = None) -> dict:
    return await execute_chat_tool("search_missions", tool_input or {}, user_id=USER, profile_data=None)


@pytest.mark.asyncio
async def test_transports_the_po_validity_next_to_the_operational_end(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _missions(*_a: object, **_k: object) -> dict:
        return {
            "poValidityReadable": True,
            "missions": [
                {
                    "id": "m-1",
                    "label": "Socle",
                    "ends_on": "2026-12-31",
                    "renewal": "j60",
                    "poValidUntil": "2026-10-31",
                },
                {"id": "m-2", "label": "Data", "ends_on": "2026-11-30", "renewal": "j60", "poValidUntil": None},
            ],
        }

    monkeypatch.setattr(bellum_api, "missions_ending", _missions)
    out = await _run()
    first, second = out["missions"]
    assert first["ends_on"] == "2026-12-31"
    assert first["po_valid_until"] == "2026-10-31"
    # Lu, et vide : AUCUNE validité saisie — ce n'est pas « non autorisé ».
    assert second["po_valid_until"] is None
    assert "po_validity" not in out


@pytest.mark.asyncio
async def test_says_when_the_po_validity_is_not_permitted(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _missions(*_a: object, **_k: object) -> dict:
        return {
            "poValidityReadable": False,
            "missions": [{"id": "m-1", "label": "Socle", "ends_on": "2026-12-31", "renewal": "j60"}],
        }

    monkeypatch.setattr(bellum_api, "missions_ending", _missions)
    out = await _run()
    assert out["po_validity"] == "not_permitted"
    # La clé n'existe pas sur la ligne : on n'affiche pas ce qu'on n'a pas.
    assert "po_valid_until" not in out["missions"][0]


def test_the_tool_description_names_the_two_dates() -> None:
    description = MISSIONS_ENDING_TOOL["description"]
    assert "po_valid_until" in description
    assert "ends_on" in description
