"""#1914 — la consigne qui fait écrire des CARTES à Laura.

Le rendu web sait afficher huit formes (verdict, classement de comptes, liste de
contacts, comparaison, plan d'action, shortlist de consultants, brief de
rendez-vous, donnée manquante). Sans consigne, le modèle n'en écrirait aucune :
c'est le défaut que `test_advisor_structured_reply.py` a déjà payé pour
« Objectif / Angle d'accroche / Cas d'usage » — une carte que personne ne
demande n'apparaît jamais.

Ce que ces tests tiennent — la RÈGLE, pas la formulation :
  1. la consigne est dans le prompt, dans le segment INVARIANT (mis en cache) ;
  2. elle nomme chaque type et la clôture que le parseur lit ;
  3. elle ne licencie ni donnée inventée, ni probabilité, ni « 0 » pour un
     inconnu, ni lien hors de l'application ;
  4. elle borne les cartes aux réponses dont la forme s'y prête ;
  5. chaque exemple qu'elle MONTRE est lui-même un bloc valide — un prompt qui
     enseigne une forme refusée ferait tomber chaque carte en repli texte.
"""

from __future__ import annotations

import json
import re

from app.models.reply_blocks import REPLY_BLOCK_TYPES, validate_reply_block
from app.prompts.bellum_advisor import build_system_prompt
from app.prompts.reply_formats import REPLY_FORMATS_DIRECTIVE
from app.services.claude_service import CACHE_SEGMENT_BREAK
from app.services.reply_blocks import REPLY_BLOCK_FENCE


def _invariant_segment() -> str:
    return build_system_prompt({}, {}, "", "").split(CACHE_SEGMENT_BREAK)[0]


def test_the_directive_lives_in_the_invariant_segment_of_the_prompt() -> None:
    assert REPLY_FORMATS_DIRECTIVE in _invariant_segment()


def test_it_is_present_even_without_any_context() -> None:
    assert REPLY_FORMATS_DIRECTIVE in build_system_prompt({}, {}, "", "", "")


def test_the_directive_names_every_block_type_and_the_fence() -> None:
    for block_type in REPLY_BLOCK_TYPES:
        assert re.search(rf"\b{block_type}\b", REPLY_FORMATS_DIRECTIVE), f"type absent de la consigne : {block_type}"
    assert f"```{REPLY_BLOCK_FENCE}" in REPLY_FORMATS_DIRECTIVE


def test_every_example_the_directive_shows_is_a_valid_block() -> None:
    examples = re.findall(rf"```{REPLY_BLOCK_FENCE}\n(.*?)\n```", REPLY_FORMATS_DIRECTIVE, flags=re.S)
    assert examples, "la consigne ne montre aucun exemple — le modèle devinerait la forme"
    for raw in examples:
        assert validate_reply_block(json.loads(raw)) is not None, raw


def test_an_unknown_field_is_absent_never_filled() -> None:
    lowered = REPLY_FORMATS_DIRECTIVE.lower()
    assert "absent" in lowered
    assert "invente" in lowered


def test_a_not_measured_cell_is_null_never_zero() -> None:
    assert "null" in REPLY_FORMATS_DIRECTIVE
    assert "jamais 0" in REPLY_FORMATS_DIRECTIVE


def test_a_card_never_carries_a_probability_and_a_ranking_names_its_axes() -> None:
    lowered = REPLY_FORMATS_DIRECTIVE.lower()
    assert "probabilité" in lowered
    assert "axes" in REPLY_FORMATS_DIRECTIVE
    assert "not_evaluated" in REPLY_FORMATS_DIRECTIVE


def test_links_stay_inside_the_application() -> None:
    assert "href" in REPLY_FORMATS_DIRECTIVE
    assert "MONTRER LE CHEMIN" in REPLY_FORMATS_DIRECTIVE


def test_cards_are_bounded_to_answers_whose_shape_fits() -> None:
    lowered = REPLY_FORMATS_DIRECTIVE.lower()
    assert "aucune carte" in lowered
    assert "deux cartes au plus" in lowered


def test_the_model_is_never_asked_for_a_website() -> None:
    """#1914.13 — le logo d'une carte vient du compte ENREGISTRÉ (sa fiche), jamais
    d'un site écrit par le modèle : un domaine inventé afficherait le logo d'une
    autre société. Un champ que l'écran ne lit pas ne se demande pas."""
    assert "website" not in REPLY_FORMATS_DIRECTIVE


def test_a_card_is_introduced_by_text_never_alone() -> None:
    assert "phrase" in REPLY_FORMATS_DIRECTIVE.lower()


def test_3771_a_card_never_makes_a_weak_answer_look_stronger() -> None:
    """#3771 (BEL-LAU-1018) — la forme ne remplace pas le fond : la consigne le dit."""
    assert "PAS PLUS DE CARTES QUE DE FOND" in REPLY_FORMATS_DIRECTIVE
    assert "un seul compte comme un classement" in REPLY_FORMATS_DIRECTIVE


def test_2433_5_an_image_table_cell_marked_vide_becomes_null_never_zero_in_a_card() -> None:
    """#2433.5 — `claude_service._IMAGE_TEXT_SYSTEM_PROMPT` nomme explicitement une
    cellule vide d'un tableau photographié « (vide) » (jamais un zéro, voir sa propre
    consigne). Sans un pont écrit ICI, rien n'empêche l'écrivain de la carte de relire
    cette marque et d'écrire quand même 0 dans `comparison`/`file_export` — la règle
    générique (« null, jamais 0 ») ne nomme pas cette marque précise, donc ne la couvre
    pas à coup sûr. La consigne doit dire, explicitement, que « (vide) » devient null."""
    assert "(vide)" in REPLY_FORMATS_DIRECTIVE
    # La phrase doit relier la marque au null, pas seulement les citer séparément.
    vide_index = REPLY_FORMATS_DIRECTIVE.index("(vide)")
    window = REPLY_FORMATS_DIRECTIVE[vide_index : vide_index + 200]
    assert "null" in window
    assert "jamais 0" in window or "jamais un 0" in window
