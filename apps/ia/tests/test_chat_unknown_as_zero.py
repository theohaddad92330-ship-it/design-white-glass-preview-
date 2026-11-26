"""#3190.9 reste (VÉRITÉ, épopée #3241) — « une inconnue convertie en zéro ».

Un outil rend un axe NON ÉVALUÉ (`not_evaluated`, `unknowns`, `scoreUnmeasured`) ;
la réponse l'écrit « 0 ». Le vérificateur sait dire NON (motif + précision) et
se tait quand le zéro est un vrai zéro ou quand rien n'était non évalué.
"""

from __future__ import annotations

import json

import pytest

from app.services import chat_orchestrator
from app.services.commercial_verifier import UNKNOWN_CONVERTED_TO_ZERO, repair_addendum, verify_response
from tests.test_chat_verifier_status_exposure import USER, _install_client, _patch_env, _resp, _text, _tool_use  # noqa: F401


def _out(**payload: object) -> str:
    return json.dumps(payload, ensure_ascii=False)


UNKNOWNS = _out(verdict="WATCH", unknowns=[{"axis": "accessibilité", "reason": "plafonné par ce qu'on ne sait pas"}])


@pytest.mark.parametrize(
    "text",
    [
        "L'accessibilité est à 0 sur ce compte.",
        "Accessibilité : 0/5, on ne peut rien faire.",
        "Accessibilité = 0 %.",
        "Le score d'accessibilité vaut zéro.",
    ],
)
def test_an_unknown_axis_written_as_zero_is_flagged(text: str) -> None:
    result = verify_response(text, tool_outputs=[UNKNOWNS])
    assert UNKNOWN_CONVERTED_TO_ZERO in result.repair_reasons


@pytest.mark.parametrize(
    "text",
    [
        "L'accessibilité n'est pas mesurée, je ne la compte pas.",
        "Accessibilité : non évaluée faute de contact.",
        "Le signal est à 0 sur ce compte.",  # autre axe, pas celui de l'inconnue
        "Accessibilité à 10 points.",  # « 10 » n'est pas « 0 »
        "Accessibilité de 0,5 point.",
    ],
)
def test_a_known_or_other_axis_is_not_flagged(text: str) -> None:
    assert UNKNOWN_CONVERTED_TO_ZERO not in verify_response(text, tool_outputs=[UNKNOWNS]).repair_reasons


def test_without_an_unknown_in_the_tool_outputs_a_zero_is_a_real_zero() -> None:
    measured = _out(verdict="WATCH", axes=[{"axis": "accessibilité", "points": 0}])
    assert UNKNOWN_CONVERTED_TO_ZERO not in verify_response("L'accessibilité est à 0.", tool_outputs=[measured]).repair_reasons
    assert UNKNOWN_CONVERTED_TO_ZERO not in verify_response("L'accessibilité est à 0.", tool_outputs=[]).repair_reasons


def test_raw_scorer_keys_and_not_evaluated_lists_are_read() -> None:
    out = _out(items=[{"name": "ACME", "not_evaluated": ["signal marché daté"]}], scoreUnmeasured=["geography"])
    assert UNKNOWN_CONVERTED_TO_ZERO in verify_response("Le signal marché daté est à 0.", tool_outputs=[out]).repair_reasons
    assert UNKNOWN_CONVERTED_TO_ZERO in verify_response("La geography vaut 0.", tool_outputs=[out]).repair_reasons


def test_non_json_tool_outputs_are_ignored() -> None:
    assert UNKNOWN_CONVERTED_TO_ZERO not in verify_response("Accessibilité à 0.", tool_outputs=["texte libre"]).repair_reasons


def test_the_addendum_says_unknown_is_not_zero_in_both_languages() -> None:
    assert "pas zéro" in repair_addendum([UNKNOWN_CONVERTED_TO_ZERO], "fr")
    assert "not zero" in repair_addendum([UNKNOWN_CONVERTED_TO_ZERO], "en")


@pytest.mark.asyncio
async def test_replay_the_turn_tool_unknown_then_reply_zero(monkeypatch) -> None:
    """Entrée → outil appelé → réponse : l'inconnue écrite « 0 » est suivie de la précision."""
    _install_client(
        monkeypatch,
        [
            _resp("tool_use", [_tool_use("get_account_suitability_verdict", {}, "t1")]),
            _resp("end_turn", [_text("L'accessibilité est à 0 sur ce compte.")]),
        ],
    )

    async def _fake_tool(name, tool_input, **_kwargs):
        return json.loads(UNKNOWNS)

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", _fake_tool)
    reply, _ = await chat_orchestrator.run_chat_with_tools("sys", "vaut-il le coup ?", user_id=USER, profile_data=None)
    assert "L'accessibilité est à 0" in reply
    assert "pas zéro" in reply
