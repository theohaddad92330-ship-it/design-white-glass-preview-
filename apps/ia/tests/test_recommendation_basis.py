"""INSTRUCTION COMMUNE #3249, règle 9 — « Toute recommandation doit indiquer
son fondement : donnée, règle méthodologique, observation, inférence ou
préférence utilisateur. »

Audit (git grep, 29/09/2026) : les dix autres règles de l'instruction commune
étaient déjà tenues ailleurs — ``_BLOCK_METHOD_DISCIPLINE`` (règles 7, 8, 12),
le corpus gouverné ``METHOD_CORPUS_V1`` (règles 1-6, `packages/contracts/src/
schemas/method-corpus.ts`), ``PlayEvidence``/``preuve`` pour le fondement d'un
play (`apps/ia/app/models/outputs/plan.py`). Aucune n'obligeait Laura à NOMMER
laquelle des cinq origines soutient une recommandation donnée en conversation
libre — un texte qui cite son plan sans dire s'il vient d'un fait du dossier,
d'une règle de méthode ou d'un calcul reste aussi peu vérifiable qu'un chiffre
sans source.

Ce que ces tests prouvent — que le prompt PORTE la consigne, mot pour mot, et
que le bloc fait partie du segment INVARIANT (mis en cache, commun à toute
conversation). Que le modèle l'applique est une éval en ligne, hors de portée
d'un test qui n'appelle jamais Claude.
"""

from __future__ import annotations

from app.prompts.bellum_advisor import (
    _BLOCK_ANTICIPATORY,
    _BLOCK_METHOD_DISCIPLINE,
    _BLOCK_RECOMMENDATION_BASIS,
    _BLOCK_RENEWAL_RECOMMENDATION,
    build_system_prompt,
)
from app.services.claude_service import CACHE_SEGMENT_BREAK

#: Un prompt « nu » : tout ce qu'on y trouve vient des blocs constants.
BARE = build_system_prompt({}, {}, "", "")


def test_block_lives_in_the_bare_prompt() -> None:
    """Le bloc ne dépend d'aucun argument : présent même sans profil ni compte."""
    assert _BLOCK_RECOMMENDATION_BASIS in BARE


def test_the_five_origins_are_all_named() -> None:
    """#3249.9 — les cinq origines du texte de l'instruction, verbatim."""
    lowered = _BLOCK_RECOMMENDATION_BASIS.lower()
    for origin in ("donnée", "règle méthodologique", "observation", "inférence", "préférence"):
        assert origin in lowered, f"origine absente : {origin!r}"


def test_the_method_rule_is_applied_without_being_named() -> None:
    """#3249.9 lu avec #3249.12 (déjà tenu par ``_BLOCK_METHOD_DISCIPLINE``) :
    la règle méthodologique se nomme comme origine du raisonnement, jamais en
    citant « SalesConnect » — la discipline de méthode déjà en place est
    référencée, pas répétée."""
    assert "salesconnect" not in _BLOCK_RECOMMENDATION_BASIS.lower()
    assert "5p" not in _BLOCK_RECOMMENDATION_BASIS.lower()


def test_never_invents_a_basis() -> None:
    """Doctrine transversale (jamais de donnée fictive) appliquée au fondement
    lui-même : si aucune des cinq origines ne tient, Laura le dit plutôt que
    d'en inventer une."""
    lowered = _BLOCK_RECOMMENDATION_BASIS.lower()
    assert "jamais" in lowered
    assert "invente" in lowered or "sans inventer" in lowered


def test_block_sits_in_the_invariant_cached_segment() -> None:
    """Les blocs ``_BLOCK_*`` vivent AVANT le premier point de coupure de
    cache — un bloc qui varierait par utilisateur casserait le cache de tout
    le monde. Placé juste après ``_BLOCK_ANTICIPATORY``, dont il complète le
    critère de qualité (règle 6 de #3199 / règle 9 de #3249 sont la même
    exigence : une recommandation nomme sa source)."""
    first_break = BARE.index(CACHE_SEGMENT_BREAK)
    assert BARE.index(_BLOCK_RECOMMENDATION_BASIS) < first_break
    assert (
        BARE.index(_BLOCK_METHOD_DISCIPLINE)
        < BARE.index(_BLOCK_ANTICIPATORY)
        < BARE.index(_BLOCK_RECOMMENDATION_BASIS)
        < BARE.index(_BLOCK_RENEWAL_RECOMMENDATION)
    )


def test_prompt_is_otherwise_unaffected() -> None:
    """Non-régression : le bloc s'ajoute, il ne remplace ni ne déforme un bloc
    voisin déjà couvert par d'autres tests."""
    assert "DISCIPLINE DE MÉTHODE" in BARE
    assert "ANTICIPER DANS UNE RÉPONSE DEMANDÉE" in BARE


def test_the_basis_survives_micro_and_short_density() -> None:
    """#3249 (reste, D02 30/09) — recette prod : « NON PROUVÉ, aucun effet
    visible à l'écran ». Même tension que #3342.7 : sans exception explicite,
    DENSITÉ/MICRO (« commence court », 1-2 phrases) se lit comme une
    autorisation à omettre le fondement — qui n'est alors JAMAIS visible, la
    quasi-totalité des réponses restant courtes."""
    lowered = _BLOCK_RECOMMENDATION_BASIS.lower()
    assert "micro" in lowered
    assert "short" in lowered
    assert "jamais" in lowered


def test_the_basis_lives_in_the_reply_itself_not_a_later_turn() -> None:
    """Le fondement se voit DANS la réponse compressée, jamais reporté à un
    panneau annexe ou un tour suivant — sinon une réponse MICRO ne le montre
    jamais à l'écran."""
    lowered = _BLOCK_RECOMMENDATION_BASIS.lower()
    assert "dans la réponse elle-même" in lowered
    assert "tour suivant" in lowered
