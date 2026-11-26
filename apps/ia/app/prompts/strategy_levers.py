"""Output-size levers for BELLUM-STRATEGY (#274) — OFF by default.

``bellum_strategy`` is the biggest output-token post of a run. #274 wants to
shrink it *without* losing commercial quality, and the DoD forbids shipping any
reduction before an A/B proves ``quality >= baseline``. So the levers live here,
as **configuration**, and every one of them is a no-op unless explicitly turned
on:

======================  ===========================  ==================================
Env var                 Default (= production)       Effect when set
======================  ===========================  ==================================
``STRATEGY_CONCISION``  ``""`` / ``off`` → no-op     appends a concision block to the
                                                     system prompt
``STRATEGY_SCHEMA``     ``full`` → no-op             ``tight`` trims the JSON-schema
                                                     annotations in the user prompt
======================  ===========================  ==================================

With both at their defaults, :func:`concision_block` returns ``""`` and
:func:`apply_schema_mode` returns its argument unchanged — the rendered prompts
stay **byte-identical** to production, which is what keeps
``tests/golden/user/strategy.txt`` and the prompt-registry fingerprint green.

The A/B harness (``app.eval.strategy``) drives these via the environment so a
variant is a *config value*, never a code edit.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

# ── concision lever ───────────────────────────────────────────────────────────

CONCISION_OFF = "off"
CONCISION_ON = "on"
CONCISION_STRICT = "strict"

_CONCISION_MODES = (CONCISION_OFF, CONCISION_ON, CONCISION_STRICT)

# Appended to the SYSTEM prompt. Targets verbosity only: it caps prose length and
# forbids restating the sources, but never removes a required field or lowers a
# minimum count — a lever that drops content would trade tokens for quality,
# which is exactly what the A/B must not silently do.
_CONCISION_ON_BLOCK = """

===== CONCISION (budget de sortie) =====
Tu produis un livrable DENSE, pas un rapport. Respecte les minimas du schema mais
NE LES DEPASSE PAS : si le schema dit "MIN 4, viser 5", produis 4 elements, pas 8.
- Zero reformulation : ne repete jamais dans un champ ce qu'un autre champ dit deja.
- Zero paraphrase des sources : tu cites un fait, tu ne le resumes pas deux fois.
- Chaque champ texte tient dans la longueur annoncee par le schema (2 phrases = 2 phrases).
- Pas de preambule, pas de conclusion, pas de meta-commentaire sur ta demarche.
La densite d'information par token est un critere de qualite, pas la longueur."""

_CONCISION_STRICT_BLOCK = """

===== CONCISION STRICTE (budget de sortie) =====
Tu produis un livrable DENSE, pas un rapport. Produis EXACTEMENT le minimum du
schema (jamais le "viser") et tiens chaque champ texte sous sa longueur annoncee.
- Zero reformulation, zero paraphrase des sources, zero meta-commentaire.
- Phrases courtes, sans adverbe de remplissage ni formule de politesse.
- Un champ qui n'apporte pas d'information NOUVELLE doit rester court, pas etre etoffe.
La densite d'information par token est un critere de qualite, pas la longueur."""

_CONCISION_BLOCKS = {
    CONCISION_OFF: "",
    CONCISION_ON: _CONCISION_ON_BLOCK,
    CONCISION_STRICT: _CONCISION_STRICT_BLOCK,
}


def concision_mode(env: dict[str, str] | None = None) -> str:
    """Current concision mode — ``off`` unless ``STRATEGY_CONCISION`` says otherwise."""
    raw = (env or os.environ).get("STRATEGY_CONCISION", "").strip().lower()
    if not raw:
        return CONCISION_OFF
    if raw not in _CONCISION_MODES:
        logger.error(
            "STRATEGY_CONCISION=%r is not one of %s — falling back to %r (production behaviour)",
            raw, _CONCISION_MODES, CONCISION_OFF,
        )
        return CONCISION_OFF
    return raw


def concision_block(env: dict[str, str] | None = None) -> str:
    """Text to append to the strategy SYSTEM prompt. ``""`` on the default path."""
    return _CONCISION_BLOCKS[concision_mode(env)]


# ── tight-schema lever ────────────────────────────────────────────────────────

SCHEMA_FULL = "full"
SCHEMA_TIGHT = "tight"

_SCHEMA_MODES = (SCHEMA_FULL, SCHEMA_TIGHT)

# Explicit, surgical rewrites applied to the user prompt's JSON-schema block when
# ``STRATEGY_SCHEMA=tight``. Expressed as (before, after) pairs rather than a
# second copy of the schema so the two modes can never drift apart:
# ``test_tight_schema_substitutions_all_match`` asserts every ``before`` still
# occurs verbatim in the live prompt, so a schema edit that invalidates a pair
# fails the suite instead of silently no-op'ing the lever.
TIGHT_SCHEMA_SUBSTITUTIONS: tuple[tuple[str, str], ...] = (
    # Cap the "aim higher" counts at their minimum — the single biggest driver of
    # output length (5 challenges + 5 pains + 5 questions + 4 objections of prose).
    ('"(MIN 4, viser 5) Pour chaque defi', '"(EXACTEMENT 4) Pour chaque defi'),
    ('"(MIN 4, viser 5) Pour chaque pain', '"(EXACTEMENT 4) Pour chaque pain'),
    (
        '"(MIN 4, viser 5) Questions de soutenance',
        '"(EXACTEMENT 4) Questions de soutenance',
    ),
    ('"(MIN 3, viser 4) OBJECTIONS PLAUSIBLES', '"(EXACTEMENT 3) OBJECTIONS PLAUSIBLES'),
    ('"(2-4) LA LOGIQUE DE SELECTION', '"(EXACTEMENT 2) LA LOGIQUE DE SELECTION'),
    # Trim the longest per-field prose budgets.
    (
        '"description": "2 phrases : contexte + pourquoi probleme maintenant"',
        '"description": "1 phrase : pourquoi c\'est un probleme maintenant"',
    ),
    (
        '"realConcern": "VRAI enjeu cache (1-2 phrases d\'analyse)"',
        '"realConcern": "VRAI enjeu cache (1 phrase)"',
    ),
    (
        '"response": "2-3 phrases, methode VALIDER -> REBONDIR par une question ouverte -> preuve/reference"',
        '"response": "2 phrases max, methode VALIDER -> REBONDIR -> preuve/reference"',
    ),
    (
        '"commentOuvrirCompte": "Strategie globale d\'ouverture en 3-4 phrases : porte d\'entree, premier message/action, multi-threading, livrables."',
        '"commentOuvrirCompte": "Strategie globale d\'ouverture en 2 phrases : porte d\'entree + premier pas."',
    ),
    (
        '"bridges": ["(2-3) phrases de transition',
        '"bridges": ["(EXACTEMENT 2) phrases de transition',
    ),
    (
        '"storyFrames": ["(2-3) mini-histoires',
        '"storyFrames": ["(EXACTEMENT 2) mini-histoires',
    ),
)


def schema_mode(env: dict[str, str] | None = None) -> str:
    """Current schema mode — ``full`` unless ``STRATEGY_SCHEMA`` says otherwise."""
    raw = (env or os.environ).get("STRATEGY_SCHEMA", "").strip().lower()
    if not raw:
        return SCHEMA_FULL
    if raw not in _SCHEMA_MODES:
        logger.error(
            "STRATEGY_SCHEMA=%r is not one of %s — falling back to %r (production behaviour)",
            raw, _SCHEMA_MODES, SCHEMA_FULL,
        )
        return SCHEMA_FULL
    return raw


def apply_schema_mode(prompt: str, env: dict[str, str] | None = None) -> str:
    """Return ``prompt`` unchanged (``full``) or with the tight rewrites applied.

    A substitution whose ``before`` no longer matches is logged and skipped: the
    lever degrades to "less tight", never to a corrupted prompt.
    """
    if schema_mode(env) == SCHEMA_FULL:
        return prompt
    out = prompt
    for before, after in TIGHT_SCHEMA_SUBSTITUTIONS:
        if before not in out:
            logger.error(
                "STRATEGY_SCHEMA=tight: substitution no longer matches the prompt (%.60r…) — skipped",
                before,
            )
            continue
        out = out.replace(before, after)
    return out
