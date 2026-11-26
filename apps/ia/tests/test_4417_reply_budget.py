"""#4417.1 (FAIL prod 25/10) — « réponds au dernier mail de X » doit avoir le BUDGET de son chemin.

Le chemin est `search_mailbox` -> `read_mail_thread` -> `prepare_mail_draft` (thread_id) : trois
appels d'outils séquentiels (le `thread_id` du suivant sort du précédent). Un tour simple n'en
donnait que deux : Laura lisait le fil, le tour final forcé n'offrait plus que `offer_reply_options`,
et la réponse était rédigée DANS LE CHAT sans brouillon. Aucun corps de mail ici.
"""

from __future__ import annotations

import pytest

from app.services.chat_tools import CHAT_TOOLS
from app.services.chat_turn_plan import SIMPLE_TURN_PLAN, plan_turn

#: Les outils du chemin, dans l'ordre : le plan doit laisser le temps de TOUS les appeler.
_REPLY_PATH = ("search_mailbox", "read_mail_thread", "prepare_mail_draft")

_REPLY_REQUESTS = (
    "réponds au dernier mail de DHRU Khakhariya",
    "Réponds au dernier mail de jean@acme.com : dis-lui que jeudi 10h me convient.",
    "Reponds a ce mail",
    "reply to the last email from Jane",
)


def test_the_reply_path_exists_in_the_catalog() -> None:
    names = {str(t["name"]) for t in CHAT_TOOLS}
    assert set(_REPLY_PATH) <= names


@pytest.mark.parametrize("request_text", _REPLY_REQUESTS)
def test_a_reply_request_gets_a_round_per_tool_of_the_reply_path(request_text: str) -> None:
    plan = plan_turn(request_text, None)
    assert plan.tool_rounds >= len(_REPLY_PATH)


@pytest.mark.parametrize(
    "request_text",
    (
        "quels sont mes derniers mails non lus ?",
        "bonjour, ça va ?",
        "Prépare-moi un message pour relancer Jean",
    ),
)
def test_a_request_that_is_not_a_reply_keeps_the_plan_of_before(request_text: str) -> None:
    assert plan_turn(request_text, None) == SIMPLE_TURN_PLAN
