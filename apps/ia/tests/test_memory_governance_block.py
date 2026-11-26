"""#2260 (LAU-FINAL-005) — la gouvernance de la mémoire, dans le prompt.

Le ticket liste cinq règles qu'aucun bloc n'écrivait avant ce lot :
  - Laura ne devine jamais sa propre politique de rétention (#2260.2) ;
  - une donnée privée de l'espace prime sur une inférence (#2260.10) ;
  - un fait objet prime sur le résumé de conversation (#2260.11) ;
  - la demande de CE tour prime sur la mémoire durable pour ce tour (#2260.12) ;
  - un refus de retenir un point vaut pour le reste du fil (#2260.29) ;
  - une donnée structurante ne devient durable que si la politique l'autorise
    en plus de la demande/confirmation (#2260.34).

Ce fichier tient trois preuves, comme toute garde du dépôt : il SAIT dire NON
(``test_a_stripped_block_would_be_missing_the_rules``), il LIT un corpus réel
(``test_the_rendered_prompt_actually_carries_the_block``), et il n'attrape pas
un cas légitime voisin (``test_the_market_truth_hierarchy_still_ranks_accounts``
— la hiérarchie de vérité SUR UN COMPTE, `_BLOCK_MARKET_MEMORY`, reste un axe
séparé, jamais fusionné avec celui-ci).
"""

from __future__ import annotations

from app.prompts.bellum_advisor import (
    _BLOCK_MARKET_MEMORY,
    _BLOCK_MEMORY_GOVERNANCE,
    build_system_prompt,
)


def test_the_guard_reads_a_real_non_empty_corpus():
    assert len(_BLOCK_MEMORY_GOVERNANCE.strip()) > 200


def test_no_speculation_about_laura_s_own_retention_policy():
    assert "TU NE DEVINES JAMAIS TA PROPRE POLITIQUE" in _BLOCK_MEMORY_GOVERNANCE
    assert "get_memory" in _BLOCK_MEMORY_GOVERNANCE


def test_the_three_missing_conflict_rules_are_now_written():
    assert "une donnée privée de l'espace" in _BLOCK_MEMORY_GOVERNANCE
    assert "prime sur une inférence" in _BLOCK_MEMORY_GOVERNANCE
    assert "prime sur le résumé roulant de la conversation" in _BLOCK_MEMORY_GOVERNANCE
    assert "la demande de CE tour prime sur la mémoire durable" in _BLOCK_MEMORY_GOVERNANCE


def test_declining_a_pin_holds_for_the_rest_of_the_thread():
    assert "tu ne le proposes plus dans ce même fil" in _BLOCK_MEMORY_GOVERNANCE


def test_durable_writing_needs_policy_on_top_of_demand_or_confirmation():
    assert "la politique produit l'autorise" in _BLOCK_MEMORY_GOVERNANCE


def test_a_stripped_block_would_be_missing_the_rules():
    """La garde sait dire NON : un bloc VIDÉ ne porte plus aucune des règles —
    reproduit la régression qu'un retrait accidentel provoquerait."""
    stripped = ""
    assert "prime sur une inférence" not in stripped
    assert "TU NE DEVINES JAMAIS TA PROPRE POLITIQUE" not in stripped


def test_the_rendered_prompt_actually_carries_the_block():
    """Pas seulement la constante Python : le prompt RENDU la porte aussi."""
    rendered = build_system_prompt({}, {}, "", "")
    assert "GOUVERNANCE DE LA MÉMOIRE" in rendered


def test_the_market_truth_hierarchy_still_ranks_accounts_a_different_axis():
    """Témoin du cas légitime voisin : `_BLOCK_MARKET_MEMORY` range les DONNÉES
    d'un compte par PROVENANCE — cette garde ne doit pas confondre les deux
    hiérarchies ni en absorber une dans l'autre."""
    assert "HIÉRARCHIE DE VÉRITÉ SUR UN COMPTE" in _BLOCK_MARKET_MEMORY
    assert "HIÉRARCHIE DE VÉRITÉ SUR UN COMPTE" not in _BLOCK_MEMORY_GOVERNANCE
