"""#3196.7 (LAU-FINAL-202) — garde de ``laura_source_priority.BLOCK_SOURCE_PRIORITY``.

Aucun appel au modèle : chaque assertion vérifie qu'une RÈGLE ÉCRITE existe
dans le prompt ASSEMBLÉ. Trois preuves, comme toute garde du dépôt :

1. savoir dire NON — ``test_removing_the_block_drops_the_no_go_language`` ;
2. lire un corpus non vide — ``BARE`` est le VRAI prompt assemblé ;
3. ne pas attraper le voisin — les ancres sont vérifiées ABSENTES de
   ``HORS_BLOC`` (le prompt privé du bloc).
"""

from __future__ import annotations

from app.prompts.bellum_advisor import build_system_prompt
from app.prompts.laura_source_priority import BLOCK_SOURCE_PRIORITY

BARE = build_system_prompt({}, {}, "", "")
HORS_BLOC = BARE.replace(BLOCK_SOURCE_PRIORITY, "")

#: Ancres propres à ce bloc — assez distinctives pour ne collisionner avec
#: aucun autre bloc du prompt (mesuré : la simple présence dans ``BARE``
#: suffit à faire tomber la garde si un autre bloc les porte aussi).
_ANCHORS: tuple[str, ...] = (
    "L'INTERNE D'ABORD, LE PUBLIC EN DERNIER RECOURS",
    "tu épuises D'ABORD ce qui ne coûte rien et est déjà là",
    "NE JAMAIS finir un tour sur UNE SEULE recherche publique",
)


def test_the_corpus_is_not_empty():
    assert BARE
    assert BLOCK_SOURCE_PRIORITY in BARE


def test_every_anchor_is_present():
    for anchor in _ANCHORS:
        assert anchor in BLOCK_SOURCE_PRIORITY, anchor


def test_it_names_the_free_internal_sources_before_the_paid_public_one():
    order = [
        BLOCK_SOURCE_PRIORITY.index(name)
        for name in ("référentiel sectoriel Bellum", "observation du marché", "recherche publique")
    ]
    assert order == sorted(order)


def test_removing_the_block_drops_the_no_go_language():
    for anchor in _ANCHORS:
        assert anchor not in HORS_BLOC, anchor
