"""`prepare_bug_report` — #2433.7 (épopée #2876, lot M10 09/10).

La règle CAPTURE INTERFACE (`bellum_advisor.py`) disait déjà « tu prépares un
signalement avec ce que tu sais » — sans aucun outil derrière la phrase. Cet
outil la tient : il PRÉPARE (`pending_confirmation`), il n'envoie rien. Le
clic de la personne appelle `POST /feedback` (catégorie `bug`), la porte du
formulaire de signalement — jamais le pont interne.
"""

from __future__ import annotations

import pytest

from app.services import chat_tools

USER = "11111111-1111-4111-8111-111111111111"


async def _run(tool_input: dict) -> dict:
    return await chat_tools.execute_chat_tool("prepare_bug_report", tool_input, user_id=USER, profile_data=None)


def test_the_tool_is_declared_and_counted_as_a_write_tool() -> None:
    names = {tool["name"] for tool in chat_tools.CHAT_TOOLS}
    assert "prepare_bug_report" in names
    assert "prepare_bug_report" in chat_tools.WRITE_TOOL_NAMES


def test_the_schema_requires_the_visible_observation_only() -> None:
    tool = next(item for item in chat_tools.CHAT_TOOLS if item["name"] == "prepare_bug_report")
    assert tool["input_schema"]["required"] == ["observed"]
    # La description porte la négation (« n'envoie rien ») et l'interdit de la cause serveur.
    assert "n'envoie rien" in tool["description"]
    assert "cause" in tool["description"]


@pytest.mark.asyncio
async def test_returns_a_frozen_proposal_with_zero_network_calls(monkeypatch: pytest.MonkeyPatch) -> None:
    def _explode(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("aucun appel réseau : l'outil prépare, le clic envoie")

    monkeypatch.setattr("httpx.AsyncClient", _explode)
    out = await _run(
        {
            "observed": "L'écran affiche « Erreur 500 » sous le bouton Analyser.",
            "steps": "J'ai cliqué sur Analyser depuis la fiche THALES.",
            "route": "/accounts",
        }
    )
    assert out["status"] == "pending_confirmation"
    proposal = out["proposal"]
    assert proposal["action"] == "prepare_bug_report"
    assert proposal["route"] == "/accounts"
    assert proposal["cost_credits"] == 0
    # Le constat ET les étapes données par la personne, dans le texte envoyé.
    assert "Erreur 500" in proposal["message"]
    assert "J'ai cliqué sur Analyser" in proposal["message"]


@pytest.mark.asyncio
async def test_without_route_or_steps_nothing_is_invented() -> None:
    out = await _run({"observed": "Le tableau des contacts reste vide."})
    proposal = out["proposal"]
    assert "route" not in proposal
    assert proposal["message"] == "Le tableau des contacts reste vide."


@pytest.mark.asyncio
async def test_an_empty_observation_is_refused_not_proposed() -> None:
    out = await _run({"observed": "   "})
    assert "error" in out
    assert "status" not in out


@pytest.mark.asyncio
async def test_the_message_is_capped_at_the_form_ceiling() -> None:
    """Même plafond que `POST /feedback` (`FEEDBACK_MESSAGE_MAX`, 5000) : une carte
    plus longue promettrait un envoi que l'API refuserait."""
    out = await _run({"observed": "x" * 9000})
    assert len(out["proposal"]["message"]) <= 5000


@pytest.mark.asyncio
async def test_a_route_that_is_not_an_app_path_is_dropped() -> None:
    """Une « route » qui n'en est pas une (URL externe, texte libre) n'est pas
    reprise : la carte n'affiche pas ce qu'on n'a pas."""
    out = await _run({"observed": "Écran blanc.", "route": "https://exemple.com/x"})
    assert "route" not in out["proposal"]


def test_never_calls_a_feedback_endpoint_from_the_bridge() -> None:
    from app.services import bellum_api

    assert not hasattr(bellum_api, "create_feedback")
    assert not hasattr(bellum_api, "prepare_bug_report")
