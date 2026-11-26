"""#3335 (LAU-FINAL-245) — garde de ``laura_need_freshness.BLOCK_NEED_FRESHNESS``.

Aucun appel au modèle : chaque assertion vérifie qu'une RÈGLE ÉCRITE existe
dans le prompt ASSEMBLÉ. Trois preuves, comme toute garde du dépôt :

1. savoir dire NON — ``test_removing_the_block_drops_every_anchor`` ;
2. lire un corpus non vide — ``BARE`` est le VRAI prompt assemblé ;
3. ne pas attraper le voisin — les ancres sont vérifiées ABSENTES de
   ``HORS_BLOC`` (le prompt privé du bloc).
"""

from __future__ import annotations

from app.prompts.bellum_advisor import build_system_prompt
from app.prompts.laura_need_freshness import BLOCK_NEED_FRESHNESS

BARE = build_system_prompt({}, {}, "", "")
HORS_BLOC = BARE.replace(BLOCK_NEED_FRESHNESS, "")

#: #3335.1 — les sept questions que l'issue exige avant tout mot d'urgence.
_SEVEN_QUESTIONS: tuple[str, ...] = (
    "d'où vient cette information",
    "de quand date-t-elle",
    "quel client ou interlocuteur l'a exprimée",
    "le besoin a-t-il été confirmé récemment",
    "l'échéance est-elle encore valable",
    "le périmètre et le compte sont-ils clairement identifiés",
    "sait-on qui l'a ajouté ou validé",
)

_ANCHORS: tuple[str, ...] = (
    "élément à vérifier, JAMAIS comme une opportunité certaine",
    "tu l'exclus des recommandations actives tant qu'il n'a pas été revérifié",
    "NE CONSTITUE JAMAIS, À LUI SEUL, UNE PREUVE",
)


def test_the_corpus_is_not_empty():
    assert BARE
    assert BLOCK_NEED_FRESHNESS in BARE


def test_the_seven_questions_are_all_named():
    for question in _SEVEN_QUESTIONS:
        assert question in BLOCK_NEED_FRESHNESS, question


def test_every_anchor_is_present():
    for anchor in _ANCHORS:
        assert anchor in BLOCK_NEED_FRESHNESS, anchor


def test_matching_status_is_named_as_not_proof():
    assert "considérer le statut « matching » comme une preuve de réalité" in BLOCK_NEED_FRESHNESS


def test_removing_the_block_drops_every_anchor():
    for anchor in (*_SEVEN_QUESTIONS, *_ANCHORS):
        assert anchor not in HORS_BLOC, anchor


def test_3348_laura_says_the_screens_word_perime_not_ancien():
    """#3348 — recette prod 02/10 : l'écran dit « Périmé — à revérifier » et Laura
    écrivait « ancien et à revérifier » : même verdict, deux mots. Le bloc impose
    le mot de l'écran, et son exemple le contient ; « ancien » seul n'est plus
    offert comme alternative. (Garde d'écriture : la réponse observée du modèle se
    rejoue en recette, voir le commentaire de l'issue.)"""
    assert "tu dis « périmé »" in BLOCK_NEED_FRESHNESS
    assert "à revérifier" in BLOCK_NEED_FRESHNESS
    assert "ancien ou périmé" not in BLOCK_NEED_FRESHNESS
    assert "J'ai retrouvé un besoin périmé" in BLOCK_NEED_FRESHNESS
    assert "J'ai retrouvé un ancien enregistrement" not in BLOCK_NEED_FRESHNESS
