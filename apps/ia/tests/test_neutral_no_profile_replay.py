"""#3703 — Neutre ne réinjecte AUCUN profil, de l'entrée jusqu'au dernier résultat.

Le call du 05/10 (53:27) : « Neutre » + « luxe » retombait sur le profil ESN IT.
Ce fichier REJOUE le tour (entrée HTTP → routeur → ce que reçoit la boucle
d'outils) avec un profil ESN IT complet, puis prouve outil par outil que le
vide posé par `apply_context_mode` ne laisse revenir ni filtre de secteur, ni
CRM, ni règle apprise. Chaque test a son témoin « Mon activité » : il sait dire
NON (le profil EST là quand le mode l'autorise).
"""

from __future__ import annotations

import pytest

from app.routers.discover import DiscoverFilters, _apply_target_sector_filter
from app.services import chat_tools

_IT_PROFILE = {
    "sectors": ["Informatique", "Télécoms"],
    "offers": ["Cloud", "Cybersécurité"],
    "sellerGoal": "Placer des consultants IT",
    "ideal_client_territory": ["Île-de-France"],
    "reference_accounts": ["Capgemini"],
}
_LUXE_COMPANIES = [
    {"name": "Maison Lumière", "sector": "Luxe et maroquinerie"},
    {"name": "Cabinet Cloud", "sector": "Programmation informatique"},
]


@pytest.fixture
def captured(monkeypatch):
    seen: dict = {}

    async def _call(system, user, **kwargs):
        seen["system"] = system
        seen["kwargs"] = kwargs
        return ("réponse", [])

    async def _rag(*args, **kwargs):
        return ("", [], [])

    monkeypatch.setattr("app.services.chat_orchestrator.run_chat_with_tools", _call)
    monkeypatch.setattr("app.services.rag_knowledge.retrieve_reranked_citations", _rag)
    return seen


def _luxe_turn(**extra) -> dict:
    return {
        "message": "Trouve-moi cinq maisons de luxe en Île-de-France",
        "user_id": "user-1",
        "profile_data": _IT_PROFILE,
        "crm_connected": True,
        "crm_provider": "hubspot",
        "connected_families": ["crm", "calendar"],
        "lost_deal_rex_context": "REX perdu : Zorg Luxe, route ESN IT",
        "workspace_learned_rules_context": "Règle apprise : toujours viser la DSI IT",
        **extra,
    }


def test_neutral_replay_nothing_of_the_it_profile_reaches_the_tool_loop(client, captured):
    res = client.post("/chat/message", json=_luxe_turn(context_mode="neutral"))
    assert res.status_code == 200
    kwargs, system = captured["kwargs"], captured["system"]
    assert not kwargs["profile_data"]
    # CRM : une couche exclue n'ouvre AUCUN connecteur privé implicitement.
    assert kwargs["crm_connected"] is False
    assert not kwargs["crm_provider"]
    assert "crm" not in (kwargs["connected_families"] or [])
    # Historique commercial et règles apprises de l'espace : exclus avec la couche.
    assert "Zorg Luxe" not in system
    assert "toujours viser la DSI IT" not in system
    assert "Placer des consultants IT" not in system


def test_my_activity_replay_is_the_witness_that_says_no(client, captured):
    res = client.post("/chat/message", json=_luxe_turn(context_mode="my_activity"))
    assert res.status_code == 200
    kwargs, system = captured["kwargs"], captured["system"]
    assert kwargs["profile_data"] == _IT_PROFILE
    assert kwargs["crm_connected"] is True
    assert "Zorg Luxe" in system


def test_discover_target_filter_does_not_cut_luxe_in_neutral():
    """L'outil entreprises : « luxe » reste, le profil vide ne filtre rien."""
    kept, info = _apply_target_sector_filter(_LUXE_COMPANIES, {}, explicit_sector=False, include_out_of_target=False)
    assert [c["name"] for c in kept] == ["Maison Lumière", "Cabinet Cloud"]
    assert info is None


def test_discover_target_filter_witness_my_activity_cuts_luxe():
    kept, info = _apply_target_sector_filter(
        _LUXE_COMPANIES, _IT_PROFILE, explicit_sector=False, include_out_of_target=False
    )
    assert [c["name"] for c in kept] == ["Cabinet Cloud"]
    assert info is not None and info.excludedCount == 1


@pytest.mark.asyncio
async def test_find_accounts_in_neutral_reads_no_profile_territory(monkeypatch):
    """L'outil find_accounts : sans profil, aucun territoire ni référence habituels."""
    seen: dict = {}

    async def _registry(req):
        seen["profile_data"] = req.profile_data
        seen["filters"] = req.filters
        return {"companies": [], "total": 0}

    monkeypatch.setattr("app.routers.discover.discover_registry", _registry)
    await chat_tools.execute_chat_tool(
        "run_account_search",
        {"keywords": "luxe"},
        user_id="user-1",
        profile_data=None,
        context_mode="neutral",
    )
    assert not seen.get("profile_data")
    assert not (seen["filters"].department or "")


# ── #3703 (reste) — contacts, recommandation, e-mail/agenda en Neutre ────────

_LUXE_ANALYSIS = {
    "company": {"sector": "Luxe et maroquinerie", "headcount": 800},
    "recentSignals": [],
}


@pytest.mark.asyncio
async def test_contacts_tool_in_neutral_sends_no_profile_to_the_bridge(monkeypatch):
    """Contacts : le pont ne reçoit que (utilisateur, compte) — jamais le profil ESN IT."""
    from app.services import bellum_api

    seen: dict = {}

    async def _post(path, payload, *a, **k):
        seen["path"], seen["payload"] = path, payload
        return {"contacts": [], "total": 0, "truncated": False}

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "_post", _post)
    await chat_tools.execute_chat_tool(
        "get_account_contacts", {"account_id": "acc-1"}, user_id="user-1", profile_data=None, context_mode="neutral"
    )
    assert seen["path"] == "/internal/copilot/account/contacts"
    assert set(seen["payload"]) == {"userId", "accountId"}
    assert "Cloud" not in str(seen["payload"]) and "Informatique" not in str(seen["payload"])


def _stub_owned_account(monkeypatch, account):
    from unittest.mock import AsyncMock, MagicMock

    monkeypatch.setattr("app.services.supabase_client.get_supabase", MagicMock(return_value=MagicMock()))
    monkeypatch.setattr("app.services.ownership.fetch_owned_account", AsyncMock(return_value=account))


@pytest.mark.asyncio
async def test_recommendation_in_neutral_does_not_claim_an_it_fit(monkeypatch):
    """Recommandation (verdict d'aptitude) : sans profil, aucune adéquation « IT » n'est inventée ;
    l'axe d'adéquation est nommé non évalué. Témoin : avec le profil IT, l'adéquation se calcule."""
    _stub_owned_account(monkeypatch, {"company_name": "Maison Lumière", "raw_analysis": _LUXE_ANALYSIS})
    neutral = await chat_tools.execute_chat_tool(
        "get_account_suitability_verdict",
        {"account_id": "acc-1"},
        user_id="user-1",
        profile_data=None,
        context_mode="neutral",
    )
    witness = await chat_tools.execute_chat_tool(
        "get_account_suitability_verdict",
        {"account_id": "acc-1"},
        user_id="user-1",
        profile_data=_IT_PROFILE,
        context_mode="my_activity",
    )
    flat = str(neutral)
    assert "Cloud" not in flat and "Cybersécurité" not in flat and "consultants IT" not in flat
    assert neutral != witness, "le témoin doit différer : le profil EST lu quand le mode l'autorise"


def test_neutral_closes_email_and_calendar_tools_not_only_the_crm():
    """E-mail / agenda : Neutre n'ouvre pas implicitement les boîtes privées (droits explicitement choisis)."""
    from app.models.chat import ChatRequest
    from app.services.context_mode import apply_context_mode

    req = ChatRequest(
        message="luxe",
        user_id="u",
        profile_data=_IT_PROFILE,
        connected_families=["crm", "email", "calendar"],
        context_mode="neutral",
    )
    narrowed, trace = apply_context_mode(req)
    assert narrowed.connected_families == []
    names = {t["name"] for t in chat_tools.tools_for(narrowed.connected_families)}
    assert not names & {"search_mailbox", "prepare_mail_draft", "list_agenda", "find_free_slots", "prepare_day_brief"}
    assert "private_mailboxes" in trace["excluded_context_layers"]
    assert req.connected_families == ["crm", "email", "calendar"], "la requête d'entrée n'est jamais modifiée"


def test_my_activity_and_one_off_keep_email_and_calendar():
    from app.models.chat import ChatRequest
    from app.services.context_mode import apply_context_mode

    for mode in ("my_activity", "one_off_mission"):
        req = ChatRequest(message="x", user_id="u", connected_families=["email", "calendar"], context_mode=mode)
        narrowed, _ = apply_context_mode(req)
        assert narrowed.connected_families == ["email", "calendar"]


def test_neutral_turn_tells_how_to_reuse_older_personalised_answers(client, captured):
    """Ancienne synthèse : le badge ne neutralise rien — le prompt dit quoi reprendre (faits) et recalculer."""
    res = client.post(
        "/chat/message",
        json=_luxe_turn(
            context_mode="neutral",
            history=[{"role": "assistant", "content": "Pour ton ESN IT, vise Capgemini (hier)."}],
        ),
    )
    assert res.status_code == 200
    system = captured["system"]
    assert "ANCIENS ÉCHANGES DE CE FIL" in system
    assert "Ne dis jamais que tu as « oublié »" in system


def test_my_activity_turn_has_no_older_answers_block(client, captured):
    res = client.post("/chat/message", json=_luxe_turn(context_mode="my_activity"))
    assert res.status_code == 200
    assert "ANCIENS ÉCHANGES DE CE FIL" not in captured["system"]
