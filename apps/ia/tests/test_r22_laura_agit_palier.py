"""R22-LG (#4429.3 PARTIAL, recette prod /chat 22/10) — « Toulouse : 10 comptes »
rendus, mais le palier d'élargissement n'était pas nommé dans la prose : le
registre rend `zone_line` (et l'étiquette `widened` de chaque compte élargi),
le modèle l'omettait. Le palier se DIT en une phrase courte, garanti en sortie.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.prompts.laura_acts import ensure_widening_line, widening_line_from_output
from app.services import chat_orchestrator
from tests.test_chat_orchestrator import _install_client, _resp, _text, _tool_use

_ZONE_LINE = "Peu de comptes à Toulouse : recherche élargie à 50 km"


def test_the_zone_line_of_the_registry_is_the_widening_line():
    assert widening_line_from_output({"items": [{"name": "A"}], "zone_line": _ZONE_LINE}) == _ZONE_LINE


def test_widened_accounts_name_their_tier():
    line = widening_line_from_output(
        {
            "items": [
                {"name": "A"},
                {"name": "B", "widened": "secteur voisin : défense"},
                {"name": "C", "widened": "secteur voisin : défense"},
            ]
        }
    )
    assert line is not None
    assert "secteur voisin : défense" in line and line.count("défense") == 1


def test_no_widening_no_line():
    assert widening_line_from_output({"items": [{"name": "A"}]}) is None
    assert widening_line_from_output({"error": "x"}) is None
    assert widening_line_from_output(None) is None


def test_the_line_is_prepended_when_the_reply_omits_the_tier():
    actions = [{"tool": "run_account_search", "widening_line": _ZONE_LINE}]
    reply = ensure_widening_line("Voici 10 comptes.", actions)
    assert reply == f"{_ZONE_LINE}.\n\nVoici 10 comptes."
    # La clé de travail ne voyage jamais vers l'écran.
    assert "widening_line" not in actions[0]


def test_the_guard_knows_how_to_say_no():
    actions = [{"tool": "run_account_search", "widening_line": _ZONE_LINE}]
    said = "J'ai élargi à 50 km autour de Toulouse.\n\nVoici 10 comptes."
    assert ensure_widening_line(said, actions) == said
    assert "widening_line" not in actions[0]
    assert ensure_widening_line("Voici 10 comptes.", [{"tool": "run_account_search"}]) == "Voici 10 comptes."
    assert ensure_widening_line("", [{"widening_line": _ZONE_LINE}]) == ""


@pytest.mark.asyncio
async def test_a_widened_search_names_its_tier_in_the_reply(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    _install_client(
        monkeypatch,
        [
            _resp("tool_use", [_tool_use("run_account_search", {"city": "Toulouse"}, "t1")]),
            _resp("end_turn", [_text("Voici 10 comptes aéronautique.")]),
        ],
    )
    monkeypatch.setattr(
        chat_orchestrator,
        "execute_chat_tool",
        AsyncMock(return_value={"items": [{"name": f"C{i}"} for i in range(10)], "zone_line": _ZONE_LINE}),
    )
    reply, actions = await chat_orchestrator.run_chat_with_tools(
        "sys", "u", user_id="u1", profile_data=None, user_message="Trouve-moi 10 comptes aéronautique à Toulouse."
    )
    assert reply.startswith(_ZONE_LINE)
    assert all("widening_line" not in action for action in actions)
