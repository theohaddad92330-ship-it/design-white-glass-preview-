"""#3247.r41 — « quelles alternatives à Safran ? » : UNE phrase en prose, ni relation CRM, ni présence marché,
ni partenaire écarté. L'outil existait (r40) mais rien ne le forçait ni ne bâtissait la carte depuis ses lignes."""

from __future__ import annotations

import pytest

from app.services import chat_orchestrator
from app.services.compilers.intent_router import asks_alternatives_to_a_group
from app.services.known_shape_gate import shape_read_from_tool

TOOL = "suggest_account_alternatives"

OUTPUT = {
    "source_account_verdict": None,
    "source_account_name": "Safran",
    "source_account_note": "Safran n'est pas dans ton portefeuille.",
    "alternatives": [
        {
            "account": {"name": "Thales", "siren": "552059024", "city": "Paris"},
            "why_similar": "Même secteur ciblé : Aéronautique",
            "why_easier": "le CRM branché porte déjà une relation avec cette entreprise",
            "checked": [
                "relation CRM : existante dans ton espace",
                "présence marché : aucun externe observé",
                "preuve dans ce secteur : aucune dans ton espace",
            ],
            "missing_check": ["chemin d'accès (partenaire) — non vérifié : compte hors de ton portefeuille"],
            "access_path": None,
        }
    ],
    "set_aside_partners": ["Capgemini"],
}


@pytest.mark.parametrize(
    "message",
    [
        "quelles alternatives à Safran ?",
        "Alternatives à Safran",
        "Quelle alternative au groupe Safran",
        "alternatives to Safran?",
    ],
)
def test_detects_alternatives_to_a_group(message):
    assert asks_alternatives_to_a_group(message)


@pytest.mark.parametrize(
    "message", ["Bonjour", "alors on fait quoi ?", "d'autres pistes ?", "une alternative d'hébergement", ""]
)
def test_says_no_elsewhere(message):
    assert not asks_alternatives_to_a_group(message)


def test_forces_the_tool_at_round_zero_only():
    tools = [{"name": TOOL}]
    ask = "quelles alternatives à Safran ?"
    assert chat_orchestrator._forced_alternatives_kwargs(0, ask, tools) == {"force_tool": TOOL}
    assert chat_orchestrator._forced_alternatives_kwargs(1, ask, tools) == {}
    assert chat_orchestrator._forced_alternatives_kwargs(0, "Bonjour", tools) == {}
    assert chat_orchestrator._forced_alternatives_kwargs(0, ask, []) == {}


def test_card_is_built_from_the_tool_rows_with_crm_market_proof_and_set_aside():
    read = shape_read_from_tool(TOOL, OUTPUT, language="fr")
    assert read is not None and read["count"] == 1
    block = read["blocks"]["account_ranking"]
    assert block["title"] == "Alternatives à Safran"
    item = block["items"][0]
    assert item["name"] == "Thales"
    assert any("relation CRM" in x for x in item["limits"])
    assert any("présence marché" in x for x in item["limits"])
    assert any("preuve dans ce secteur" in x for x in item["limits"])
    assert block["not_evaluated"] == ["Écartés — partenaires déclarés de l'espace, pas des cibles : Capgemini."]
    assert "verdict" not in item


def test_no_card_without_alternatives():
    assert shape_read_from_tool(TOOL, {"alternatives": [], "no_alternative_note": "x"})["blocks"] == {}
