"""#2898 (#2146.13) — le détecteur de contenu, PROUVÉ EN LE CASSANT.

`test_copilote_prompt_blocks.py` verrouille déjà que le PROMPT interdit la
navigation manuelle multi-étapes. Ce fichier verrouille le détecteur
ÉQUIVALENT côté RÉPONSE : le témoin négatif est un texte FAUTIF fabriqué
(exactement la phrase que #2146 a refusée), pas seulement l'absence de faute
sur un texte déjà correct — une garde qui ne trouve jamais rien ne prouve pas
qu'elle saurait trouver.
"""

from __future__ import annotations

from app.services.chat_content_guards import (
    violates_manual_navigation_instruction,
    violates_manual_redirect_instruction,
)

# La phrase EXACTE du retour #2146, celle que le bloc de prompt
# « JAMAIS D'INSTRUCTION DE NAVIGATION MANUELLE » cite pour la refuser
# (`test_2146_13_the_prompt_forbids_a_manual_multi_step_navigation_instruction`).
_FAUTIF = "Va dans Comptes, puis Découvrir, puis sélectionne le compte Thales pour lancer l'analyse."


def test_the_guard_says_NO_on_the_exact_fautif_sentence_from_2146():
    assert violates_manual_navigation_instruction(_FAUTIF) is True


def test_the_guard_says_NO_on_a_two_step_english_instruction():
    assert violates_manual_navigation_instruction("Go to Accounts, then open Discover to filter by industry.") is True


def test_the_guard_does_NOT_catch_a_single_named_screen():
    # Le cas légitime voisin (#2146.13, distinct de #1778) : nommer UN écran
    # isolé reste permis — une garde qui l'attraperait serait désarmée le
    # jour même (même témoin que `test_the_click_guard_does_NOT_catch_a_
    # legitimate_screen_name` côté prompt).
    legitime = "Pour un lot, renvoie vers l'écran Découvrir, qui annonce le coût total avant."
    assert violates_manual_navigation_instruction(legitime) is False


def test_the_guard_does_NOT_catch_a_normal_answer_with_a_comma():
    # Une virgule seule (énumération ordinaire) ne doit pas suffire à
    # déclencher — sinon la garde serait désarmée par le style d'écriture
    # courant de Laura, pas par la règle qu'elle prétend tenir.
    ordinaire = "Le compte Thales a trois contacts actifs, dont un DSI identifié la semaine dernière."
    assert violates_manual_navigation_instruction(ordinaire) is False


def test_the_guard_does_NOT_catch_an_empty_reply():
    assert violates_manual_navigation_instruction("") is False
    assert violates_manual_navigation_instruction(None) is False  # type: ignore[arg-type]


# #3189.4 (LAU-FINAL-195) — le détecteur ÉQUIVALENT, côté réponse, de la règle
# de prompt « FAIS LE TRAVAIL, NE L'ENSEIGNE PAS ». Même discipline de preuve :
# un texte FAUTIF fabriqué, pas seulement l'absence de faute sur un texte
# déjà correct.


def test_the_redirect_guard_says_NO_on_the_exact_fautif_sentence_from_3189():
    assert (
        violates_manual_redirect_instruction(
            "Va sur LinkedIn et tape « Business Manager Sopra » pour trouver les recruteurs."
        )
        is True
    )


def test_the_redirect_guard_says_NO_on_you_can_search():
    assert violates_manual_redirect_instruction("Tu peux rechercher les DSI sur le site de Sopra.") is True


def test_the_redirect_guard_says_NO_on_try_filtering_by():
    assert violates_manual_redirect_instruction("Essaie de filtrer par secteur dans Découvrir.") is True


def test_the_redirect_guard_does_NOT_catch_laura_doing_the_search_herself():
    # Le cas légitime voisin : Laura APPELLE l'outil et rend le résultat —
    # aucune des phrases de délégation n'y figure.
    legitime = "J'ai cherché les décideurs RH chez Sopra : trois contacts identifiés, dont un DRH."
    assert violates_manual_redirect_instruction(legitime) is False


def test_the_redirect_guard_does_NOT_catch_naming_a_single_screen():
    # Témoin voisin avec #2146.13 : nommer Découvrir sans dire « filtre par »
    # reste permis.
    assert violates_manual_redirect_instruction("Pour un lot, renvoie vers l'écran Découvrir.") is False


def test_the_redirect_guard_does_NOT_catch_an_empty_reply():
    assert violates_manual_redirect_instruction("") is False
    assert violates_manual_redirect_instruction(None) is False  # type: ignore[arg-type]


def test_the_redirect_guard_says_NO_on_the_exact_fautif_reply_from_the_29_09_recette():
    # #3189.4 rouvert — la réponse prod (SNCF) : aucune des six formulations
    # d'origine n'y figurait, le détecteur lexical ne la voyait pas.
    fautif = (
        "Tu trouveras les consultations SNCF principalement sur la page officielle "
        "Consultations fournisseurs, ou sur France Marchés et e-marchespublics."
    )
    assert violates_manual_redirect_instruction(fautif) is True
    assert violates_manual_redirect_instruction("Consulte le site de la SNCF pour les avis en cours.") is True


def test_the_redirect_guard_does_NOT_catch_reporting_what_a_page_said():
    # Rendre le CONTENU d'une source n'est pas y renvoyer.
    legitime = "D'après la page Consultations fournisseurs, trois avis sont ouverts, dont un lot cybersécurité."
    assert violates_manual_redirect_instruction(legitime) is False
