"""#3869.3 (BEL-LAU-1008-018, bêta 08/10) — quand l'approche est demandée, Laura produit le message
ou le discours correspondant dans ce même tour ; elle ne termine jamais par « je peux maintenant
préparer un message »."""

from __future__ import annotations

from app.prompts.commercial_method_turn import approach_preparation_turn_block


def test_unrelated_message_yields_no_block() -> None:
    assert approach_preparation_turn_block("Quel est le SIREN de Thales ?") == ""


def test_message_preparation_request_forces_the_tool_now() -> None:
    block = approach_preparation_turn_block("Prépare-moi un message pour ce contact")
    assert "PRÉPARES MAINTENANT" in block
    assert "prepare_message_for_contact" in block
    assert "prepare_mail_draft" in block


def test_never_ends_on_an_offer_to_prepare_it_later() -> None:
    block = approach_preparation_turn_block("Rédige le message pour Martin")
    assert "je peux maintenant préparer un message" in block
    assert "pas promise pour la suivante" in block


def test_no_invented_contact_when_none_can_be_identified() -> None:
    block = approach_preparation_turn_block("Prépare l'approche pour ce compte")
    assert "search_workspace_contacts" in block
    assert "tu n'improvises jamais un nom" in block


def test_preparing_never_claims_the_message_was_sent() -> None:
    block = approach_preparation_turn_block("Écris un message pour ce contact")
    assert "préparer le message n'envoie rien" in block
    assert "jamais qu'un message est parti par la seule préparation" in block


def test_cold_call_marker_does_not_trigger_the_message_block() -> None:
    """Le canal téléphone reste celui de `cold_call_turn_block` — les deux ne se chevauchent pas."""
    assert approach_preparation_turn_block("Prépare-moi un appel à froid pour Martin, DSI") == ""


# #3869.3 — recette prod 11/10 : « approche demandée non préparée … je pourrai poursuivre au prochain
# tour ». Le déclencheur ne tient plus à une liste de libellés exacts : un verbe de préparation à côté
# d'un objet d'approche (n'importe quel ordre de mots, n'importe quel pluriel) suffit.
def test_composed_request_with_search_then_preparation_triggers() -> None:
    message = "Trouve les décideurs Data chez Sanofi puis prépare-leur une approche personnalisée"
    assert "PRÉPARES MAINTENANT" in approach_preparation_turn_block(message)


def test_verb_object_pair_triggers_without_the_exact_phrase() -> None:
    for message in (
        "Rédige-moi une accroche pour Tarik",
        "Peux-tu écrire un premier mail à ces deux personnes ?",
        "Génère un brouillon de relance pour Julia",
        "Prépare les messages d'approche pour chaque contact",
        "Draft an outreach email to the head of procurement",
    ):
        assert "PRÉPARES MAINTENANT" in approach_preparation_turn_block(message), message


# #3894.1 (recette prod 14/10, Renault) — « prépare un message pour Glauco Gomes et Adrien Weber »
# rendait deux brouillons collés dans le texte et une seule carte Contacts, jamais deux cartes
# message : chaque destinataire NOMMÉ doit recevoir sa propre carte.
def test_several_named_recipients_require_one_card_each() -> None:
    block = approach_preparation_turn_block("Prépare un message pour Glauco Gomes et Adrien Weber")
    assert "CHAQUE destinataire reçoit sa PROPRE carte" in block
    assert "prepare_message_for_contact` une fois PAR destinataire nommé" in block
    assert "jamais une carte `contact_list` (« Contacts »)" in block


def test_a_question_about_messages_does_not_trigger() -> None:
    assert approach_preparation_turn_block("Combien de messages ai-je envoyés cette semaine ?") == ""
    assert approach_preparation_turn_block("Pourquoi le ton du message diffère selon les rôles ?") == ""


def test_a_blocked_preparation_still_delivers_and_names_the_blocker() -> None:
    block = approach_preparation_turn_block("Prépare une approche pour le responsable achats")
    assert "Si l'outil de préparation échoue" in block
    assert "texte de l'approche dans cette réponse" in block
    assert "prochain tour" in block  # nommé comme formule interdite


# #3869 (recette prod 13/10, Sanofi) — « Trouve les décideurs Data et achats IT puis prépare-leur une
# approche » : la réponse listait les contacts Data, proposait la recherche achats IT « préparée, non
# exécutée » et AUCUN brouillon. Le brouillon part dans le MÊME tour pour les décideurs DÉJÀ connus ;
# la recherche payante reste une proposition.
def test_composed_request_drafts_for_known_contacts_while_paid_search_stays_a_proposal() -> None:
    block = approach_preparation_turn_block(
        "Trouve les décideurs Data et achats IT puis prépare-leur une approche"
    )
    assert "DÉJÀ connus" in block
    assert "recherche payante" in block
    assert "ne débites jamais" in block
    assert "nom à confirmer" in block
    assert "n'attends pas" in block
