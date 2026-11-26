"""#4060 — la préférence « approche directe » enregistrée s'applique aux messages suivants.

- Elle ne s'applique QUE sans objectif choisi : un choix explicite du composer gagne toujours.
- Une valeur inconnue ou absente ne change rien (jamais devinée).
- La copie IA des constantes ne diverge pas du contrat TypeScript.
- L'appelant réel (le routeur de génération) l'utilise.
"""

from __future__ import annotations

import inspect
import re
from pathlib import Path

import pytest

from app.routers import message as message_router
from app.services.message_approach_preference import (
    MESSAGE_APPROACH_PREFERENCE_KEY,
    MESSAGE_APPROACH_VALUES,
    apply_message_approach_preference,
    read_message_approach_preference,
)

CONTRACT = Path(__file__).resolve().parents[3] / "packages/contracts/src/schemas/message-approach-preference.ts"


def test_the_preference_fills_a_missing_objective() -> None:
    out = apply_message_approach_preference({"offer": "x"}, {MESSAGE_APPROACH_PREFERENCE_KEY: "direct"})
    assert out["objective"] == "approche_directe"
    assert out["offer"] == "x"


def test_a_chosen_objective_always_wins() -> None:
    chosen = {"objective": "relance"}
    assert apply_message_approach_preference(chosen, {MESSAGE_APPROACH_PREFERENCE_KEY: "direct"}) == chosen


@pytest.mark.parametrize("bag", [None, {}, {MESSAGE_APPROACH_PREFERENCE_KEY: "agressif"}, {"replyTone": "direct"}])
def test_nothing_known_changes_nothing(bag: dict | None) -> None:
    assert apply_message_approach_preference({}, bag) == {}


def test_the_reply_tone_of_laura_is_not_the_message_approach() -> None:
    # « ton plus direct » (réglage de forme des réponses de Laura) ne déclenche PAS l'approche directe.
    assert read_message_approach_preference({"replyTone": "direct"}) is None


def test_the_copy_matches_the_contract() -> None:
    source = CONTRACT.read_text(encoding="utf-8")
    assert f"MESSAGE_APPROACH_PREFERENCE_KEY = '{MESSAGE_APPROACH_PREFERENCE_KEY}'" in source
    values = re.search(r"MESSAGE_APPROACH_VALUES = \[(.*?)\] as const", source)
    assert values is not None
    assert tuple(re.findall(r"'([^']+)'", values.group(1))) == MESSAGE_APPROACH_VALUES


def test_the_generation_router_applies_it() -> None:
    assert "apply_message_approach_preference(" in inspect.getsource(message_router)
