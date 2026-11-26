"""V4-CORRECTIFS 4288.1 (#3905.5) — la réponse de Laura DIT l'ordre suivi et où elle s'est arrêtée.

Recette prod 20/10 : les comptes rendus disaient leur origine, mais l'ordre espace → registre → web n'était pas
annoncé. Chaque étape de la cascade rend maintenant sa propre clause (avec SON compte, jamais un chiffre deviné) ;
le prompt demande UNE ligne composée de ces clauses, dans l'ordre des étapes réellement appelées.
"""

from __future__ import annotations

from app.prompts.bellum_advisor import build_system_prompt
from app.services import chat_accounts_cascade as cascade

PROVIDERS = ("pappers", "apollo", "brave", "firecrawl", "insee", "sirene")


def test_workspace_step_names_itself_with_its_own_count() -> None:
    out = cascade.tag_origin("search_workspace_accounts", {"accounts": [{"name": "Nordia"}, {"name": "Axiom"}]})
    assert out["origin_order"] == "d'abord dans ton espace (2 comptes)"


def test_registry_step_counts_only_the_registry_rows_not_the_workspace_ones() -> None:
    items = [{"name": "A", "account_id": "a-1"}, {"name": "B", "siren": "1"}, {"name": "C", "siren": "2"}]
    out = cascade.tag_origin("run_account_search", {"items": items})
    assert out["origin_order"] == "puis dans les registres publics (2 comptes)"


def test_web_step_is_the_last_resort_and_counts_its_results() -> None:
    out = cascade.tag_origin("web_search", {"results": [{"title": "x"}]})
    assert out["origin_order"] == "en dernier recours sur le web (1 résultat)"


def test_an_empty_step_says_so_it_never_reads_as_a_skipped_one() -> None:
    assert "aucun compte" in cascade.tag_origin("search_workspace_accounts", {"accounts": []})["origin_order"]
    assert "aucun compte" in cascade.tag_origin("run_account_search", {"items": []})["origin_order"]
    assert "aucun résultat" in cascade.tag_origin("web_search", {"results": []})["origin_order"]


def test_a_web_result_without_a_list_claims_no_count() -> None:
    # Pas de liste lisible : « non mesuré » n'est jamais « 0 » — la clause ne porte alors aucun nombre.
    clause = cascade.tag_origin("web_search", {"summary": "x"})["origin_order"]
    assert clause == "en dernier recours sur le web"


def test_no_clause_names_a_provider() -> None:
    blob = str(
        [
            cascade.tag_origin("search_workspace_accounts", {"accounts": [{"name": "X"}]}),
            cascade.tag_origin("run_account_search", {"items": [{"name": "X", "siren": "1"}]}),
            cascade.tag_origin("web_search", {"results": [{"title": "X"}]}),
        ]
    ).lower()
    assert not any(p in blob for p in PROVIDERS)


def test_the_prompt_asks_for_one_line_with_the_order_and_where_it_stopped() -> None:
    out = build_system_prompt({}, {}, "", "")
    start = out.index("RECHERCHE DIRECTE (#3707)")
    block = out[start : out.index("\n\n", start)]
    assert "#4288.1" in block
    assert "origin_order" in block
    assert "où tu t'es arrêtée" in block
    assert "J'ai d'abord cherché dans ton espace" in block


def test_announce_order_does_not_repeat_an_order_line_the_reply_already_carries() -> None:
    said = "Voici 3 comptes, d'abord dans ton espace (3 comptes), puis dans les registres publics (aucun compte)."
    actions = [{"tool": "search_workspace_accounts", "status": "done"}]
    asked = "Trouve-moi des comptes dans l'industrie"
    assert cascade.announce_order(said, asked, actions) == said
