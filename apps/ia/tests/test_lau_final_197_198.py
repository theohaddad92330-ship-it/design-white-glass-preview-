"""LAU-FINAL-197 (#3191, CONVERSATIONAL EDITORIAL POLICY) et LAU-FINAL-198
(#3192, RESPONSE DENSITY CONTROLLER) — retours bêta du 28/09/2026, lot
``feat/lau-197-198-28-09``.

Chaque test verrouille UN point numéroté du retour, pas la formulation exacte
du prompt (elle vivra) : voir le commentaire du commit et le corps de l'issue
pour la correspondance ``#33xx.k``.
"""

from __future__ import annotations

from app.prompts.bellum_advisor import _BLOCK_FORMAT, _BLOCK_LAURA, build_system_prompt
from app.prompts.forbidden_phrasings import (
    COPILOT_FORBIDDEN_BEHAVIOURS,
    COPILOT_FORBIDDEN_PHRASINGS,
    DECORATIVE_EMOJI,
    RECAP_TITLE_NAMES_THE_ESN,
)
from app.prompts.reply_lexicon import AVOIDED_TERMS, BLOCK_REPLY_LEXICON, PREFERRED_TERMS

BARE = build_system_prompt({}, {}, "", "")


# ── #3191 — LAU-FINAL-197 : CONVERSATIONAL EDITORIAL POLICY ─────────────────


def test_3191_1_direct_answer_first_is_stated():
    assert "RÉPONSE DIRECTE D'ABORD" in _BLOCK_FORMAT
    assert "jamais un intitulé avant la réponse elle-même" in _BLOCK_FORMAT


def test_3191_2_structure_adaptative_covers_the_four_shapes():
    assert "STRUCTURE ADAPTATIVE" in _BLOCK_FORMAT
    assert "QUESTION SIMPLE" in _BLOCK_FORMAT
    assert "une à quatre phrases, sans titre ni section" in _BLOCK_FORMAT
    # Le CONSEIL / la carte verdict restent le gabarit de décision, déjà
    # couverts par ailleurs (`test_copilote_prompt_blocks.py`) : ce test ne
    # vérifie que la nouveauté, l'interdiction de la répétition par réflexe.
    assert "jamais par habitude" in _BLOCK_FORMAT


def test_3191_3_meta_phrasings_already_banned_are_still_there():
    # Déjà là avant ce lot (#1922.15/.17/.18) : preuve d'antériorité.
    for phrase in ("d'après tes données", "je vois que", "selon mon analyse"):
        assert phrase in COPILOT_FORBIDDEN_PHRASINGS


def test_3191_3_impersonal_hedge_is_now_banned():
    assert "il conviendrait de" in COPILOT_FORBIDDEN_PHRASINGS
    assert "il conviendrait de" in BARE


def test_3191_3_decorative_emoji_and_esn_named_recap_are_behaviours():
    assert DECORATIVE_EMOJI in COPILOT_FORBIDDEN_BEHAVIOURS
    assert RECAP_TITLE_NAMES_THE_ESN in COPILOT_FORBIDDEN_BEHAVIOURS
    assert DECORATIVE_EMOJI.upper() in _BLOCK_LAURA
    assert RECAP_TITLE_NAMES_THE_ESN.upper() in _BLOCK_LAURA


def test_3191_4_bullet_rules_state_the_five_bullet_ceiling():
    assert "PUCES" in _BLOCK_FORMAT
    assert "Cinq puces visibles au plus" in _BLOCK_FORMAT
    assert "aucune ponctuation finale" in _BLOCK_FORMAT


def test_3191_5_tone_names_the_eight_adjectives_and_cross_references():
    for adjective in ("direct", "calme", "intelligent", "assumé", "précis"):
        assert adjective in _BLOCK_LAURA
    assert "jamais arrogant" in _BLOCK_LAURA
    assert "capable de dire non" in _BLOCK_LAURA


def test_3191_6_lexicon_block_has_both_registers():
    for term in PREFERRED_TERMS:
        assert term in BLOCK_REPLY_LEXICON
    for term in AVOIDED_TERMS:
        assert term in BLOCK_REPLY_LEXICON
    assert BLOCK_REPLY_LEXICON in BARE


def test_3191_7_in_text_citation_is_limited_to_determining_claims():
    assert "TU NE CITES QUE CE QUI JUSTIFIE UNE AFFIRMATION DÉTERMINANTE" in BARE


def test_3191_8_no_go_capstone_is_written():
    assert "reconnaître, à la seule FORME de ta réponse" in _BLOCK_FORMAT


# ── #3192 — LAU-FINAL-198 : RESPONSE DENSITY CONTROLLER ─────────────────────


def test_3192_2_the_four_levels_are_named():
    assert "NIVEAU DE RÉPONSE" in _BLOCK_FORMAT
    for level in ("MICRO :", "SHORT :", "DÉCISION :", "DEEP :"):
        assert level in _BLOCK_FORMAT


def test_3192_3_the_level_criteria_are_named_not_a_single_default():
    line = next(line for line in _BLOCK_FORMAT.splitlines() if line.startswith("NIVEAU DE RÉPONSE"))
    for criterion in (
        "demande explicite",
        "complexité",
        "risque",
        "nombre d'objets",
        "sources en jeu",
        "besoin d'action",
        "préférence de réponse",
        "historique de cette conversation",
    ):
        assert criterion in line
    assert "jamais un niveau par défaut appliqué à tout" in line


def test_3192_4_rules_forbid_repeating_the_previous_turn():
    line = next(line for line in _BLOCK_FORMAT.splitlines() if line.startswith("NIVEAU DE RÉPONSE"))
    assert "voir le détail" in line
    assert "ne répètes pas une limite ou un pan du profil déjà donnés au tour précédent" in line
    assert "ne récites jamais toutes les données collectées" in line


def test_3192_5_and_3192_7_reply_preferences_never_change_the_substance():
    # Déjà là (#1928.10) : reply_preferences.py::_FOOTER. Preuve d'antériorité
    # pour ces deux points du retour LAU-FINAL-198.
    from app.prompts.reply_preferences import reply_preferences_block

    block = reply_preferences_block({"replyLength": "short"})
    assert "ne suspendent AUCUNE règle" in block
    assert "la hiérarchie de vérité et les interdits restent entiers" in block


def test_4445_2_account_list_is_one_bullet_per_account_with_attributes_on_the_same_line():
    # #4445.2 — une liste de comptes aplatie (nom, puis taille / zone / priorité / raison en puces
    # au même niveau) venait de la consigne PUCES, muette sur ce cas.
    assert "un compte par puce" in _BLOCK_FORMAT
    assert "attributs sur la même ligne" in _BLOCK_FORMAT
    assert "account_ranking" in _BLOCK_FORMAT.split("un compte par puce")[1][:300]
