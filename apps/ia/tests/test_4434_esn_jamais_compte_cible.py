"""#4434.3 (recette prod 23/10) — « des comptes qui cherchent du React » : les 2 comptes rendus étaient des ESN.

Une ESN n'est jamais un compte cible : elle est écartée de la liste et rangée à part (`competitors_aside`),
nommée concurrente. La garde sait dire NON : une recherche par NOM (« Sopra ») garde l'ESN demandée.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services.chat_tools import execute_chat_tool


class _Response:
    def __init__(self, candidates: list[dict[str, Any]]) -> None:
        self.candidates = candidates
        self.degraded: list[dict[str, Any]] = []
        self.query: dict[str, Any] = {}
        self.recommendedSort = "balanced"


# #4421.3 — un compte listé pour un recrutement porte son offre datée (sinon il sort de la liste principale).
_OFFRE = {"latestOffer": {"title": "Développeur React H/F", "date": "2026-10-20"}}
CANDIDATES = [
    {
        "name": "ZEBRA NUMERIQUE",
        "siren": "300000001",
        "nafCode": "62.02A",
        "headcountRange": "1000 à 1999 salariés",
        "skillEvidence": _OFFRE,
    },
    {
        "name": "Airbus Atlantic",
        "siren": "300000002",
        "nafCode": "30.30Z",
        "headcountRange": "1000 à 1999 salariés",
        "skillEvidence": _OFFRE,
    },
]


async def _search(monkeypatch: pytest.MonkeyPatch, tool_input: dict[str, Any]) -> dict[str, Any]:
    async def _fake(req: Any) -> Any:
        return _Response([dict(c) for c in CANDIDATES])

    monkeypatch.setattr("app.routers.discover.discover_registry", _fake)
    out = await execute_chat_tool("run_account_search", tool_input, user_id="u-1", profile_data=None)
    assert isinstance(out, dict)
    return out


@pytest.mark.asyncio
async def test_4434_3_an_esn_is_set_aside_not_ranked_as_a_target(monkeypatch: pytest.MonkeyPatch) -> None:
    out = await _search(monkeypatch, {"technologies": ["React"], "signals": ["hiring"], "department": "31"})
    assert [i["name"] for i in out["items"]] == ["Airbus Atlantic"]
    aside = out["competitors_aside"]
    assert [i["name"] for i in aside] == ["ZEBRA NUMERIQUE"]
    assert aside[0]["relation_label"] == "ESN concurrente"


@pytest.mark.asyncio
async def test_4434_3_a_search_by_name_keeps_the_esn_asked_for(monkeypatch: pytest.MonkeyPatch) -> None:
    out = await _search(monkeypatch, {"keywords": "ZEBRA NUMERIQUE", "department": "31"})
    assert "ZEBRA NUMERIQUE" in [i["name"] for i in out["items"]]
    assert "competitors_aside" not in out
