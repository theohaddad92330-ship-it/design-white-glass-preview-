"""Épopée #2872 (#2367.6, LOT c5 clôture 26/09) — « proposer un profil ».

Laura ne peut pousser aucun profil elle-même : aucun objet Action OS n'est
câblé au chat (le commentaire d'origine de #2872 le constate), et la doctrine
« le copilote prépare, il n'envoie jamais » (CLAUDE.md) l'interdirait de toute
façon. La tranche minimale vraie et testable : `push_profile` OUVRE le Vivier
avec l'affaire présélectionnée (`ConsultantsPage.tsx`, `?matchProjectId=`) —
exactement le patron de `prepare_consultant_record`, jamais un appel au pont.
"""

from __future__ import annotations

import inspect

import pytest

from app.services import bellum_api, chat_tools

USER = "11111111-1111-4111-8111-111111111111"
PROJECT_ID = "22222222-2222-4222-8222-222222222222"


async def _run(payload: dict) -> dict:
    return await chat_tools.execute_chat_tool("push_profile", payload, user_id=USER, profile_data=None)


def test_push_profile_is_declared_and_appended_last() -> None:
    names = [str(tool["name"]) for tool in chat_tools.CHAT_TOOLS]
    assert names[-1] == "push_profile"


def test_push_profile_is_not_a_write_tool() -> None:
    # Comme `prepare_consultant_record` : une navigation préremplie, jamais un
    # chemin d'écriture — pas dans `WRITE_TOOL_NAMES`.
    assert "push_profile" not in chat_tools.WRITE_TOOL_NAMES


@pytest.mark.asyncio
async def test_push_profile_never_touches_the_bridge(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _explode(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("proposer un push ne doit toucher AUCUNE route")

    monkeypatch.setattr(bellum_api, "_post", _explode)

    out = await _run({"project_id": PROJECT_ID})
    assert out["status"] == "pending_confirmation"
    proposal = out["proposal"]
    assert proposal["action"] == "push_profile"
    assert proposal["project_id"] == PROJECT_ID
    assert proposal["cost_credits"] == 0
    assert proposal["route"] == f"/consultants?matchProjectId={PROJECT_ID}"


def test_the_bridge_has_no_way_to_write_a_consultant_push() -> None:
    functions = [
        name
        for name, value in vars(bellum_api).items()
        if not name.startswith("_") and inspect.iscoroutinefunction(value)
    ]
    write_verbs = ("create", "save", "update", "insert", "add", "write", "delete", "send", "post")
    assert [name for name in functions if name.startswith(write_verbs)] == []


@pytest.mark.asyncio
async def test_push_profile_carries_a_declared_consultant_id() -> None:
    out = await _run({"project_id": PROJECT_ID, "consultant_id": "33333333-3333-4333-8333-333333333333"})
    assert out["proposal"]["consultant_id"] == "33333333-3333-4333-8333-333333333333"


@pytest.mark.asyncio
async def test_push_profile_omits_consultant_id_when_not_named() -> None:
    out = await _run({"project_id": PROJECT_ID})
    assert "consultant_id" not in out["proposal"]


@pytest.mark.asyncio
async def test_push_profile_without_a_project_id_yields_no_proposal() -> None:
    """SAIT DIRE NON — sans affaire, aucun écran ne sait quoi présélectionner."""
    out = await _run({})
    assert "error" in out and "proposal" not in out


@pytest.mark.asyncio
async def test_find_needs_now_carries_the_project_id(monkeypatch: pytest.MonkeyPatch) -> None:
    """`push_profile` exige `project_id` (l'affaire), pas `id` (le besoin) —
    `find_needs` doit donc le rendre, sans quoi Laura n'a aucun moyen de
    l'obtenir (même piège que `NeedMatchGroup.tsx` côté web)."""

    async def _fake_find_needs(
        _user_id: str, *, query: str | None = None, limit: int = 20, need_id: str | None = None
    ) -> dict:
        # #2872 — forme RÉELLE du pont (`openNeedsResponseSchema`) : `data` +
        # `pagination.totalItems`, et chaque ligne porte `title`/`start_on`
        # (pas `label`/`starts_on`) — voir le docblock de `find_needs` dans
        # `chat_tools.py`.
        return {
            "data": [
                {
                    "id": "need-1",
                    "title": "Data engineer",
                    "account_name": "ACME",
                    "status": "open",
                    "urgency": "high",
                    "skills": ["python"],
                    "start_on": None,
                    "project_id": PROJECT_ID,
                }
            ],
            "pagination": {"totalItems": 1},
        }

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "find_needs", _fake_find_needs)
    out = await chat_tools.execute_chat_tool("find_needs", {}, user_id=USER, profile_data=None)
    assert out["needs"][0]["project_id"] == PROJECT_ID
