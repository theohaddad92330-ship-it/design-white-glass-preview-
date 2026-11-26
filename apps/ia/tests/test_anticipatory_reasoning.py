"""LAU-FINAL-205 (#3199) — la proactivité DANS une réponse demandée.

Ce que le retour bêta décrit : Laura doit penser à l'étape suivante avant que
le commercial soit obligé de la demander, mais SEULEMENT dans le raisonnement
d'une réponse déjà demandée — distinct des notifications et interventions
spontanées, qui vivent ailleurs. Rien de tel n'existait dans le prompt avant ce
lot : ``_BLOCK_ASK_FIRST`` gouverne ce qu'on demande AVANT de chercher,
``_BLOCK_CLOSING_QUESTION`` la question qui referme une réponse — aucun des
deux ne couvre l'anticipation insérée AU MILIEU d'une réponse.

Ce que ces tests prouvent — que le prompt PORTE la consigne, mot pour mot, et
que le bloc fait partie du segment INVARIANT (mis en cache, commun à toute
conversation). Que le modèle l'applique est une éval en ligne, hors de portée
d'un test qui n'appelle jamais Claude.
"""

from __future__ import annotations

from app.prompts.bellum_advisor import (
    _BLOCK_ANTICIPATORY,
    _BLOCK_ASK_FIRST,
    _BLOCK_CLOSING_QUESTION,
    _BLOCK_FORMAT,
    build_system_prompt,
)
from app.services.claude_service import CACHE_SEGMENT_BREAK

#: Un prompt « nu » : tout ce qu'on y trouve vient des blocs constants.
BARE = build_system_prompt({}, {}, "", "")


def test_block_lives_in_the_bare_prompt() -> None:
    """Le bloc ne dépend d'aucun argument : il est de la famille des 17 blocs
    ``_BLOCK_*`` invariants, présent même sans profil ni compte."""
    assert _BLOCK_ANTICIPATORY in BARE


def test_block_is_distinct_from_notifications_and_spontaneous_moves() -> None:
    """#205.1 — le retour insiste : cette proactivité est celle d'une réponse
    DEMANDÉE, jamais une notification ni une intervention spontanée."""
    assert "notifications" in _BLOCK_ANTICIPATORY.lower()
    assert "spontané" in _BLOCK_ANTICIPATORY.lower()


def test_the_three_named_cases_are_covered() -> None:
    """#205.2/.3/.4 — les trois cas du retour (compte qui prend des consultants,
    demande de contacts, consultant donné) doivent chacun garder leurs
    anticipations nommées, pas une reformulation vague qui les fait disparaître."""
    lowered = _BLOCK_ANTICIPATORY.lower()
    for hint in ("preuve", "voie d'accès", "filiale"):  # cas 1 : compte
        assert hint in lowered, f"cas « compte » incomplet : {hint!r} absent"
    for hint in ("contacter en premier", "orienter", "collision"):  # cas 2 : contacts
        assert hint in lowered, f"cas « contacts » incomplet : {hint!r} absent"
    for hint in ("disponibilité", "consentement", "route de repli"):  # cas 3 : consultant
        assert hint in lowered, f"cas « consultant » incomplet : {hint!r} absent"


def test_format_caps_at_three_named_additions() -> None:
    """#205.5 — jamais dix suggestions génériques : au maximum une objection
    utile, une proposition proactive, une alternative."""
    lowered = _BLOCK_ANTICIPATORY.lower()
    assert "au maximum" in lowered or "jamais dix" in lowered
    assert "une objection utile" in lowered
    assert "une proposition proactive" in lowered
    assert "une alternative" in lowered


def test_quality_source_is_named_never_a_hollow_template() -> None:
    """#205.6 — la proactivité vient d'une règle métier, d'un fait, d'un manque
    décisif ou d'une prochaine étape logique ; jamais d'un template creux."""
    lowered = _BLOCK_ANTICIPATORY.lower()
    for hint in ("règle métier", "fait", "manque", "prochaine étape"):
        assert hint in lowered, f"source de qualité incomplète : {hint!r} absent"
    assert "veux-tu que je" in lowered  # cité pour être interdit, pas recommandé
    assert "jamais" in lowered


def test_no_go_never_waits_for_a_new_question() -> None:
    """#205.7 — NO-GO du retour : Laura n'attend pas une nouvelle question pour
    signaler une évidence qui conditionne toute la stratégie."""
    lowered = _BLOCK_ANTICIPATORY.lower()
    assert "n’attend" in lowered or "n'attend" in lowered or "jamais une nouvelle question" in lowered
    assert "stratégie" in lowered


def test_block_sits_in_the_invariant_cached_segment() -> None:
    """Les 17 blocs ``_BLOCK_*`` vivent AVANT le premier point de coupure de
    cache — un bloc qui varierait par utilisateur casserait le cache de tout
    le monde. Même preuve que les blocs voisins (``_BLOCK_ASK_FIRST``,
    ``_BLOCK_CLOSING_QUESTION``)."""
    first_break = BARE.index(CACHE_SEGMENT_BREAK)
    assert BARE.index(_BLOCK_ANTICIPATORY) < first_break
    assert BARE.index(_BLOCK_ASK_FIRST) < BARE.index(_BLOCK_CLOSING_QUESTION) < BARE.index(_BLOCK_ANTICIPATORY) < BARE.index(_BLOCK_FORMAT)


def test_prompt_is_otherwise_unaffected() -> None:
    """Non-régression : le bloc s'ajoute, il ne remplace ni ne déforme un bloc
    voisin déjà couvert par d'autres tests."""
    assert "DEMANDER AVANT DE CHERCHER" in BARE
    assert "TERMINER PAR UNE QUESTION QUI FAIT AVANCER" in BARE
