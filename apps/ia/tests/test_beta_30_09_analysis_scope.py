"""Retour bêta 30/09 (#3434) — périmètre avant analyse d'un grand groupe.

Demande initiale : « Analyse Decathlon. » Laura rendait une description
générale de l'entreprise au lieu de découper le groupe en périmètres
exploitables avant de lancer `plan_account_analysis` (payant). Portée par
`_BLOCK_ANALYSIS_SCOPE` dans `build_system_prompt`."""

from __future__ import annotations

from app.prompts.bellum_advisor import (
    _BLOCK_ANALYSIS_SCOPE,
    build_system_prompt,
)


def test_never_launches_on_the_whole_group_by_default():
    """#3434.1 — jamais l'analyse sur le groupe entier par défaut."""
    assert "tu ne lances jamais l'analyse sur le groupe entier par défaut" in _BLOCK_ANALYSIS_SCOPE
    assert "tu ne rends jamais une description générale de l'entreprise" in _BLOCK_ANALYSIS_SCOPE


def test_proposes_a_breakdown_before_launching():
    """#3434.2 — découpage par entité/programme/direction avant de lancer l'outil."""
    block = _BLOCK_ANALYSIS_SCOPE
    assert "DÉCOUPAGE" in block
    for element in (
        "les périmètres compatibles avec l'offre de l'utilisateur",
        "les entités accessibles dans sa zone",
        "les équipes où un recours externe ou un projet récent est documenté",
    ):
        assert element in block, f"élément absent : {element!r}"
    assert "plan_account_analysis" in block


def test_reuses_the_penetration_strategy_principle_ga26():
    """#3434.3 — réutilise PÉRIMÈTRE PRIORITAIRE, ne le retape pas (GA-26)."""
    assert "LE GROUPE SERT DE CONTEXTE, L'ACTION PART D'UN PÉRIMÈTRE PRÉCIS" in _BLOCK_ANALYSIS_SCOPE
    assert "PÉRIMÈTRE PRIORITAIRE" in _BLOCK_ANALYSIS_SCOPE


def test_names_a_concrete_example_and_the_forbidden_reflexes():
    """#3434 (recette prod 26755bbac3, lot C1, 30/09) — le bloc portait la
    règle sans exemple ni liste d'interdits, contrairement aux autres blocs
    du même lot bêta : un exemple nommé sur Decathlon (le cas mesuré) et les
    réflexes interdits explicites."""
    block = _BLOCK_ANALYSIS_SCOPE
    assert "EXEMPLE ATTENDU" in block
    assert "Decathlon regroupe plusieurs entités" in block
    assert "CE QUE TU NE FAIS JAMAIS" in block
    for reflex in (
        "lancer `plan_account_analysis` sur le nom du groupe seul sans avoir d'abord proposé de découpage",
        "rendre une description générale de l'entreprise à la place d'une stratégie",
    ):
        assert reflex in block, f"réflexe absent : {reflex!r}"


def test_the_rule_reaches_the_real_system_prompt():
    """Une règle qui n'atteint jamais `build_system_prompt` n'est pas livrée."""
    prompt = build_system_prompt({}, {}, "", "")
    assert "PÉRIMÈTRE AVANT ANALYSE D'UN GRAND GROUPE" in prompt
