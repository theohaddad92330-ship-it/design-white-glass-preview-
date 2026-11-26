"""#3336 (LAU-FINAL-246) — garde de ``laura_per_item_provenance.BLOCK_PER_ITEM_PROVENANCE``.

Même patron que les gardes voisines : aucun appel au modèle, ancres vérifiées
présentes dans le bloc, absentes une fois le bloc retiré.
"""

from __future__ import annotations

from app.prompts.bellum_advisor import build_system_prompt
from app.prompts.laura_per_item_provenance import BLOCK_PER_ITEM_PROVENANCE

BARE = build_system_prompt({}, {}, "", "")
HORS_BLOC = BARE.replace(BLOCK_PER_ITEM_PROVENANCE, "")

#: #3336 — les expressions que l'issue nomme explicitement comme insuffisantes.
_INSUFFICIENT_PHRASINGS: tuple[str, ...] = (
    "catalogue interne",
    "workspace account",
    "sept sources",
    "mémoire disponible",
)

_ANCHORS: tuple[str, ...] = (
    "un nombre global de sources (« 7 sources ») ne dit jamais quelle source soutient QUOI",
    "porte SA PROPRE phrase de provenance, individuelle, jamais rattachée à toute une réponse",
    "LA PROVENANCE DOIT ÊTRE COMPRÉHENSIBLE PAR UN COMMERCIAL",
)


def test_the_corpus_is_not_empty():
    assert BARE
    assert BLOCK_PER_ITEM_PROVENANCE in BARE


def test_every_anchor_is_present():
    for anchor in _ANCHORS:
        assert anchor in BLOCK_PER_ITEM_PROVENANCE, anchor


def test_the_insufficient_phrasings_are_named_as_insufficient():
    for phrasing in _INSUFFICIENT_PHRASINGS:
        assert phrasing in BLOCK_PER_ITEM_PROVENANCE, phrasing


def test_it_never_leaks_the_internal_codename():
    """Même discipline que ``laura_source_priority`` — DataForge ne se nomme jamais."""
    assert "DataForge" not in BLOCK_PER_ITEM_PROVENANCE
    assert "référentiel sectoriel Bellum" in BLOCK_PER_ITEM_PROVENANCE


def test_removing_the_block_drops_every_anchor():
    # Les expressions insuffisantes sont un vocabulaire PARTAGÉ : #3346 (langage
    # métier) et la liste des formulations interdites les nomment aussi. Seules
    # les phrases propres à ce bloc doivent disparaître avec lui.
    for anchor in _ANCHORS:
        assert anchor not in HORS_BLOC, anchor
