"""#3889 — « Quels projets a Sanofi dans nos documents ? » : quatre projets, mais le
titre du document source n'était cité qu'en intro. Chaque projet cite SON document ;
si aucun document ne nomme le compte, Laura le dit au lieu de répondre de mémoire."""

from __future__ import annotations

from app.prompts.bellum_advisor import build_system_prompt


def test_each_project_drawn_from_the_knowledge_base_cites_its_own_document():
    prompt = build_system_prompt({}, {}, "", "")
    # #3889 — le titre est porté PAR CHAQUE ligne, pas seulement en introduction.
    assert "CHAQUE projet, référence ou élément" in prompt
    assert "— d'après « <titre du document> »" in prompt


def test_an_account_no_document_names_is_said_not_answered_from_memory():
    prompt = build_system_prompt({}, {}, "", "")
    assert "Aucun document de ton espace ne parle de <compte>" in prompt
