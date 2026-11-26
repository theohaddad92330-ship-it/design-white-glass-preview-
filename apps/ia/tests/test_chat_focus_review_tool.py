"""#3262.23 (épopée #3284, lot P05 29/09) — `get_focus_review`, la phrase de
Laura sur un compte Focus qui stagne.

La règle (stagnation, cadence, recommandation) vit côté NestJS
(`PilotageService.focusReviewForAccount`, testée seule là-bas — la MÊME
règle que `staleFocusCount`/`reviewSignals`). Cet outil relaie TEL QUEL,
aucune seconde règle de stagnation, aucun compteur inventé (le « six actions
sans nouvelle information » de la spec verbatim n'est mesuré nulle part).
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool


def _tool(name: str) -> dict:
    return next(t for t in CHAT_TOOLS if t["name"] == name)


def test_get_focus_review_is_declared_before_push_profile() -> None:
    names = [t["name"] for t in CHAT_TOOLS]
    assert "get_focus_review" in names
    assert names.index("get_focus_review") < names.index("push_profile")


def test_get_focus_review_names_sprint_entered_at_not_the_verbatim_counter() -> None:
    description = _tool("get_focus_review")["description"]
    # #3262.23 — ne PAS inventer le compteur « six actions sans nouvelle
    # information » de l'exemple verbatim : aucune capture ne le mesure.
    assert "six actions" not in description


@pytest.mark.asyncio
async def test_get_focus_review_requires_an_account_id(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    result = await execute_chat_tool(
        "get_focus_review",
        {},
        user_id="33333333-3333-4333-8333-333333333333",
        profile_data=None,
    )
    assert result["error"] == "Un identifiant de compte est requis."
    assert result["status"] == "invalid_input"


@pytest.mark.asyncio
async def test_get_focus_review_relays_a_stale_focus_account(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {
        "applicable": True,
        "companyName": "Acme",
        "stale": True,
        "daysInFocus": 78,
        "recommendation": "Trente jours sans mouvement : l’effort maximum n’est pas éternel.",
        "suggestedLevel": "extension",
    }

    async def _focus_review(_user_id: str, account_id: str) -> dict:
        assert account_id == "target-1"
        return payload

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "focus_review", _focus_review)
    result = await execute_chat_tool(
        "get_focus_review",
        {"account_id": "target-1"},
        user_id="33333333-3333-4333-8333-333333333333",
        profile_data=None,
    )
    assert {key: result[key] for key in payload} == payload


@pytest.mark.asyncio
async def test_get_focus_review_reports_a_non_focus_account_as_not_applicable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {
        "applicable": False,
        "companyName": "Acme",
        "stale": None,
        "daysInFocus": None,
        "recommendation": None,
        "suggestedLevel": None,
    }

    async def _focus_review(*_a: object, **_k: object) -> dict:
        return payload

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "focus_review", _focus_review)
    result = await execute_chat_tool(
        "get_focus_review",
        {"account_id": "target-1"},
        user_id="33333333-3333-4333-8333-333333333333",
        profile_data=None,
    )
    assert {key: result[key] for key in payload} == payload


@pytest.mark.asyncio
async def test_get_focus_review_reports_an_unknown_account_cleanly(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _focus_review(*_a: object, **_k: object) -> dict:
        return {"error": "account_not_found"}

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "focus_review", _focus_review)
    result = await execute_chat_tool(
        "get_focus_review",
        {"account_id": "missing"},
        user_id="33333333-3333-4333-8333-333333333333",
        profile_data=None,
    )
    assert result["error"] == "Compte introuvable dans votre portefeuille."


@pytest.mark.asyncio
async def test_get_focus_review_names_a_dead_bridge(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _focus_review(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "focus_review", _focus_review)
    result = await execute_chat_tool(
        "get_focus_review",
        {"account_id": "target-1"},
        user_id="33333333-3333-4333-8333-333333333333",
        profile_data=None,
    )
    assert result["error"] == "La revue Focus n'a pas répondu."
    assert result["status"] == "provider_error"


def test_get_focus_review_names_next_review_and_reactivation() -> None:
    # #3262.20/.21 — Laura sait que la réponse porte la prochaine revue et la réactivation.
    description = _tool("get_focus_review")["description"]
    assert "nextReview" in description
    assert "reactivation" in description


@pytest.mark.asyncio
async def test_get_focus_review_relays_next_review_and_reactivation(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {
        "applicable": False,
        "companyName": "Acme",
        "stale": None,
        "daysInFocus": None,
        "recommendation": None,
        "suggestedLevel": None,
        "nextReview": {"dueAt": "2026-11-15T00:00:00.000Z", "source": "relationship_memory"},
        "reactivation": [
            {"event": "positive_reply", "suggestedLevel": "extension", "reason": "x", "reopensGate": True}
        ],
    }

    async def _focus_review(*_a: object, **_k: object) -> dict:
        return payload

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "focus_review", _focus_review)
    result = await execute_chat_tool(
        "get_focus_review",
        {"account_id": "target-1"},
        user_id="33333333-3333-4333-8333-333333333333",
        profile_data=None,
    )
    assert result["nextReview"]["source"] == "relationship_memory"
    assert result["reactivation"][0]["event"] == "positive_reply"
