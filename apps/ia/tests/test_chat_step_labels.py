"""#3491 — le libellé d'attente d'un outil n'est jamais son nom technique."""

import pytest

from app.services.chat_step_labels import step_label
from app.services.chat_tools import CHAT_TOOLS

TOOL_NAMES = [tool["name"] for tool in CHAT_TOOLS]


@pytest.mark.parametrize("language", ["fr", "en"])
def test_every_tool_has_a_human_label(language):
    for name in TOOL_NAMES:
        label = step_label(name, language)
        assert label.endswith("…"), name
        assert "_" not in label, f"{name} → {label!r} : nom technique"


def test_the_incident_label_is_french():
    assert step_label("get_account_suitability_verdict") == "Lecture du verdict sur le compte…"
    assert "suitability" not in step_label("get_account_suitability_verdict").lower()


def test_english_label_when_interface_is_english():
    assert step_label("search_mailbox", "en") == "Reading your mailbox…"


def test_an_unknown_tool_never_shows_its_name():
    label = step_label("get_something_new_and_technical")
    assert label == "Action en cours…"
    assert "something" not in label
