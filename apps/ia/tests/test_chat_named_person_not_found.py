"""#2533.1 — mesuré en recette le 17/09 : « Je ne trouve pas de fiche
correspondant à Caroline Jaouen chez UNEO » alors que la personne est la DSI
de ce compte.

Diagnostic (voir le registre) : Laura n'a AUCUN outil de recherche d'annuaire —
`chat_tools.py` ne porte ni `search_contacts` ni équivalent, seuls les
contacts déjà résolus par l'API (`contacts_summary`, rendu sous « CONTACTS
CLÉS » par `build_system_prompt`) sont devant elle. Un « je ne trouve pas » nu
se lit comme une recherche exhaustive qui aurait échoué, alors que la portée
réelle est bornée à cette liste déjà connue.

Sans nouvel outil ce lot (la donnée peut être réellement absente de ce que le
produit sait aujourd'hui — le point reste `retenu` avec cette mesure écrite),
ce test verrouille la partie qui se corrige SANS attendre un outil
d'annuaire : la réponse doit dire ce qu'elle a regardé et où, jamais un « je
ne trouve pas » nu.
"""

from __future__ import annotations

from app.prompts.bellum_advisor import _BLOCK_TRUTH, build_system_prompt
from app.services.claude_service import CACHE_SEGMENT_BREAK

_FRAGMENT = "PERSONNE NOMMÉE INTROUVABLE."
_WHAT_WAS_CHECKED = "les contacts déjà connus de ce compte"

BARE = build_system_prompt({}, {}, "", "")


def test_the_instruction_is_carried_on_its_own_line() -> None:
    lines = [line for line in BARE.splitlines() if _FRAGMENT in line]
    assert len(lines) == 1
    assert _WHAT_WAS_CHECKED in lines[0]
    assert "jamais un « je ne trouve pas » nu" in lines[0]


def test_it_lives_in_the_invariant_segment_never_the_volatile_tail() -> None:
    segments = BARE.split(CACHE_SEGMENT_BREAK)
    assert _FRAGMENT in segments[0]
    assert all(_FRAGMENT not in segment for segment in segments[1:])


def test_the_guard_knows_how_to_say_no() -> None:
    """Sans le bloc `_BLOCK_TRUTH`, la consigne disparaît — elle ne survit pas
    dans un bloc voisin."""
    degraded = BARE.replace(_BLOCK_TRUTH, "")
    assert len(degraded) < len(BARE)
    assert _FRAGMENT not in degraded
