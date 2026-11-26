"""#2302 (LAU-FINAL-043) — l'outil `/chat` `resolve_account_territory`.

L'APPELANT : un résolveur juste que personne n'appelle ne compte pas. Ce test
prouve que le tool est dans `CHAT_TOOLS` (Laura peut le choisir) et que
l'exécuteur lit `raw_analysis.entities_exhaustive` du compte du portefeuille
de l'utilisateur (même lecture que `get_account_briefing`,
`fetch_owned_account` — aucun second calcul) avant d'appeler
`resolve_commercial_territory`.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.services import ownership, supabase_client
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool

USER = "33333333-3333-4333-8333-333333333333"


def test_registry_exposes_the_tool_with_the_sector_vocabulary():
    tool = next(t for t in CHAT_TOOLS if t["name"] == "resolve_account_territory")
    assert tool["input_schema"]["required"] == ["account_id"]
    sector_prop = tool["input_schema"]["properties"]["sector"]
    assert set(sector_prop["enum"]) == {"it_data_cyber", "industrie", "environnement", "automobile", "pharma"}


async def _run(tool_input: dict) -> dict:
    return await execute_chat_tool("resolve_account_territory", tool_input, user_id=USER, profile_data=None)


@pytest.mark.asyncio
async def test_reads_the_account_entities_and_recommends_a_scope(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fetch(_sb: object, account_id: str, user_id: str, columns: str = "*") -> dict:
        assert user_id == USER  # scopé au portefeuille de l'appelant
        return {
            "id": account_id,
            "raw_analysis": {
                "entities_exhaustive": [
                    {"name": "Groupe X", "type": "groupe", "parent": None},
                    {
                        "name": "Filiale Y",
                        "type": "filiale",
                        "parent": "Groupe X",
                        "region": "PACA",
                        "it_autonomy": "autonome",
                    },
                ]
            },
        }

    monkeypatch.setattr(ownership, "fetch_owned_account", _fetch)
    monkeypatch.setattr(supabase_client, "get_supabase", lambda: None)

    result = await _run({"account_id": "a-1"})
    assert result["primary"]["name"] == "Filiale Y"
    assert result["primary"]["level"] == "filiale"
    # #2302.64 — le groupe n'est jamais l'alternative non plus.
    assert result["alternate"] is None


@pytest.mark.asyncio
async def test_tolerates_the_camelcase_key_and_a_missing_raw_analysis(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fetch(_sb: object, account_id: str, user_id: str, columns: str = "*") -> dict:
        return {"id": account_id, "raw_analysis": {"entitiesExhaustive": [{"name": "BU Data", "type": "bu"}]}}

    monkeypatch.setattr(ownership, "fetch_owned_account", _fetch)
    monkeypatch.setattr(supabase_client, "get_supabase", lambda: None)

    result = await _run({"account_id": "a-2"})
    assert result["primary"]["name"] == "BU Data"


@pytest.mark.asyncio
async def test_says_rien_dobserve_without_inventing_a_scope(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fetch(_sb: object, account_id: str, user_id: str, columns: str = "*") -> dict:
        return {"id": account_id, "raw_analysis": {}}

    monkeypatch.setattr(ownership, "fetch_owned_account", _fetch)
    monkeypatch.setattr(supabase_client, "get_supabase", lambda: None)

    result = await _run({"account_id": "a-3"})
    assert result["primary"] is None
    assert result["primary_reason"] == "rien d'observé"


@pytest.mark.asyncio
async def test_refuses_a_foreign_or_missing_account(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fetch(*_a: object, **_k: object) -> dict:
        raise HTTPException(status_code=404)

    monkeypatch.setattr(ownership, "fetch_owned_account", _fetch)
    monkeypatch.setattr(supabase_client, "get_supabase", lambda: None)

    result = await _run({"account_id": "not-mine"})
    # #3195 — le refus garde son message exact et porte le geste suivant.
    assert result["error"] == "Compte introuvable dans votre portefeuille."
    assert "web_search" in result["next_step"]


@pytest.mark.asyncio
async def test_requires_an_account_id() -> None:
    result = await _run({})
    assert "error" in result


@pytest.mark.asyncio
async def test_reads_the_purchasing_thread_already_stored_on_the_account(monkeypatch: pytest.MonkeyPatch) -> None:
    # #2302.26/.53/.55 (épopée #2961) — `purchasingThread.byBuyer` est déjà
    # stocké sur le compte (phase1_research.py:1629) : le tool le relit tel
    # quel, jamais un second calcul des marchés DECP.
    async def _fetch(_sb: object, account_id: str, user_id: str, columns: str = "*") -> dict:
        return {
            "id": account_id,
            "raw_analysis": {
                "entities_exhaustive": [{"name": "Filiale Y", "type": "filiale"}],
                "purchasingThread": {
                    "byBuyer": [{"name": "Filiale Y", "contractsAwarded": 2, "suppliers": ["Capgemini"]}]
                },
            },
        }

    monkeypatch.setattr(ownership, "fetch_owned_account", _fetch)
    monkeypatch.setattr(supabase_client, "get_supabase", lambda: None)

    result = await _run({"account_id": "a-5"})
    assert result["primary"]["achats"]["contractsAwarded"] == 2
    assert result["primary"]["recours_externe_observe"] == ["Capgemini"]


@pytest.mark.asyncio
async def test_reads_the_ideal_client_territory_already_declared_at_onboarding(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # #2302.18 (épopée #2961) — `ideal_client_territory` est déjà collecté à
    # l'onboarding (answers-client-ideal.ts) : le tool le relit tel quel,
    # jamais un second champ de préférence géographique.
    async def _fetch(_sb: object, account_id: str, user_id: str, columns: str = "*") -> dict:
        return {
            "id": account_id,
            "raw_analysis": {
                "entities_exhaustive": [
                    {
                        "name": "Filiale Nord",
                        "type": "filiale",
                        "region": "Hauts-de-France",
                        "it_autonomy": "centralise",
                    },
                    {"name": "Filiale IDF", "type": "filiale", "region": "Île-de-France", "it_autonomy": "centralise"},
                ]
            },
        }

    monkeypatch.setattr(ownership, "fetch_owned_account", _fetch)
    monkeypatch.setattr(supabase_client, "get_supabase", lambda: None)

    result = await execute_chat_tool(
        "resolve_account_territory",
        {"account_id": "a-6"},
        user_id=USER,
        profile_data={"ideal_client_territory": ["Île-de-France"]},
    )
    assert result["primary"]["name"] == "Filiale IDF"


@pytest.mark.asyncio
async def test_reads_the_camelcase_reference_accounts_of_the_chat_profile(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # #3476 — le profil du chat est produit par `esnAnswersToProfileData` : `referenceAccounts`
    # (camelCase). Sans cette lecture, `references_comparables` restait vide en production.
    async def _fetch(_sb: object, account_id: str, user_id: str, columns: str = "*") -> dict:
        return {"id": account_id, "raw_analysis": {"entities_exhaustive": [{"name": "Groupe X", "type": "groupe"}]}}

    monkeypatch.setattr(ownership, "fetch_owned_account", _fetch)
    monkeypatch.setattr(supabase_client, "get_supabase", lambda: None)

    result = await execute_chat_tool(
        "resolve_account_territory",
        {"account_id": "a-8"},
        user_id=USER,
        profile_data={"referenceAccounts": ["Société Générale", "SNCF"]},
    )
    assert result["candidates"][0]["references_comparables"] == ["Société Générale", "SNCF"]


@pytest.mark.asyncio
async def test_reads_the_reference_accounts_already_declared_at_onboarding(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # #2302.28 (épopée #2961) — `reference_accounts` est désormais collecté à
    # l'onboarding en STRUCTURÉ (esn-profile.entity.ts, migration
    # `1796340600000`) : le tool le relit tel quel, jamais un second calcul.
    async def _fetch(_sb: object, account_id: str, user_id: str, columns: str = "*") -> dict:
        return {"id": account_id, "raw_analysis": {"entities_exhaustive": [{"name": "Groupe X", "type": "groupe"}]}}

    monkeypatch.setattr(ownership, "fetch_owned_account", _fetch)
    monkeypatch.setattr(supabase_client, "get_supabase", lambda: None)

    result = await execute_chat_tool(
        "resolve_account_territory",
        {"account_id": "a-7"},
        user_id=USER,
        profile_data={"reference_accounts": ["Société Générale", "Thales"]},
    )
    # #2302.64 — seul un « groupe » vu comme candidat n'est jamais `primary`
    # (NO-GO), donc la restitution se vérifie sur `candidates`, comme les
    # tests dédiés à `resolve_commercial_territory` (`test_territory_resolver.py`).
    assert result["candidates"][0]["references_comparables"] == ["Société Générale", "Thales"]


@pytest.mark.asyncio
async def test_an_invented_sector_is_ignored_never_orients_silently(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fetch(_sb: object, account_id: str, user_id: str, columns: str = "*") -> dict:
        return {
            "id": account_id,
            "raw_analysis": {"entities_exhaustive": [{"name": "BU Data", "type": "bu"}]},
        }

    monkeypatch.setattr(ownership, "fetch_owned_account", _fetch)
    monkeypatch.setattr(supabase_client, "get_supabase", lambda: None)

    result = await _run({"account_id": "a-4", "sector": "licornes"})
    assert result["primary"]["name"] == "BU Data"
