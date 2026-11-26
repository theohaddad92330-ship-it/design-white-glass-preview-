"""#3390.10/.11 + #3390.9b — Laura lit la méthode retenue par le moteur serveur.

Le moteur (`chooseCommercialMethod`, contrats TS) choisit ; l'API rend le texte
(`renderLauraCommercialMethodContext`) ; ce module vérifie que le prompt le
porte tel quel, qu'il reste byte-identique sans lui, et qu'il ne nomme aucun
fournisseur ni ne fabrique de seuil.
"""

from __future__ import annotations

import re

import pytest

from app.prompts.bellum_advisor import build_system_prompt
from tests.test_copilote_prompt_blocks import FORBIDDEN_VENDORS

_PROFILE = {"esn_name": "Skaizen"}
_ACCOUNT = {"company_name": "TF1", "sector": "Média"}

#: Sortie réelle de `renderLauraCommercialMethodContext` (contrats) pour un GO avec charge.
_RENDERED = (
    "MÉTHODE COMMERCIALE RETENUE POUR SON BESOIN OUVERT (choisie par Bellum à partir du verdict, avant tout "
    "message — c'est la MÊME que celle affichée sur l'écran des besoins : recommande celle-ci, n'en propose pas "
    "une autre) :\n"
    "- Niveau d'effort : Sprint court\n"
    "- Route d'ouverture : Approche directe ciblée\n"
    "- Action suivante : Constituer la shortlist\n"
    "Sa charge, à NOMMER à côté de la méthode comme une information (mesurée ou déclarée par lui) :\n"
    "- Sa capacité déclarée : 12 h par semaine\n"
    "- Ses actions en retard : 4\n"
    "Aucun seuil de saturation n'existe : ne conclus pas à une saturation et ne change pas la méthode à cause de "
    "ces chiffres."
)


def _prompt(**kwargs: str) -> str:
    return build_system_prompt(_PROFILE, _ACCOUNT, "contacts", "plan", **kwargs)


def test_absent_context_leaves_the_prompt_byte_identical() -> None:
    assert _prompt(commercial_method_context="") == _prompt()
    assert _prompt(commercial_method_context="   \n") == _prompt()


def test_method_block_reaches_the_prompt_verbatim() -> None:
    prompt = _prompt(commercial_method_context=_RENDERED)
    assert _RENDERED in prompt
    assert "Niveau d'effort : Sprint court" in prompt
    assert "12 h par semaine" in prompt


def test_the_block_is_bounded() -> None:
    prompt = _prompt(commercial_method_context="X" * 5000)
    assert "X" * 1500 in prompt
    assert "X" * 1501 not in prompt


def test_no_saturation_threshold_is_invented() -> None:
    prompt = _prompt(commercial_method_context=_RENDERED)
    assert "ne conclus pas à une saturation" in prompt
    assert "ne conclus pas à une saturation" not in _prompt()


@pytest.mark.parametrize("vendor", FORBIDDEN_VENDORS)
def test_no_vendor_name_comes_with_the_method_block(vendor: str) -> None:
    # Le bloc lui-même (le reste du prompt est gardé par test_copilote_prompt_blocks).
    assert not re.search(rf"\b{re.escape(vendor)}\b", _RENDERED, flags=re.IGNORECASE)


def test_approach_question_turn_opens_with_the_method_block_3390_10() -> None:
    """Recette prod 04/10 : « Quelle approche pour ce compte ? » — le tour porte la consigne
    d'ouvrir par le bloc Méthode ; sans méthode lue ou autre question, rien."""
    from app.prompts.commercial_method_turn import method_turn_block

    block = method_turn_block(_RENDERED, "Quelle approche pour ce compte ?")
    assert "BLOC MÉTHODE" in block and "NOMME" in block
    assert method_turn_block("", "Quelle approche pour ce compte ?") == ""
    assert method_turn_block(_RENDERED, "Quel est le SIREN de Thales ?") == ""



def test_method_block_is_a_distinct_titled_block_with_named_effort_3390_10() -> None:
    """Recette Z3 04/10 : la réponse ouvrait sur « Méthode : … » EN LIGNE. La consigne donne le
    format d'un BLOC (titre + puces) rempli depuis le bloc serveur, niveau d'effort nommé."""
    from app.prompts.commercial_method_turn import method_turn_block

    block = method_turn_block(_RENDERED, "Quelle approche pour ce compte ?")
    assert "**Méthode**\n- Niveau d'effort : Sprint court\n- Route d'ouverture : Approche directe ciblée" in block
    assert "- Action suivante : Constituer la shortlist" in block
    assert "jamais une phrase « Méthode : … » en ligne" in block
    assert "effort non défini" in block  # la règle, pas la valeur ici
    assert "- Niveau d'effort : effort non défini" not in block


def test_method_block_without_effort_says_not_defined_never_invents_3390_10() -> None:
    from app.prompts.commercial_method_turn import method_turn_block

    no_effort = "MÉTHODE COMMERCIALE RETENUE :\n- Route d'ouverture : Approche directe ciblée"
    fr = method_turn_block(no_effort, "Quelle approche pour ce compte ?")
    assert "- Niveau d'effort : effort non défini" in fr
    assert "Sprint" not in fr
    en = method_turn_block(no_effort, "Which approach for this account?", english=True)
    assert "**Method**\n- Effort level : effort not defined" in en


def test_cold_call_turn_takes_closest_contact_instead_of_failing_3443() -> None:
    """Recette Z3 04/10 : fiche « Director », demande « DSI » ⇒ « je n'ai pas pu générer le
    dialogue ». La consigne impose le contact le plus proche, nommé, et la carte."""
    from app.prompts.commercial_method_turn import cold_call_turn_block

    block = cold_call_turn_block("Prépare-moi un appel à froid pour Martin, DSI")
    assert "n'est PAS un motif d'échec" in block
    assert "le plus proche" in block and "NOMMES" in block
    assert "next_questions" in block and "expected_outcome" in block  # tous les champs requis d'emblée
    assert "LEQUEL" in block  # les homonymes restent une question
    assert cold_call_turn_block("Quel est le SIREN de Thales ?") == ""


def test_opening_word_follows_the_measured_verdict_3215() -> None:
    """Recette Z3 04/10 : « Oui, tu peux ouvrir… » puis verdict « Pas maintenant »."""
    prompt = _prompt()
    assert "L'OUVERTURE SUIT LE VERDICT MESURÉ" in prompt
    assert "« Non, pas maintenant »" in prompt
    assert "Un « Oui » suivi d'un « mais le verdict est" in prompt
