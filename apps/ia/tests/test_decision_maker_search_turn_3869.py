"""#3869.1 (recette prod 14/10, Renault R4a) — « décideurs achats puis approche » nommait
Glauco Gomes (Head of IT) comme « pas un décideur achats », sans nom inventé, mais ne proposait
AUCUNE carte de recherche de personnes. Quand aucun décideur achats n'est confirmé, Laura doit
proposer `propose_people_search` dans cette même réponse, jamais une offre en texte seul."""

from __future__ import annotations

from app.prompts.commercial_method_turn import decision_maker_search_turn_block


def test_unrelated_message_yields_no_block() -> None:
    assert decision_maker_search_turn_block("Quel est le SIREN de Thales ?") == ""


def test_decideur_achats_triggers_the_block() -> None:
    block = decision_maker_search_turn_block("Trouve les décideurs achats chez Renault puis prépare-leur une approche")
    assert "propose_people_search" in block
    assert "jamais un nom inventé" in block
    assert "tu ne clos JAMAIS sur une offre en texte seul" in block


def test_other_orderings_and_roles_also_trigger() -> None:
    for message in (
        "Qui est le responsable achats chez Renault ?",
        "Trouve-moi le directeur des achats de ce compte",
        "Identifie l'acheteur IT chez Renault",
        "Find the procurement decision maker at Renault",
    ):
        assert decision_maker_search_turn_block(message) != "", message


def test_unrelated_role_search_does_not_trigger() -> None:
    """Chercher un décideur HORS achats (DSI, RH…) relève d'autres blocs, pas celui-ci."""
    assert decision_maker_search_turn_block("Trouve le DSI chez Renault") == ""


def test_never_lets_another_function_pass_for_the_buying_role() -> None:
    block = decision_maker_search_turn_block("Qui sont les décideurs achats chez Renault ?")
    assert "jamais un contact d'une autre fonction présenté comme le décideur achats" in block


def test_the_card_never_bills_without_a_gesture() -> None:
    block = decision_maker_search_turn_block("Trouve les décideurs achats chez Renault")
    assert "elle ne débite rien sans un geste de la personne" in block


# #3869 (recette R20 15/10) — la réponse à la question de périmètre (« RENAULT SAS ») ne contient plus
# la demande : sans le fil, aucun bloc ne se posait et Laura finissait sur « je peux continuer par une
# recherche ». La demande d'origine est relue dans le dernier message utilisateur du fil.
from app.prompts.commercial_method_turn import approach_preparation_turn_block, thread_aware_request  # noqa: E402

_HISTORY = [
    {"role": "user", "content": "décideurs achats Renault + approche"},
    {"role": "assistant", "content": "Quel périmètre : RENAULT SAS ou ARQUUS ?"},
]


def test_short_scope_answer_inherits_the_original_request() -> None:
    request = thread_aware_request("RENAULT SAS", _HISTORY)
    assert "decideurs achats" in request.lower() or "décideurs achats" in request.lower()
    assert "propose_people_search" in decision_maker_search_turn_block(request)
    assert approach_preparation_turn_block(request) != ""


def test_scope_answer_block_cites_known_contacts_and_offers_the_card() -> None:
    block = decision_maker_search_turn_block(thread_aware_request("RENAULT SAS", _HISTORY))
    assert "D'ABORD la base" in block
    assert "carte" in block


def test_long_new_question_does_not_inherit_the_old_request() -> None:
    message = "Quel est le chiffre d'affaires de Thales sur les trois dernières années et son évolution ?"
    assert thread_aware_request(message, _HISTORY) == message
    assert thread_aware_request("RENAULT SAS", []) == "RENAULT SAS"
