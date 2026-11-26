"""#4288.4 (#4065.8) / #4288.5 (#4065.9) — « liste mes affaires perdues en 2026 » et « candidats vus en entretien »
n'atterrissent plus sur une question de cadrage : `list_records` est forcé au premier round.
Un ATS non branché se DIT en clair, sans nom de fournisseur."""

from __future__ import annotations

from typing import Any

import pytest

from app.services import bellum_api, chat_orchestrator
from app.services.chat_tools import execute_chat_tool
from app.services.compilers.intent_router import asks_for_a_closed_records_listing

TOOLS = [{"name": "list_records"}, {"name": "web_search"}]
USER = "00000000-0000-0000-0000-000000000001"


@pytest.mark.parametrize(
    "message",
    [
        "liste mes affaires perdues en 2026",
        "Liste-moi les affaires gagnées cette année et leur interlocuteur",
        "montre-moi mes opportunités perdues en 2026",
        "quels candidats ai-je vus en entretien ces 3 derniers mois ?",
        "liste les candidats vus en entretien",
    ],
)
def test_closed_records_listing_is_recognised(message: str) -> None:
    assert asks_for_a_closed_records_listing(message)


@pytest.mark.parametrize(
    "message",
    [
        "Organise-moi ma journée de lundi",
        "Quelles sont les affaires en cours chez Thales ?",
        "pourquoi nous avons perdu chez Engie",
        "résume mes derniers mails",
    ],
)
def test_other_requests_force_nothing(message: str) -> None:
    assert not asks_for_a_closed_records_listing(message)
    assert chat_orchestrator._forced_closed_records_kwargs(0, message, TOOLS) == {}


def test_round_zero_forces_list_records_and_only_round_zero() -> None:
    message = "liste mes affaires perdues en 2026"
    assert chat_orchestrator._forced_closed_records_kwargs(0, message, TOOLS) == {"force_tool": "list_records"}
    assert chat_orchestrator._forced_closed_records_kwargs(1, message, TOOLS) == {}
    assert chat_orchestrator._forced_closed_records_kwargs(0, message, [{"name": "web_search"}]) == {}


@pytest.mark.asyncio
async def test_interviews_say_in_clear_when_no_recruiting_tool_is_plugged(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _not_connected(*_a: Any, **_k: Any) -> dict[str, Any]:
        return {"connected": False}

    monkeypatch.setattr(bellum_api, "ats_records", _not_connected)
    out = await execute_chat_tool(
        "list_records",
        {"source": "ats", "ats_list": "interviewed_candidates", "from_iso": "2026-07-01", "to_iso": "2026-10-19"},
        user_id=USER,
        profile_data=None,
    )
    blob = str(out)
    assert "ntretiens ne sont pas lus" in blob
    assert "aucun outil de recrutement branché" in blob


@pytest.mark.asyncio
async def test_lost_deals_fall_back_to_the_projects_screen_population(monkeypatch: pytest.MonkeyPatch) -> None:
    """#4288.4 — sans CRM, la liste est celle de l'écran Projets › « Voir les perdues » (opportunités perdues),
    fenêtrée sur la date de clôture ; la source lue est dite, une affaire sans date est NOMMÉE, jamais rangée."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _no_crm(*_a: Any, **_k: Any) -> dict[str, Any]:
        return {"connected": False, "deals": []}

    async def _lost(*_a: Any, **_k: Any) -> dict[str, Any]:
        return {
            "projects": [
                {"id": "1", "label": "Refonte SI", "companyName": "Nordia", "closedAt": "2026-05-04T10:00:00Z"},
                {"id": "2", "label": "Run infra", "companyName": "Axiom", "closedAt": None},
                {"id": "3", "label": "Vieille affaire", "companyName": "Zed", "closedAt": "2025-02-01T10:00:00Z"},
            ],
            "total": 3,
        }

    async def _needs(*_a: Any, **_k: Any) -> dict[str, Any]:
        raise AssertionError("le repli ne lit plus les besoins : ce n'est pas la population de l'écran Projets")

    monkeypatch.setattr(bellum_api, "crm_deals", _no_crm)
    monkeypatch.setattr(bellum_api, "lost_projects", _lost)
    monkeypatch.setattr(bellum_api, "find_needs", _needs)
    out = await execute_chat_tool(
        "list_records",
        {"source": "crm", "deal_outcome": "lost", "from_iso": "2026-01-01", "to_iso": "2026-12-31"},
        user_id=USER,
        profile_data=None,
    )
    blob = str(out)
    assert "Nordia" in blob and "Zed" not in blob  # fenêtre sur la clôture
    assert "Axiom" not in blob and "1 affaire(s) perdue(s) sans date" in blob  # nommée, non rangée
    assert "Voir les perdues" in blob  # la source lue est dite
    assert out["complete"] is True


@pytest.mark.asyncio
async def test_lost_deals_fallback_that_cannot_read_says_nothing_was_read(monkeypatch: pytest.MonkeyPatch) -> None:
    """#4288.4 (contrôle négatif) — le pont ne répond pas : jamais « aucune affaire perdue / examiné intégralement »."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _no_crm(*_a: Any, **_k: Any) -> dict[str, Any]:
        return {"connected": False, "deals": []}

    async def _down(*_a: Any, **_k: Any) -> None:
        return None

    monkeypatch.setattr(bellum_api, "crm_deals", _no_crm)
    monkeypatch.setattr(bellum_api, "lost_projects", _down)
    out = await execute_chat_tool(
        "list_records",
        {"source": "crm", "deal_outcome": "lost", "from_iso": "2026-01-01", "to_iso": "2026-12-31"},
        user_id=USER,
        profile_data=None,
    )
    blob = str(out)
    assert "rien n'a été lu" in blob
    assert "Aucune ligne ne correspond" not in blob


@pytest.mark.asyncio
async def test_a_bounded_read_never_concludes_none(monkeypatch: pytest.MonkeyPatch) -> None:
    """#4288.4 (recette prod 28/10) — 23 affaires dont 2 perdues, lues avec une borne à 3 : la réponse ne doit PAS
    dire « aucune » ; elle dit « 3 sur 23 » comme une LIMITE et nomme le non-mesuré."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _crm(*_a: Any, **_k: Any) -> dict[str, Any]:
        # Le pont rend 3 affaires lues sur 23, aucune perdue dans l'échantillon, et DIT que la lecture est coupée.
        return {"connected": True, "deals": [], "dealsRead": 3, "dealsTotal": 23, "complete": False}

    monkeypatch.setattr(bellum_api, "crm_deals", _crm)
    out = await execute_chat_tool(
        "list_records",
        {"source": "crm", "deal_outcome": "lost", "from_iso": "2026-01-01", "to_iso": "2026-12-31"},
        user_id=USER,
        profile_data=None,
    )
    blob = str(out)
    assert out["complete"] is False
    assert "Aucune ligne ne correspond" not in blob
    assert "non mesuré" in blob.casefold()
    assert "3 sur 23" in blob


@pytest.mark.asyncio
async def test_a_complete_empty_read_still_says_none(monkeypatch: pytest.MonkeyPatch) -> None:
    """Le garde-fou ne mange pas la vraie absence : tout le périmètre lu, rien de perdu ⇒ « aucune » reste dicible."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _crm(*_a: Any, **_k: Any) -> dict[str, Any]:
        return {"connected": True, "deals": [], "dealsRead": 23, "dealsTotal": 23, "complete": True}

    monkeypatch.setattr(bellum_api, "crm_deals", _crm)
    out = await execute_chat_tool(
        "list_records",
        {"source": "crm", "deal_outcome": "lost", "from_iso": "2026-01-01", "to_iso": "2026-12-31"},
        user_id=USER,
        profile_data=None,
    )
    assert "Aucune ligne ne correspond" in str(out.get("note"))


@pytest.mark.asyncio
async def test_lost_deals_fallback_with_no_lost_project_may_say_none(monkeypatch: pytest.MonkeyPatch) -> None:
    """#4288.4 — la population de l'écran lue en entier et vide : « aucune » redevient dicible (et vrai)."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _no_crm(*_a: Any, **_k: Any) -> dict[str, Any]:
        return {"connected": False, "deals": []}

    async def _none(*_a: Any, **_k: Any) -> dict[str, Any]:
        return {"projects": [], "total": 0}

    monkeypatch.setattr(bellum_api, "crm_deals", _no_crm)
    monkeypatch.setattr(bellum_api, "lost_projects", _none)
    out = await execute_chat_tool(
        "list_records",
        {"source": "crm", "deal_outcome": "lost", "from_iso": "2026-01-01", "to_iso": "2026-12-31"},
        user_id=USER,
        profile_data=None,
    )
    assert "Aucune ligne ne correspond" in str(out.get("note"))
