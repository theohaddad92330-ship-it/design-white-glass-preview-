"""#2955 (#2394.57, décision Louis 28/09) — l'ÉTAT DE CONVERSATION qui permet
de vérifier le destinataire d'un brouillon « en réponse » SANS une nouvelle
méthode de lecture de la messagerie.

`search_mailbox` rend déjà `counterpart`/`otherParticipants` par fil, publics
à l'écran de messagerie — ce module ne fait que les PROJETER dans
`context.mail_threads` (`mail_thread_hints`), et les FUSIONNER d'un appel
d'outil à l'autre pendant le tour (`merge_mail_thread_hints`). Jamais le corps
d'un message (D65), jamais une nouvelle lecture réseau.
"""

from __future__ import annotations

from app.prompts.context_transparency import merge_mail_thread_hints
from app.services.chat_tools import mail_thread_hints


def test_mail_thread_hints_projects_participants_from_search_mailbox() -> None:
    output = {
        "provider": "google",
        "intent": "free",
        "resolvedQuery": "q",
        "truncated": False,
        "threads": [
            {
                "threadId": "th-1",
                "counterpart": "jean@acme.com",
                "otherParticipants": ["marie@acme.com"],
            },
            {
                "threadId": "th-2",
                "counterpart": None,
                "otherParticipants": [],
            },
        ],
    }
    assert mail_thread_hints("search_mailbox", output) == [
        {"thread_id": "th-1", "participants": ["jean@acme.com", "marie@acme.com"]},
    ]


def test_mail_thread_hints_ignores_every_other_tool() -> None:
    # Le NOM de l'outil décide, pas la forme du résultat — un autre outil qui
    # aurait accidentellement une clé `threads` ne doit rien produire.
    assert mail_thread_hints("get_account_briefing", {"threads": [{"threadId": "t"}]}) == []


def test_mail_thread_hints_returns_nothing_on_an_errored_tool() -> None:
    # Un outil en erreur n'a rien lu — même garde que `cited_sources`.
    assert mail_thread_hints("search_mailbox", {"error": "panne fournisseur"}) == []


def test_mail_thread_hints_drops_a_thread_without_any_known_participant() -> None:
    output = {"threads": [{"threadId": "th-solo", "counterpart": None, "otherParticipants": []}]}
    assert mail_thread_hints("search_mailbox", output) == []


def test_mail_thread_hints_never_invents_an_id_for_a_malformed_entry() -> None:
    output = {"threads": [{"counterpart": "jean@acme.com", "otherParticipants": []}, "not-a-dict"]}
    assert mail_thread_hints("search_mailbox", output) == []


def test_merge_mail_thread_hints_deduplicates_by_thread_id_latest_wins() -> None:
    existing = [{"thread_id": "th-1", "participants": ["jean@acme.com"]}]
    extra = [{"thread_id": "th-1", "participants": ["jean@acme.com", "marie@acme.com"]}]
    assert merge_mail_thread_hints(existing, extra) == [
        {"thread_id": "th-1", "participants": ["jean@acme.com", "marie@acme.com"]},
    ]


def test_merge_mail_thread_hints_keeps_distinct_threads_side_by_side() -> None:
    existing = [{"thread_id": "th-1", "participants": ["jean@acme.com"]}]
    extra = [{"thread_id": "th-2", "participants": ["marie@acme.com"]}]
    assert merge_mail_thread_hints(existing, extra) == [
        {"thread_id": "th-1", "participants": ["jean@acme.com"]},
        {"thread_id": "th-2", "participants": ["marie@acme.com"]},
    ]


def test_merge_mail_thread_hints_drops_malformed_entries_instead_of_keeping_them_empty() -> None:
    assert merge_mail_thread_hints(None, [{"thread_id": "", "participants": ["jean@acme.com"]}]) == []
    assert merge_mail_thread_hints(None, [{"thread_id": "th-1", "participants": []}]) == []
    assert merge_mail_thread_hints(None, ["not-a-dict"]) == []


def test_merge_mail_thread_hints_on_nothing_returns_an_empty_list() -> None:
    assert merge_mail_thread_hints(None, None) == []
