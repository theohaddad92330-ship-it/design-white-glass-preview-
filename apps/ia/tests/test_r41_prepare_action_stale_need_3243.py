"""#3243.r41 — « prépare une action sur ARCHI LOGICIEL » (signaux archivés 2020-2022) : « besoin… confirmé » au
lieu de « besoin à confirmer », aucun geste préparé. La formule est posée par le CODE, le geste par défaut forcé."""

from __future__ import annotations

import pytest

from app.services import chat_orchestrator
from app.services.compilers.intent_router import asks_to_prepare_an_action
from app.services.stale_need_formula import apply_stale_need_formula, stale_need_line

ARCHIVED = {
    "recentSignals": [
        {"title": "Refonte de l'architecture logicielle", "date": "2021-03-14", "freshness": "archive"},
        {"title": "Migration SI", "date": "2020-06-01", "freshness": "archive"},
    ]
}
FRESH = {"recentSignals": [{"title": "Appel d'offres", "date": "2026-10-01", "freshness": "recent"}]}


def test_line_names_the_dated_archived_need():
    line = stale_need_line(ARCHIVED)
    assert line is not None
    assert line.startswith("Besoin à confirmer : « Refonte de l'architecture logicielle », daté 2021-03-14")


def test_no_line_without_archived_only_signals():
    assert stale_need_line(FRESH) is None
    assert stale_need_line({}) is None
    assert stale_need_line(None) is None


@pytest.mark.parametrize(
    "wrong", ["Aucun besoin confirmé sur ce compte.", "Le besoin confirmé date de 2021.", "pas de besoin client confirmé"]
)
def test_wrong_phrasing_is_rewritten_to_the_formula(wrong):
    out = apply_stale_need_formula(wrong, stale_need_line(ARCHIVED))
    assert "besoin à confirmer" in out.lower()
    assert "besoin confirmé" not in out.lower()


def test_line_opens_the_reply_when_the_model_omitted_the_formula():
    out = apply_stale_need_formula("Je te prépare un message.", stale_need_line(ARCHIVED))
    assert out.startswith("Besoin à confirmer : ")
    assert out.endswith("Je te prépare un message.")


def test_reply_already_carrying_the_formula_is_untouched():
    reply = "Besoin à confirmer : signal de 2021. Je prépare un message."
    assert apply_stale_need_formula(reply, stale_need_line(ARCHIVED)) == reply


def test_no_line_means_reply_untouched():
    assert apply_stale_need_formula("Aucun besoin confirmé.", None) == "Aucun besoin confirmé."


@pytest.mark.parametrize(
    "message", ["prépare une action sur ARCHI LOGICIEL", "Prépare-moi une action pour ce compte", "prepare an action"]
)
def test_prepare_action_is_detected(message):
    assert asks_to_prepare_an_action(message)


@pytest.mark.parametrize("message", ["prépare un message pour Marc", "Bonjour", "prépare une relance", ""])
def test_prepare_action_says_no_elsewhere(message):
    assert not asks_to_prepare_an_action(message)


def test_default_gesture_reads_contacts_then_prepares_the_message_never_alone():
    tools = [{"name": "get_account_contacts"}, {"name": "prepare_message_for_contact"}]
    ask = "prépare une action sur ARCHI LOGICIEL"
    kw = chat_orchestrator._forced_default_gesture_kwargs
    assert kw(0, ask, tools, account_in_scope=True, called=[]) == {"force_tool": "get_account_contacts"}
    assert kw(1, ask, tools, account_in_scope=True, called=["get_account_contacts"]) == {
        "force_tool": "prepare_message_for_contact"
    }
    assert kw(2, ask, tools, account_in_scope=True, called=["get_account_contacts", "prepare_message_for_contact"]) == {}
    assert kw(0, ask, tools, account_in_scope=False, called=[]) == {}
    assert kw(0, "Bonjour", tools, account_in_scope=True, called=[]) == {}
    assert kw(0, ask, [], account_in_scope=True, called=[]) == {}
