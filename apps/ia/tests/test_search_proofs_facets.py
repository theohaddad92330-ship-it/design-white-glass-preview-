"""#2424.12 — câblage restant : `search_proofs` ignorait les trois facettes.

`usableProofs` (côté NestJS) sait filtrer par secteur, expertise et
technologies depuis #2424.12, et l'écran `/pilotage/rex` (preuves) les
utilise déjà. Rien ne les relayait depuis Laura : ni le schéma de l'outil, ni
`execute_chat_tool`, ni `bellum_api.usable_proofs`. Ce fichier prouve que les
trois facettes voyagent maintenant de bout en bout, SEULEMENT quand
l'utilisateur les a précisées — jamais devinées.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import execute_chat_tool

USER = "11111111-1111-4111-8111-111111111111"


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)


@pytest.mark.asyncio
async def test_search_proofs_forwards_the_three_facets(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, object]] = []

    async def _proofs(user_id: str, **kwargs: object) -> list[dict]:
        calls.append({"user_id": user_id, **kwargs})
        return []

    monkeypatch.setattr(bellum_api, "usable_proofs", _proofs)
    await execute_chat_tool(
        "search_proofs",
        {"sector": "banque", "expertise": ["cloud", "data"], "technologies": ["Java"]},
        user_id=USER,
        profile_data=None,
    )
    assert calls == [
        {
            "user_id": USER,
            "account_id": None,
            "sector": "banque",
            "expertise": ["cloud", "data"],
            "technologies": ["Java"],
        }
    ]


@pytest.mark.asyncio
async def test_search_proofs_without_facets_filters_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    """Témoin : sans précision, rien n'est filtré — comportement d'avant, inchangé."""
    calls: list[dict[str, object]] = []

    async def _proofs(user_id: str, **kwargs: object) -> list[dict]:
        calls.append({"user_id": user_id, **kwargs})
        return []

    monkeypatch.setattr(bellum_api, "usable_proofs", _proofs)
    await execute_chat_tool("search_proofs", {}, user_id=USER, profile_data=None)
    assert calls == [{"user_id": USER, "account_id": None, "sector": None, "expertise": None, "technologies": None}]


@pytest.mark.asyncio
async def test_search_proofs_drops_blank_entries_never_a_guessed_value(monkeypatch: pytest.MonkeyPatch) -> None:
    """Une liste de chaînes vides n'est pas une expertise : elle retombe sur
    l'absence de filtre, jamais sur un filtre qui ne matcherait jamais rien."""
    calls: list[dict[str, object]] = []

    async def _proofs(user_id: str, **kwargs: object) -> list[dict]:
        calls.append({"user_id": user_id, **kwargs})
        return []

    monkeypatch.setattr(bellum_api, "usable_proofs", _proofs)
    await execute_chat_tool("search_proofs", {"sector": "  ", "expertise": ["", "  "]}, user_id=USER, profile_data=None)
    assert calls == [{"user_id": USER, "account_id": None, "sector": None, "expertise": None, "technologies": None}]
