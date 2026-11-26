"""#3866 (recette prod 11/10 soir) — après « affine sur 250-999 salariés », l'en-tête de la recherche ne
cite plus Data/BI alors que les cartes sont jugées à son aune. L'offre visée est un critère ECHOÉ
(`criteria.offer`) et un axe nommé : le commercial voit la lentille qui a servi à juger chaque compte.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services.chat_tools import execute_chat_tool

USER = "99999999-9999-4999-8999-999999999999"


class _Response:
    def __init__(self) -> None:
        self.candidates: list[dict[str, Any]] = [
            {
                "siren": "552032534",
                "name": "FREE SAS",
                "city": "Paris",
                "department": "75",
                "headcount": 1200,
                "nafLabel": "Télécommunications filaires",
                "qualification": {"verdict": "recommended"},
                "sources": [{"name": "registre", "fetchedAt": "2026-09-16T15:26:00+00:00"}],
            }
        ]
        self.degraded: list[Any] = []
        self.query: dict[str, Any] = {}
        self.recommendedSort = "balanced"


@pytest.fixture(autouse=True)
def _registry(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake(req: Any) -> Any:
        return _Response()

    monkeypatch.setattr("app.routers.discover.discover_registry", _fake)


async def _run(**extra: Any) -> dict[str, Any]:
    return await execute_chat_tool(
        "run_account_search", {"department": "75", **extra}, user_id=USER, profile_data=None
    )


@pytest.mark.asyncio
async def test_the_offer_is_echoed_in_the_criteria_and_named_as_an_axis() -> None:
    out = await _run(offer="Data/BI")
    assert out["criteria"]["offer"] == "Data/BI"
    assert any("Data/BI" in axis and "Offre" in axis for axis in out["axes"])


@pytest.mark.asyncio
async def test_without_an_offer_nothing_is_added() -> None:
    out = await _run()
    assert "offer" not in out["criteria"]
    assert not any("Offre" in axis for axis in out["axes"])


@pytest.mark.asyncio
async def test_the_offer_axis_never_pushes_the_register_axis_out() -> None:
    out = await _run(offer="Data/BI", sectors=["Banque"], headcount="250-999", keywords="Free")
    assert "Établissement actif au registre" in out["axes"]
    assert any("Data/BI" in axis for axis in out["axes"])
