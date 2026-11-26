"""#2301 (LAU-FINAL-042) — l'APPELANT `/chat` de la prélecture de compte.

La logique d'assemblage est testée à part, sans I/O, dans
`test_account_preflight_compiler.py`. Ce fichier prouve la chaîne complète :
`CHAT_TOOLS` l'expose au modèle, `execute_chat_tool("get_account_preflight", …)`
le route, l'ownership est appliqué comme pour `get_account_briefing`, et les
contacts déjà rendus par le pont `get_account_contacts` rejoignent la
prélecture — sans second calcul (GA-26).
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, WRITE_TOOL_NAMES, execute_chat_tool, tools_for

USER = "33333333-3333-4333-8333-333333333333"


def _stub_owned_account(monkeypatch: pytest.MonkeyPatch, account: dict) -> None:
    monkeypatch.setattr("app.services.supabase_client.get_supabase", MagicMock(return_value=MagicMock()))

    async def _fetch_owned_account(*_a: object, **_k: object) -> dict:
        return account

    monkeypatch.setattr("app.services.ownership.fetch_owned_account", AsyncMock(side_effect=_fetch_owned_account))


async def _run(tool_input: dict, **kwargs: object) -> dict:
    return await execute_chat_tool("get_account_preflight", tool_input, user_id=USER, profile_data=None, **kwargs)


def test_registry_exposes_the_tool_and_it_stays_read_only() -> None:
    names = {t["name"] for t in CHAT_TOOLS}
    assert "get_account_preflight" in names
    assert "get_account_preflight" not in WRITE_TOOL_NAMES


def test_tool_is_never_gated_by_a_connected_family() -> None:
    """Contrairement à `search_mailbox`/`export_contact_to_crm`, la prélecture
    ne dépend d'aucune famille connectée : un utilisateur sans rien de branché
    la garde quand même (elle lit le compte lui-même, pas un fournisseur)."""
    names = {t["name"] for t in tools_for(())}
    assert "get_account_preflight" in names


@pytest.mark.asyncio
async def test_requires_an_account_id() -> None:
    result = await _run({})
    assert "error" in result


@pytest.mark.asyncio
async def test_refuses_a_foreign_or_missing_account(monkeypatch: pytest.MonkeyPatch) -> None:
    from fastapi import HTTPException

    monkeypatch.setattr("app.services.supabase_client.get_supabase", MagicMock(return_value=MagicMock()))

    async def _not_found(*_a: object, **_k: object) -> dict:
        raise HTTPException(status_code=404, detail="Account not found")

    monkeypatch.setattr("app.services.ownership.fetch_owned_account", AsyncMock(side_effect=_not_found))
    result = await _run({"account_id": "acc-x"})
    assert "error" in result


@pytest.mark.asyncio
async def test_assembles_the_owned_account_with_its_contacts(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub_owned_account(
        monkeypatch,
        {
            "id": "acc-1",
            "company_name": "Client Test",
            "commercial_status": "watching",
            "recent_signals": [{"id": "s1", "signal": "Recrutement DSI"}],
        },
    )
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _account_contacts(*_a: object, **_k: object) -> dict:
        return {"contacts": [{"contact_id": "c-1", "full_name": "Claire Dubois"}], "total": 1, "truncated": False}

    monkeypatch.setattr(bellum_api, "account_contacts", _account_contacts)

    result = await _run({"account_id": "acc-1"})
    assert result["account_id"] == "acc-1"
    assert result["company_name"] == "Client Test"
    identity = result["known_sections"]["identity"]
    assert identity["known"] is True
    contacts = result["known_sections"]["contacts_and_coverage"]["contacts"]
    assert contacts["known"] is True
    assert contacts["contacts"][0]["contact_id"] == "c-1"
    signals = result["known_sections"]["current_signals"]["signals"]
    assert signals[0]["id"] == "s1"


@pytest.mark.asyncio
async def test_uses_the_canonical_facade_for_identity_when_the_bridge_answers(monkeypatch: pytest.MonkeyPatch) -> None:
    """#2285.2 (épopée #2786) — Laura ne recalcule plus localement sa vérité :
    un `sector` vide sur la ligne `accounts` mais connu par la façade
    canonique (DataForge) doit ressortir, comme sur la fiche compte."""
    _stub_owned_account(monkeypatch, {"id": "acc-3", "company_name": "Client Test", "sector": None})
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "account_contacts", AsyncMock(return_value={"contacts": []}))

    async def _intelligence_context(*_a: object, **_k: object) -> dict:
        return {
            "sector": {
                "state": "known",
                "value": "Défense",
                "provenance": {"source": "dataforge", "observedAt": "2026-09-01T00:00:00.000Z"},
            }
        }

    monkeypatch.setattr(bellum_api, "account_intelligence_context", _intelligence_context)

    result = await _run({"account_id": "acc-3"})
    assert result["known_sections"]["identity"]["sector"] == "Défense"


@pytest.mark.asyncio
async def test_names_contacts_as_unknown_when_the_bridge_is_not_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    """Sans clé/pont configuré : chemin byte-identique, jamais un appel réseau
    tenté ni une donnée devinée — la source se NOMME absente."""
    _stub_owned_account(monkeypatch, {"id": "acc-2", "company_name": "Sans Pont"})
    monkeypatch.setattr(bellum_api, "is_configured", lambda: False)

    called = False

    async def _account_contacts(*_a: object, **_k: object) -> dict:
        nonlocal called
        called = True
        return {"contacts": []}

    monkeypatch.setattr(bellum_api, "account_contacts", _account_contacts)

    intelligence_called = False

    async def _intelligence_context(*_a: object, **_k: object) -> dict:
        nonlocal intelligence_called
        intelligence_called = True
        return {}

    monkeypatch.setattr(bellum_api, "account_intelligence_context", _intelligence_context)

    staffing_called = False

    async def _staffing_history(*_a: object, **_k: object) -> dict:
        nonlocal staffing_called
        staffing_called = True
        return {"consultants": []}

    monkeypatch.setattr(bellum_api, "account_staffing_history", _staffing_history)

    commercial_load_called = False

    async def _commercial_load_capacity(*_a: object, **_k: object) -> dict:
        nonlocal commercial_load_called
        commercial_load_called = True
        return {"trackedAccountsCount": 0}

    monkeypatch.setattr(bellum_api, "commercial_load_capacity", _commercial_load_capacity)

    result = await _run({"account_id": "acc-2"})
    assert called is False
    assert intelligence_called is False
    assert staffing_called is False
    assert commercial_load_called is False
    contacts = result["known_sections"]["contacts_and_coverage"]["contacts"]
    assert contacts["known"] is False
    assert result["known_sections"]["past_consultants"]["known"] is False
    assert result["known_sections"]["team_scope"]["known"] is False


@pytest.mark.asyncio
async def test_wires_past_consultants_from_the_staffing_bridge(monkeypatch: pytest.MonkeyPatch) -> None:
    """#3182.2 (épopée #3248) — `get_account_preflight` appelle le pont de
    staffing UNIQUEMENT quand le pont est configuré (même garde que les
    contacts), et relaie son résultat dans `past_consultants`."""
    _stub_owned_account(monkeypatch, {"id": "acc-4", "company_name": "Client Staffing"})
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "account_contacts", AsyncMock(return_value={"contacts": []}))

    seen_account_ids: list[str] = []

    async def _staffing_history(_user_id: str, account_id: str) -> dict:
        seen_account_ids.append(account_id)
        return {
            "consultants": [
                {"consultant_id": "c-1", "full_name": "Marie Dupont", "mission_id": "m-1", "starts_on": "2026-01-01"}
            ]
        }

    monkeypatch.setattr(bellum_api, "account_staffing_history", _staffing_history)

    result = await _run({"account_id": "acc-4"})
    assert seen_account_ids == ["acc-4"]
    past = result["known_sections"]["past_consultants"]
    assert past["known"] is True
    assert past["consultants"][0]["full_name"] == "Marie Dupont"


@pytest.mark.asyncio
async def test_wires_team_scope_from_the_commercial_load_bridge(monkeypatch: pytest.MonkeyPatch) -> None:
    """#3182.2 (épopée #3248, reste « disponibilité de l'équipe commerciale »)
    — `get_account_preflight` appelle le pont de charge commerciale UNIQUEMENT
    quand le pont est configuré (même garde que les contacts), et relaie son
    résultat dans `team_scope`."""
    _stub_owned_account(monkeypatch, {"id": "acc-5", "company_name": "Client Charge"})
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "account_contacts", AsyncMock(return_value={"contacts": []}))
    monkeypatch.setattr(bellum_api, "account_staffing_history", AsyncMock(return_value={"consultants": []}))

    seen_user_ids: list[str] = []

    async def _commercial_load_capacity(user_id: str) -> dict:
        seen_user_ids.append(user_id)
        return {
            "consultant": {"user_id": USER, "name": "Sarah Martin"},
            "maxTrackedAccounts": 40,
            "trackedAccountsCount": 12,
            "weeklyAvailableHours": 32,
        }

    monkeypatch.setattr(bellum_api, "commercial_load_capacity", _commercial_load_capacity)

    result = await _run({"account_id": "acc-5"})
    assert seen_user_ids == [USER]
    team_scope = result["known_sections"]["team_scope"]
    assert team_scope["known"] is True
    assert team_scope["consultant"] == {"user_id": USER, "name": "Sarah Martin"}
    assert team_scope["max_tracked_accounts"] == 40


@pytest.mark.asyncio
async def test_wires_the_declared_panel_from_the_access_bridge(monkeypatch: pytest.MonkeyPatch) -> None:
    """#3278.2 — `get_account_preflight` lit le fait panel/référencement sur le
    pont d'accès (même garde que les contacts) et le relaie à `commercial_route` ;
    un pont muet laisse le critère non évaluable, jamais un « pas de panel »."""
    account = {
        "id": "acc-7",
        "company_name": "Client Panel",
        "raw_analysis": {
            "salesContext": {
                "esnProfile": {"stage": "etablie"},
                "account": {"archetype": "pme_eti"},
                "relationship": {"state": "froid"},
            }
        },
    }
    _stub_owned_account(monkeypatch, account)
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "account_contacts", AsyncMock(return_value={"contacts": []}))
    monkeypatch.setattr(bellum_api, "account_staffing_history", AsyncMock(return_value={"consultants": []}))
    monkeypatch.setattr(bellum_api, "commercial_load_capacity", AsyncMock(return_value=None))
    access = AsyncMock(return_value={"purchasing_panel": "panel_ouvert"})
    monkeypatch.setattr(bellum_api, "account_access", access)

    result = await _run({"account_id": "acc-7"})
    access.assert_awaited_once()
    assert result["known_sections"]["commercial_route"]["evaluated_purchasing"]["panel"] == "panel_ouvert"

    monkeypatch.setattr(bellum_api, "account_access", AsyncMock(return_value=None))
    silent = await _run({"account_id": "acc-7"})
    assert "evaluated_purchasing" not in silent["known_sections"]["commercial_route"]


@pytest.mark.asyncio
async def test_a_crm_excluded_for_this_thread_is_never_read_and_never_leaks_into_crm_match(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """#3708 (recette prod 09/10) — CRM décoché pour ce fil, puis « dernière
    activité CRM… 31/08 » cité quand même, lu depuis cette prélecture : une
    exclusion doit filtrer le CONTEXTE, pas seulement le reçu de transparence
    affiché à côté. `bellum_api.crm_presence` ne doit même pas être APPELÉ —
    « ne les lis par aucun autre chemin » (`excluded_sources_block`)."""
    _stub_owned_account(monkeypatch, {"id": "acc-6", "company_name": "Client Exclu"})
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "account_contacts", AsyncMock(return_value={"contacts": []}))
    monkeypatch.setattr(bellum_api, "account_staffing_history", AsyncMock(return_value={"consultants": []}))
    monkeypatch.setattr(bellum_api, "commercial_load_capacity", AsyncMock(return_value=None))
    crm_presence_calls: list[str] = []

    async def _crm_presence(_user_id: str, account_id: str) -> dict:
        crm_presence_calls.append(account_id)
        return {"connected": True, "matched": True, "last_activity_at": "2026-08-31T10:00:00.000Z"}

    monkeypatch.setattr(bellum_api, "crm_presence", _crm_presence)

    result = await _run({"account_id": "acc-6"}, crm_connected=True, excluded_families=["crm"])

    assert crm_presence_calls == []
    match = result["known_sections"]["crm_match"]
    assert match["known"] is False
    assert "last_activity_at" not in match
    assert "exclu" in match["reason"].lower()


@pytest.mark.asyncio
async def test_crm_not_excluded_still_reads_it_normally(monkeypatch: pytest.MonkeyPatch) -> None:
    """Sait dire NON : sans exclusion, le comportement existant (lire le CRM
    branché) ne change pas."""
    _stub_owned_account(monkeypatch, {"id": "acc-7", "company_name": "Client Non Exclu"})
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "account_contacts", AsyncMock(return_value={"contacts": []}))
    monkeypatch.setattr(bellum_api, "account_staffing_history", AsyncMock(return_value={"consultants": []}))
    monkeypatch.setattr(bellum_api, "commercial_load_capacity", AsyncMock(return_value=None))
    crm_presence_calls: list[str] = []

    async def _crm_presence(_user_id: str, account_id: str) -> dict:
        crm_presence_calls.append(account_id)
        return {"connected": True, "matched": True, "last_activity_at": "2026-08-31T10:00:00.000Z"}

    monkeypatch.setattr(bellum_api, "crm_presence", _crm_presence)

    result = await _run({"account_id": "acc-7"}, crm_connected=True)

    assert crm_presence_calls == ["acc-7"]
    match = result["known_sections"]["crm_match"]
    assert match["known"] is True
    assert match["last_activity_at"] == "2026-08-31T10:00:00.000Z"
