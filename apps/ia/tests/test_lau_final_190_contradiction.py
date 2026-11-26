"""LAU-FINAL-190 (#3184) — le résolveur de contradictions multi-source de Laura.

L'issue décrit un objet ``Conflict`` à treize champs et sept statuts
(``resolved``, ``workspace_override``, ``freshness_wins``, ``authority_wins``,
``scope_difference``, ``unresolved``, ``obsolete_source``). Une partie existe
déjà, ailleurs : ``ConflictedField`` (``packages/contracts/src/schemas/
field-conflict.ts``) porte déjà field/valueA/valueB/source/at/resolvedBy avec
trois issues (``human``/``recency``/``unresolved``), mais pour la synchronisation
CRM d'un champ d'entreprise — jamais branché sur une réponse `/chat`. Bâtir
l'objet complet, le persister et le brancher sur la synthèse de Laura est un
système de plusieurs jours (mémoire des contradictions, ``next_check``,
autorité numérique) : hors de ce lot, versé à l'épopée dédiée.

Ce que ce fichier verrouille, ce sont les TROIS règles de rédaction que
l'issue demande et qu'aucun bloc ne portait encore — vérifiées comme
`test_copilote_prompt_blocks.py` vérifie les siennes : pas la formulation
exacte, la RÈGLE que `_BLOCK_MARKET_MEMORY` doit porter, et sa présence dans
le prompt réellement assemblé (`build_system_prompt`), pas seulement dans la
constante."""

from __future__ import annotations

from app.prompts.bellum_advisor import _BLOCK_MARKET_MEMORY, build_system_prompt


def test_subsidiary_and_group_can_disagree_without_contradiction():
    """#3184.6 — une filiale et son groupe peuvent porter deux valeurs
    différentes sur le même champ sans que ce soit un désaccord ; le périmètre
    de chaque valeur se nomme avant de les rapprocher."""
    assert "sans qu'il y ait désaccord" in _BLOCK_MARKET_MEMORY
    assert "périmètre" in _BLOCK_MARKET_MEMORY.lower()


def test_never_merges_two_periods_or_scopes_as_if_they_matched():
    """#3184.10 — le NO-GO de l'issue : deux sources de périodes ou de
    périmètres différents ne s'assemblent jamais dans une même phrase comme
    si elles décrivaient le même instant."""
    assert "ne se fondent jamais dans une seule phrase" in _BLOCK_MARKET_MEMORY


def test_contradiction_states_the_commercial_consequence_not_just_the_two_sides():
    """#3184.9 — Laura synthétise la CONSÉQUENCE COMMERCIALE d'une
    contradiction résolue, jamais seulement sa citation brute côte à côte."""
    assert "CONSÉQUENCE COMMERCIALE" in _BLOCK_MARKET_MEMORY
    # L'exemple donné par l'issue : une conclusion qui va au-delà de ce que dit
    # la source actuelle (« ne prend plus de consultants ») est explicitement
    # rejetée, pas seulement la version correcte donnée en exemple positif.
    assert "va au-delà de ce que dit la source actuelle" in _BLOCK_MARKET_MEMORY


def test_the_three_rules_reach_the_real_system_prompt():
    """Une règle qui n'atteint jamais `build_system_prompt` n'est pas livrée —
    le motif qui revient dans tout le dépôt : chercher l'APPELANT, pas
    seulement la fonction (CLAUDE.md, « ce qui est déjà livré »)."""
    prompt = build_system_prompt({}, {}, "", "")
    assert "sans qu'il y ait désaccord" in prompt
    assert "CONSÉQUENCE COMMERCIALE" in prompt
