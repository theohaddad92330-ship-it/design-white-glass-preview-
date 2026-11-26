"""#3905.5/.6 (18/10) — « des comptes dans <secteur> » : cascade espace → API branchées → web en dernier."""

from __future__ import annotations

from app.services import chat_accounts_cascade as cascade
from app.services import chat_orchestrator

ASK = "Trouve-moi des comptes dans l'industrie"
TOOLS = [{"name": "search_workspace_accounts"}, {"name": "find_accounts"}, {"name": "web_search"}]


def _names(tools):
    return [t["name"] for t in tools]


def test_round_zero_forces_the_workspace_accounts_first():
    assert chat_orchestrator._forced_find_accounts_kwargs(0, ASK, TOOLS) == {"force_tool": "search_workspace_accounts"}
    assert chat_orchestrator._forced_find_accounts_kwargs(1, ASK, TOOLS) == {}


def test_without_the_workspace_tool_the_next_step_is_forced_never_the_web():
    tools = [{"name": "find_accounts"}, {"name": "web_search"}]
    assert chat_orchestrator._forced_find_accounts_kwargs(0, ASK, tools) == {"force_tool": "find_accounts"}
    assert chat_orchestrator._forced_find_accounts_kwargs(0, ASK, [{"name": "web_search"}]) == {}


def test_the_web_never_comes_before_the_accounts():
    # Le test sait dire NON : si le web passait avant les comptes, ce catalogue le contiendrait.
    assert "web_search" not in _names(cascade.tools_for_round(ASK, [], TOOLS))
    assert "web_search" not in _names(cascade.tools_for_round(ASK, ["search_workspace_accounts"], TOOLS))
    assert "web_search" not in _names(cascade.tools_for_round(ASK, ["find_accounts"], TOOLS))


def test_the_web_is_the_last_resort_once_both_steps_were_tried():
    called = ["search_workspace_accounts", "find_accounts"]
    assert "web_search" in _names(cascade.tools_for_round(ASK, called, TOOLS))


def test_another_request_keeps_its_catalogue_untouched():
    assert cascade.tools_for_round("Quelles actualités sur Renault ?", [], TOOLS) is TOOLS


# ---- #4288.1 (#3905.5) — chaque compte rendu dit d'où il vient, la réponse annonce l'ordre suivi ----


def test_each_workspace_account_carries_its_origin_in_clear():
    out = cascade.tag_origin("search_workspace_accounts", {"accounts": [{"name": "Nordia"}, {"name": "Axiom"}]})
    assert [a["origin"] for a in out["accounts"]] == ["déjà dans ton espace"] * 2
    assert out["origin_order"] == "d'abord dans ton espace (2 comptes)"


def test_registry_results_split_between_workspace_and_public_registry():
    out = cascade.tag_origin(
        "run_account_search", {"items": [{"name": "Nordia", "account_id": "a-1"}, {"name": "Axiom", "siren": "123"}]}
    )
    assert [i["origin"] for i in out["items"]] == ["déjà dans ton espace", "registre public"]


def test_a_web_result_is_named_found_on_the_web():
    assert cascade.tag_origin("web_search", {"results": []})["origin"] == "trouvé sur le web"


def test_never_names_a_provider_and_leaves_other_tools_and_errors_untouched():
    out = cascade.tag_origin("run_account_search", {"items": [{"name": "X", "siren": "1"}]})
    blob = str(out).lower()
    assert not any(p in blob for p in ("pappers", "apollo", "brave", "firecrawl", "insee"))
    other = {"anything": 1}
    assert cascade.tag_origin("get_account_signals", other) == other
    err = {"error": "boom", "accounts": [{"name": "X"}]}
    assert cascade.tag_origin("search_workspace_accounts", err) == err


# ---- #4288.1 (#3905.5) — l'ANNONCE de l'ordre est verrouillée au niveau de la réponse finale ----

ACTIONS = [{"tool": "search_workspace_accounts", "status": "done"}]


def test_the_reply_announces_the_order_when_the_model_forgot():
    out = cascade.announce_order("Voici 3 comptes.", ASK, ACTIONS)
    assert out.startswith(cascade.ORDER_SENTENCE)
    assert out.endswith("Voici 3 comptes.")


def test_the_announcement_is_never_doubled():
    said = f"{cascade.ORDER_SENTENCE}\n\nVoici 3 comptes."
    assert cascade.announce_order(said, ASK, ACTIONS) == said


def test_no_announcement_without_a_cascade_step_or_for_another_request():
    assert cascade.announce_order("Voici.", ASK, [{"tool": "get_account_signals", "status": "done"}]) == "Voici."
    assert cascade.announce_order("Voici.", "Quelles actualités sur Renault ?", ACTIONS) == "Voici."
    assert cascade.announce_order("Voici.", ASK, [{"tool": "search_workspace_accounts", "status": "error"}]) == "Voici."
    assert cascade.announce_order("", ASK, ACTIONS) == ""
