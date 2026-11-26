"""Épopée #2872 (#2367.11) — Laura LIT le REX d'un push consultant.

Le prérequis nommé par l'épopée — une vérification d'appartenance consultant
côté chat — est déjà tenu par le pont NestJS : `ConsultantsService.listFeedback`
(`POST /internal/copilot/consultants/feedback`) fait le `findScoped` (workspace
ET utilisateur) et rend `null` sur un consultant qui n'est pas le sien. L'outil
IA ne fait que relayer — comme `search_talents` relaie déjà le vivier sans
vérification supplémentaire de son côté, parce que le pont la fait déjà.

Trois propriétés à tenir :
 1. Un identifiant manquant est refusé AVANT le réseau.
 2. Sans configuration du pont, l'outil DIT qu'il n'a pas accès — jamais une
    liste vide qui se lirait « aucun REX ».
 3. Un consultant hors du vivier de l'appelant (le pont rend `None`) ne fait
    JAMAIS fuiter le REX d'un autre espace — l'outil dit « introuvable ».
"""

from __future__ import annotations

import pytest

from app.services import bellum_api, chat_tools

USER = "11111111-1111-4111-8111-111111111111"
CONSULTANT = "33333333-3333-4333-8333-333333333333"


@pytest.fixture(autouse=True)
def _clear_bridge_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("API_INTERNAL_URL", raising=False)
    monkeypatch.delenv("INTERNAL_API_SECRET", raising=False)


async def _run(name: str, payload: dict | None = None) -> dict:
    return await chat_tools.execute_chat_tool(name, payload or {}, user_id=USER, profile_data=None)


def test_the_tool_is_declared_and_appended_never_inserted() -> None:
    # Pas `names[-1]` : #2910 (`get_crm_presence`, mesuré 26/09 01:30) a été
    # ajouté PLUS TARD que ce lot (#2367.11, mesuré 26/09 01:13) — deux lots de
    # nuit repartis chacun de leur propre fin de liste, sans se voir. Le vrai
    # invariant n'est pas « dernier pour toujours », c'est « après ce qui
    # existait déjà quand ce lot a écrit » : jamais inséré AVANT
    # `search_workspace_accounts`, le dernier outil du catalogue à ce moment-là.
    names = [tool["name"] for tool in chat_tools.CHAT_TOOLS]
    assert "get_consultant_push_feedback" in names
    assert names.index("get_consultant_push_feedback") > names.index("search_workspace_accounts")


@pytest.mark.asyncio
async def test_asks_for_the_consultant_before_any_network_call(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _explode(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("aucun appel réseau ne doit partir sans identifiant")

    monkeypatch.setattr(bellum_api, "consultant_feedback", _explode)
    result = await _run("get_consultant_push_feedback")
    assert "error" in result
    assert "consultant" in result["error"].lower()


@pytest.mark.asyncio
async def test_says_it_has_no_access_rather_than_an_empty_list(monkeypatch: pytest.MonkeyPatch) -> None:
    # Le pont non configuré : `is_configured()` reste `False` (aucune variable
    # d'environnement posée par `_clear_bridge_env`). Une liste vide ici se
    # lirait « aucun REX », une réponse fausse à une question qu'on n'a pas pu
    # poser.
    result = await _run("get_consultant_push_feedback", {"consultant_id": CONSULTANT})
    assert "error" in result
    assert "accès" in result["error"].lower()


@pytest.mark.asyncio
async def test_a_consultant_outside_the_caller_portfolio_never_leaks_another_workspace_rex(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def not_owned(*_args: object, **_kwargs: object) -> None:
        # Le pont rend `None` — c'est exactement ce que `ConsultantsService
        # .listFeedback` rend sur un consultant hors de l'espace de l'appelant.
        return None

    monkeypatch.setattr(bellum_api, "consultant_feedback", not_owned)
    result = await _run("get_consultant_push_feedback", {"consultant_id": CONSULTANT})
    assert "error" in result
    assert "introuvable" in result["error"].lower()


@pytest.mark.asyncio
async def test_no_feedback_recorded_says_so_rather_than_inventing_a_reason(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def empty(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {"feedback": []}

    monkeypatch.setattr(bellum_api, "consultant_feedback", empty)
    result = await _run("get_consultant_push_feedback", {"consultant_id": CONSULTANT})
    assert result["feedback"] == []
    assert "message" in result


@pytest.mark.asyncio
async def test_relays_the_feedback_rows_as_is(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def feedback(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {
            "feedback": [
                {
                    "id": "f-1",
                    "consultant_id": CONSULTANT,
                    "opportunity_id": "o-1",
                    "outcome": "rejected",
                    "reason": "Tarif trop élevé",
                    "learning": None,
                    "created_at": "2026-09-20T00:00:00.000Z",
                }
            ]
        }

    monkeypatch.setattr(bellum_api, "consultant_feedback", feedback)
    result = await _run("get_consultant_push_feedback", {"consultant_id": CONSULTANT})
    assert result["feedback"] == [
        {
            "opportunity_id": "o-1",
            "outcome": "rejected",
            "reason": "Tarif trop élevé",
            "learning": None,
            "created_at": "2026-09-20T00:00:00.000Z",
        }
    ]


@pytest.mark.asyncio
async def test_makes_zero_network_calls_when_the_bridge_is_unconfigured(monkeypatch: pytest.MonkeyPatch) -> None:
    def _explode(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("aucun appel réseau ne doit partir sans configuration")

    monkeypatch.setattr("httpx.AsyncClient", _explode)
    assert (
        await bellum_api._post("/internal/copilot/consultants/feedback", {"userId": USER, "consultantId": CONSULTANT})
        is None
    )
