"""Retour bêta 30/09/2026 — lot C04.

#3391 — étape invisible de préparation méthodologique avant chaque réponse.
#3393 — détection de la question métier cachée derrière certaines demandes.

Les deux blocs sont TOUJOURS rendus (invariants, indépendants d'un compte) :
``BARE`` reproduit le même patron que ``test_copilote_prompt_blocks.py``
(``build_system_prompt({}, {}, "", "")``).
"""

from __future__ import annotations

from app.prompts.bellum_advisor import (
    _BLOCK_HIDDEN_QUESTION,
    _BLOCK_PREPARATION_STEP,
    build_system_prompt,
)

BARE = build_system_prompt({}, {}, "", "")


def test_preparation_step_block_is_always_rendered():
    assert _BLOCK_PREPARATION_STEP in BARE


def test_preparation_step_names_the_ten_determinations():
    for term in (
        "demande explicitement",
        "objectif métier probable",
        "rôle déclaré",
        "stade commercial",
        "données déjà disponibles",
        "droits d'accès",
        "informations critiques qui manquent",
        "méthode commerciale applicable",
        "outils réellement utiles",
        "action possible",
    ):
        assert term in _BLOCK_PREPARATION_STEP


def test_preparation_step_never_becomes_a_visible_preamble():
    assert "JAMAIS par écrit" in _BLOCK_PREPARATION_STEP
    assert "ne devient JAMAIS un préambule visible" in _BLOCK_PREPARATION_STEP


def test_preparation_step_does_not_duplicate_the_restraint_blocks_it_cites():
    """GA-26 — les trois garde-fous sont NOMMÉS, jamais réécrits ici."""
    for cited_block_head in ("COMPRENDRE", "MISSION", "HIÉRARCHIE DU CONTEXTE", "LE FIL DE LA CONVERSATION"):
        assert cited_block_head in _BLOCK_PREPARATION_STEP


def test_hidden_question_block_is_always_rendered():
    assert _BLOCK_HIDDEN_QUESTION in BARE


def test_hidden_question_answers_the_explicit_request_first():
    assert "tu réponds à la demande EXPLICITE, en entier" in _BLOCK_HIDDEN_QUESTION


def test_hidden_question_is_acted_on_never_a_template_sentence():
    # R22-LG (recette prod 22/10, #4438) — la phrase « Et derrière ta question… » est retirée.
    assert "tu AGIS sur la question plus utile" in _BLOCK_HIDDEN_QUESTION
    assert "jamais une question de relance en fin de réponse" in _BLOCK_HIDDEN_QUESTION


def test_hidden_question_never_claims_certainty():
    assert "JAMAIS connaître l'intention réelle avec certitude" in _BLOCK_HIDDEN_QUESTION
    assert "probablement" in _BLOCK_HIDDEN_QUESTION


def test_hidden_question_never_blocks_on_endless_reformulation():
    assert "jamais" in _BLOCK_HIDDEN_QUESTION
    assert "reformulation interminable" in _BLOCK_HIDDEN_QUESTION


def test_hidden_question_never_forces_a_signal_on_a_limpid_request():
    assert "aucun second sujet n'est plausible" in _BLOCK_HIDDEN_QUESTION


def test_hidden_question_the_four_canonical_forms_always_trigger():
    """#3393 (reste, recette prod 30/09) — RÉFUTÉ : le gabarit n'apparaissait
    sur AUCUNE des trois questions testées, dont des formes canoniques citées
    par ce bloc lui-même. La porte de sortie (« demande déjà limpide ») ne
    couvre plus les quatre formes nommées : elles déclenchent SYSTÉMATIQUEMENT."""
    block = _BLOCK_HIDDEN_QUESTION
    assert "DÉCLENCHEMENT SYSTÉMATIQUE" in block
    assert "tu ne sautes JAMAIS l'étape 2" in block
    for canonical_form in ("qui est le DSI ?", "écris-moi un message", "trouve-moi des comptes Java", "qui est déjà chez eux ?"):
        assert canonical_form in block, f"forme canonique absente : {canonical_form!r}"
    # La porte de sortie exclut explicitement les quatre formes, plutôt que de
    # les laisser retomber dans une exception vague.
    assert "tu ne l'invoques jamais sur l'une des quatre formes elles-mêmes" in block


def test_hidden_question_is_distinct_from_anticipating_the_same_question():
    """#3393 n'est pas #3199/`_BLOCK_ANTICIPATORY` : les deux blocs coexistent,
    jamais fusionnés (chaque bloc reste indépendamment vérifiable)."""
    from app.prompts.bellum_advisor import _BLOCK_ANTICIPATORY

    assert _BLOCK_ANTICIPATORY in BARE
    assert _BLOCK_ANTICIPATORY != _BLOCK_HIDDEN_QUESTION
