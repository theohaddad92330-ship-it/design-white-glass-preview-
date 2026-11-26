"""#1950.4 / #1950.7 / #1950.12 / #1950.13 — LE PLAN DE LAURA DIT SON OBJECTIF.

Quand Laura propose un plan (plusieurs cartes dans une réponse), le plan affiche
son objectif final, les résultats attendus, les données qui manquent et ce qui
ne pourra pas être fait. Ces quatre lignes sont NOMMÉES par le modèle via un
outil SILENCIEUX (`describe_plan`), sur le motif exact de `offer_reply_options`
(#2679) : il ne coûte pas un tour de modèle, il n'écrit rien, il ne lit rien.

Tranché sans Louis (décision §12, reco appliquée) : on réutilise le type de
carte d'action existant (`CopilotCards` / sa barre de plan) — le résumé s'y
ajoute, jamais un second mécanisme. Une liste vide ne fait AUCUNE ligne ; aucune
DURÉE estimée par le modèle (#1950.10 : ce serait une donnée non mesurée).
"""

from __future__ import annotations

import asyncio

from app.services import chat_orchestrator
from app.services.chat_tools import CHAT_TOOLS, PLAN_BRIEF_TOOL_NAME, execute_chat_tool
from tests.test_unrouted_intent import USER, _resp, _text, _tool_use, fake_model  # noqa: F401


def test_the_tool_is_offered_to_the_model() -> None:
    names = [tool["name"] for tool in CHAT_TOOLS]
    assert PLAN_BRIEF_TOOL_NAME in names


def test_the_tool_describes_and_never_estimates_a_duration() -> None:
    tool = next(tool for tool in CHAT_TOOLS if tool["name"] == PLAN_BRIEF_TOOL_NAME)
    properties = tool["input_schema"]["properties"]
    assert set(properties) == {"objective", "expected_results", "missing_data", "impossible"}
    assert "duration" not in " ".join(properties)


async def _describe(**fields: object) -> dict:
    return await execute_chat_tool(PLAN_BRIEF_TOOL_NAME, fields, user_id="u-1", profile_data=None)


async def test_the_executor_keeps_what_the_model_named_and_drops_empty_lists() -> None:
    out = await _describe(
        objective="Relancer Eric Tisserant chez ACTIA avant son comité",
        expected_results=["Un brouillon de relance prêt à envoyer", "Un rappel dans trois jours"],
        missing_data=[],
        impossible=["Envoyer l'e-mail à ta place"],
    )
    assert out["status"] == "plan_brief"
    assert out["plan_brief"] == {
        "objective": "Relancer Eric Tisserant chez ACTIA avant son comité",
        "expected_results": ["Un brouillon de relance prêt à envoyer", "Un rappel dans trois jours"],
        "impossible": ["Envoyer l'e-mail à ta place"],
    }


async def test_the_executor_refuses_a_plan_without_objective() -> None:
    out = await _describe(objective="  ", expected_results=["x"])
    assert "error" in out


async def test_the_executor_bounds_the_lists() -> None:
    out = await _describe(objective="o" * 900, missing_data=[f"donnée {i}" for i in range(20)])
    brief = out["plan_brief"]
    assert len(brief["objective"]) <= 300
    assert len(brief["missing_data"]) <= 6


def test_the_brief_ends_the_turn_without_another_model_call(fake_model) -> None:  # noqa: F811
    messages = fake_model(
        [
            _resp(
                "tool_use",
                [
                    _text("Voici le plan."),
                    _tool_use(
                        PLAN_BRIEF_TOOL_NAME,
                        {"objective": "Relancer ACTIA", "expected_results": ["Un brouillon prêt"]},
                        "t1",
                    ),
                ],
            )
        ]
    )
    events: list[dict] = []

    async def emit(event: dict) -> None:
        events.append(event)

    reply, actions = asyncio.run(
        chat_orchestrator.run_chat_with_tools("system", "Relance ACTIA", user_id=USER, profile_data=None, emit=emit)
    )
    assert reply.startswith("Voici le plan.")
    assert len(messages.calls) == 1
    assert not [event for event in events if event.get("type") == "step"]
    carried = [action["plan_brief"] for action in actions if action.get("plan_brief")]
    assert carried == [{"objective": "Relancer ACTIA", "expected_results": ["Un brouillon prêt"]}]
    # Rien n'a été FAIT : le tour ne compte pas comme une action exécutée.
    assert all(action.get("status") != "done" for action in actions if action.get("plan_brief"))
