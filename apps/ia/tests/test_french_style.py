"""Les system prompts du dossier imposent un français accentué (restitution TF1).

Le dossier livré sortait en français sans accents parce que les prompts eux-mêmes
sont écrits sans accents et que le modèle imite ce style. On vérifie que chaque
prompt qui produit du texte LU par le commercial porte la directive de style.
"""

from __future__ import annotations

import pytest

from app.prompts.style import FRENCH_STYLE_DIRECTIVE
from app.prompts import (
    bellum_contacts,
    bellum_facts,
    bellum_organigramme,
    bellum_plan,
    bellum_scorer,
    bellum_signals,
    bellum_strategy,
    bellum_summary,
)

_SAMPLE = {"companyName": "ACME", "size": "50", "offers": ["Cloud"], "sectors": ["Media"]}

_PIPELINE_SYSTEM_BUILDERS = [
    ("facts", bellum_facts.build_system_prompt),
    ("signals", bellum_signals.build_system_prompt),
    ("strategy", bellum_strategy.build_system_prompt),
    ("contacts", bellum_contacts.build_system_prompt),
    ("organigramme", bellum_organigramme.build_system_prompt),
    ("plan", bellum_plan.build_system_prompt),
    ("scorer", bellum_scorer.build_system_prompt),
    ("summary", bellum_summary.build_system_prompt),
]


@pytest.mark.parametrize("name,builder", _PIPELINE_SYSTEM_BUILDERS)
def test_pipeline_system_prompt_carries_french_style(name, builder):
    prompt = builder(_SAMPLE)
    assert FRENCH_STYLE_DIRECTIVE in prompt, f"{name}: directive de style FR absente"


@pytest.mark.parametrize("name,builder", _PIPELINE_SYSTEM_BUILDERS)
def test_directive_is_itself_accented(name, builder):
    # La directive montre l'exemple : elle DOIT être accentuée, sinon elle
    # enseignerait exactement le défaut qu'elle corrige.
    assert "présente" in FRENCH_STYLE_DIRECTIVE
    assert "décideur" in FRENCH_STYLE_DIRECTIVE
    assert "presente »" in FRENCH_STYLE_DIRECTIVE  # cité comme contre-exemple
