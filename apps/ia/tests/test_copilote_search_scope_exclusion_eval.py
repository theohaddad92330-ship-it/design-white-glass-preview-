"""#3339 (LAU-FINAL-249) — garde de ``laura_search_scope_exclusion.BLOCK_SEARCH_SCOPE_EXCLUSION``."""

from __future__ import annotations

from app.prompts.bellum_advisor import build_system_prompt
from app.prompts.laura_search_scope_exclusion import BLOCK_SEARCH_SCOPE_EXCLUSION

BARE = build_system_prompt({}, {}, "", "")
HORS_BLOC = BARE.replace(BLOCK_SEARCH_SCOPE_EXCLUSION, "")

#: #3339 — les sept formulations d'exclusion explicite que l'issue liste.
_EXCLUSION_PHRASES: tuple[str, ...] = (
    "hors de mon pipe",
    "de nouveaux comptes",
    "pas les comptes déjà analysés",
    "ne te base pas sur mon portefeuille",
    "je veux uniquement mes données internes",
    "je veux uniquement le marché externe",
    "ne prends pas mon profil en compte",
)

#: #3339 — les trois recherches séparées exigées pour une demande "hors pipe".
_THREE_SEARCHES: tuple[str, ...] = (
    "besoins externes actuellement vérifiables",
    "signaux actuels sur de nouveaux comptes",
    "comptes historiquement compatibles ou partenaires potentiels",
)

_ANCHORS: tuple[str, ...] = (
    "tu la respectes JUSQU'AU BOUT de la recherche, pas seulement dans ta première phrase",
    "déclarer « hors pipe » sans preuve",
)


def test_the_corpus_is_not_empty():
    assert BARE
    assert BLOCK_SEARCH_SCOPE_EXCLUSION in BARE


def test_every_exclusion_phrase_is_named():
    for phrase in _EXCLUSION_PHRASES:
        assert phrase in BLOCK_SEARCH_SCOPE_EXCLUSION, phrase


def test_the_three_searches_are_named():
    for search in _THREE_SEARCHES:
        assert search in BLOCK_SEARCH_SCOPE_EXCLUSION, search


def test_every_anchor_is_present():
    for anchor in _ANCHORS:
        assert anchor in BLOCK_SEARCH_SCOPE_EXCLUSION, anchor


def test_removing_the_block_drops_every_anchor():
    """"de nouveaux comptes" est exclue : phrase générique déjà portée par
    ``_BLOCK_DISCOVERY`` (exploration de comptes à prospecter) — pas une
    ancre PROPRE à ce bloc-ci, contrairement aux six autres formulations."""
    for anchor in (*_EXCLUSION_PHRASES, *_THREE_SEARCHES, *_ANCHORS):
        if anchor == "de nouveaux comptes":
            continue
        assert anchor not in HORS_BLOC, anchor


def test_recette_01_10_the_provenance_question_is_answered_before_any_job_proposal():
    """#3345 (recette prod 01/10) — « Ne te base pas sur mon pipe : comptes
    nouveaux, hors portefeuille… D'où viennent ces opportunités ? » : Laura
    reprenait bien le périmètre mais ne donnait la provenance qu'APRÈS la
    confirmation du job. Le bloc dit maintenant : réponse d'abord, job ensuite.
    Question à poser en recette : exactement celle ci-dessus, puis vérifier que
    la provenance (origine + niveau de preuve par piste) est dans la 1re réponse,
    avant la proposition de job brouillon."""
    assert "D'OÙ VIENNENT CES OPPORTUNITÉS" in BLOCK_SEARCH_SCOPE_EXCLUSION
    assert "AVANT toute proposition de job" in BLOCK_SEARCH_SCOPE_EXCLUSION
    assert "ne remplace jamais la réponse" in BLOCK_SEARCH_SCOPE_EXCLUSION
    assert "AVANT toute proposition de job" not in HORS_BLOC
