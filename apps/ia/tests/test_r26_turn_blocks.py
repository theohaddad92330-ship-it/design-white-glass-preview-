"""R26 (15/10) — consignes de tour : projets d'un compte (#3889), relance des derniers contacts vus
(#3894), approche sans hypothèse non sourcée (#4060), complétion signaux + besoins (#4055)."""

from __future__ import annotations

from app.prompts.commercial_method_turn import (
    account_completion_turn_block,
    account_projects_turn_block,
    approach_preparation_turn_block,
    recent_contacts_follow_up_turn_block,
)


def test_projects_block_reads_needs_history_documents_and_missions() -> None:
    block = account_projects_turn_block("Chez Servier, distingue besoins ouverts, anciens besoins et missions en cours")
    for tool in ("find_needs", "include_closed", "account_id", "account_overview", "search_document_projects"):
        assert tool in block
    assert "« Non vérifié » ne s'écrit QUE" in block
    # #3889 (R32) — les missions viennent du MÊME passage : plus d'outil séparé pour elles.
    assert "get_account_preflight" not in block
    assert account_projects_turn_block("Quel est le SIREN de Servier ?") == ""


def test_follow_up_block_orders_by_last_interaction_and_one_card_each() -> None:
    block = recent_contacts_follow_up_turn_block(
        "Prépare une relance pour les 2 derniers contacts que j'ai vus chez EDF"
    )
    assert "date de dernière interaction" in block
    assert "PLUS RÉCENTS" in block and "PREMIERS de la liste" in block
    assert "une carte PAR destinataire" in block
    assert "Suite à notre échange" in block and "interaction tracée" in block
    assert recent_contacts_follow_up_turn_block("Prépare une relance pour Adrien Weber") == ""


def test_approach_block_forbids_unsourced_topics_and_incoherent_consultants() -> None:
    block = approach_preparation_turn_block("Prépare un message d'approche directe pour la DSI de Servier")
    assert "deuxième sujet" in block and "fait sourcé" in block
    assert "consultant" in block and "même lecture" in block
    assert "Suite à notre échange" in block


def test_completion_block_also_covers_signals_and_needs() -> None:
    block = account_completion_turn_block("Complète ce qui me manque sur Servier, il est dans mon CRM")
    assert "signaux" in block and "besoins" in block
    assert "get_account_signals" in block and "find_needs" in block


# #3894 (recette R37, 16/10) — « relance les 2 derniers contacts » : canal redemandé, UN seul contact en carte.
def test_follow_up_block_renders_contact_list_of_n_and_never_asks_the_channel() -> None:
    block = recent_contacts_follow_up_turn_block("relance les 2 derniers contacts")
    assert "carte `contact_list`" in block and "les N contacts retenus" in block
    assert "dernière ouverture de fiche" in block
    assert "e-mail" in block and "ne redemande JAMAIS le canal" in block
    # Les N contacts retenus sont NOMMÉS : l'audience (`contact_ids`) est explicite, pas « un seul contact ».
    assert "`contact_ids`" in block
    assert "n'envoie rien" in block.lower() or "Préparer n'envoie rien" in block
