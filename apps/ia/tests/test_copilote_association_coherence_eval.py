"""#3337 (LAU-FINAL-247) — garde de ``laura_association_coherence.BLOCK_ASSOCIATION_COHERENCE``."""

from __future__ import annotations

from app.prompts.bellum_advisor import build_system_prompt
from app.prompts.laura_association_coherence import BLOCK_ASSOCIATION_COHERENCE

BARE = build_system_prompt({}, {}, "", "")
HORS_BLOC = BARE.replace(BLOCK_ASSOCIATION_COHERENCE, "")

#: #3337 — les sept cohérences minimales que l'issue exige avant un top 3.
_SEVEN_CHECKS: tuple[str, ...] = (
    "la cohérence du métier avec l'entreprise ou l'entité",
    "la cohérence du rôle avec le profil du consultant",
    "la cohérence géographique",
    "la cohérence des dates",
    "la cohérence du niveau de séniorité",
    "la cohérence des compétences obligatoires",
    "la cohérence entre le compte cité et la source",
)

_ANCHORS: tuple[str, ...] = (
    "Tu ne recomposes JAMAIS une opportunité en associant librement",
    "QUAND UNE ASSOCIATION PARAÎT SURPRENANTE, tu la contrôles D'ABORD",
)


def test_the_corpus_is_not_empty():
    assert BARE
    assert BLOCK_ASSOCIATION_COHERENCE in BARE


def test_the_seven_checks_are_all_named():
    for check in _SEVEN_CHECKS:
        assert check in BLOCK_ASSOCIATION_COHERENCE, check


def test_every_anchor_is_present():
    for anchor in _ANCHORS:
        assert anchor in BLOCK_ASSOCIATION_COHERENCE, anchor


def test_removing_the_block_drops_every_anchor():
    for anchor in (*_SEVEN_CHECKS, *_ANCHORS):
        assert anchor not in HORS_BLOC, anchor
