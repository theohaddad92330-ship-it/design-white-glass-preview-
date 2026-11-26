"""#2394.7/.8/.10/.11/.12/.13 — le compilateur d'un fil de messagerie pour /chat.

Mesuré le 22/09/2026 (registre `chat-lot3`) : `computeMailThreadPriority` et
`computeMailThreadCommercialState` (NestJS, `mailbox.service.ts:presentThreads`)
calculent déjà l'état d'un fil, son niveau de priorité, sa raison ET qui a la
balle — pour CHAQUE fil rendu par `/internal/copilot/mailbox/search`. Mais le
handler `search_mailbox` de `chat_tools.py` les JETAIT avant de répondre au
modèle : les ingrédients existaient côté pont, le plat n'existait pas côté
chat. Ce module ne RECALCULE rien (GA-26) — il projette ce que le pont a déjà
rendu, plus UNE dérivation neuve (`suggested_action`), absente des deux côtés.

Doctrine D65 : aucune des clés lues ici ne porte le corps d'un message.
"""

from __future__ import annotations

from app.services.compilers.thread_compiler import compile_thread, suggest_next_action, suggest_writeback


def test_suggest_next_action_maps_known_reasons() -> None:
    assert suggest_next_action("awaiting_reply_late") == "relancer"
    assert suggest_next_action("unread") == "lire"
    assert suggest_next_action("positive_reply_unread") == "repondre"
    assert suggest_next_action("positive_reply") == "repondre"
    assert suggest_next_action("awaiting_reply") == "attendre"
    assert suggest_next_action("treated") == "aucune"
    assert suggest_next_action("irrelevant") == "aucune"
    assert suggest_next_action("none") == "aucune"


def test_suggest_next_action_never_guesses_an_unknown_reason() -> None:
    # Une raison qui n'existe pas (encore) ne doit jamais produire une action
    # inventée — c'est la même prudence que le reste du catalogue.
    assert suggest_next_action("un-nouveau-cas-jamais-vu") is None
    assert suggest_next_action(None) is None


def test_compile_thread_relays_account_and_participants_already_resolved() -> None:
    # #2394.10 — résolu par `withAccountContext` côté NestJS, jamais deviné ici.
    thread = {
        "threadId": "t1",
        "subject": "Proposition",
        "counterpart": "jean@acme.com",
        "daysSinceLastMessage": 12,
        "awaitingReply": True,
        "unread": False,
        "hasAttachments": True,
        "otherParticipants": ["marie@acme.com"],
        "contactId": "contact-1",
        "account": {"id": "acc-1", "name": "ACME", "via": "domain"},
        "state": "awaiting_reply",
        "priorityLevel": 4,
        "priorityReason": "awaiting_reply_late",
        "commercialState": "waiting_on_them",
    }
    compiled = compile_thread(thread)
    assert compiled["other_participants"] == ["marie@acme.com"]
    assert compiled["contact_id"] == "contact-1"
    assert compiled["account"] == {"id": "acc-1", "name": "ACME", "via": "domain"}


def test_compile_thread_relays_state_and_derives_the_next_action() -> None:
    # #2394.12 — l'état unifié, relayé tel quel.
    # #2394.13 — la prochaine action, dérivée de la MÊME raison stable.
    thread = {
        "threadId": "t2",
        "subject": None,
        "counterpart": None,
        "daysSinceLastMessage": None,
        "awaitingReply": False,
        "unread": True,
        "hasAttachments": False,
        "state": "unread",
        "priorityLevel": 3,
        "priorityReason": "unread",
        "commercialState": None,
    }
    compiled = compile_thread(thread)
    assert compiled["state"] == "unread"
    assert compiled["priority_level"] == 3
    assert compiled["priority_reason"] == "unread"
    assert compiled["suggested_action"] == "lire"


def test_compile_thread_relays_who_has_the_ball() -> None:
    # #2394.11 — « dernier engagement du fil » : qui a la balle, jamais une
    # promesse extraite d'un corps qu'on ne lit pas.
    thread = {
        "threadId": "t3",
        "subject": "Relance",
        "counterpart": "jean@acme.com",
        "daysSinceLastMessage": 2,
        "awaitingReply": False,
        "unread": False,
        "hasAttachments": False,
        "commercialState": "waiting_on_me",
    }
    compiled = compile_thread(thread)
    assert compiled["commercial_state"] == "waiting_on_me"


def test_compile_thread_never_invents_missing_fields() -> None:
    # Un fil d'avant ces champs (API plus ancienne) ne doit jamais faire
    # planter la projection ni inventer une valeur.
    thread = {
        "threadId": "t4",
        "subject": "x",
        "counterpart": "a@b.com",
        "daysSinceLastMessage": 1,
        "awaitingReply": False,
        "unread": False,
        "hasAttachments": False,
    }
    compiled = compile_thread(thread)
    assert compiled["account"] is None
    assert compiled["other_participants"] == []
    assert compiled["contact_id"] is None
    assert compiled["state"] is None
    assert compiled["suggested_action"] is None


def test_suggest_writeback_proposes_a_note_when_a_reply_is_owed_and_an_account_is_known() -> None:
    # #2394.6 — le compilateur produit un DIFF CRM (ici : la nature « note »
    # que `CRM_WRITE_KINDS` reconnaît déjà, `crm-write-request.ts`), jamais un
    # envoi — la porte d'écriture reste celle de `OutboundWriteService`.
    assert suggest_writeback("repondre", {"id": "acc-1", "name": "ACME", "via": "domain"}) == {
        "kind": "create_note",
        "reason": "repondre",
    }
    assert suggest_writeback("relancer", {"id": "acc-1", "name": "ACME", "via": "domain"}) == {
        "kind": "create_note",
        "reason": "relancer",
    }


def test_suggest_writeback_never_guesses_without_an_account() -> None:
    # Aucun compte résolu ⇒ rien à écrire nulle part — pas de CRM diff deviné.
    assert suggest_writeback("repondre", None) is None
    assert suggest_writeback("repondre", {"name": "ACME"}) is None


def test_suggest_writeback_stays_silent_when_nothing_is_owed() -> None:
    # « lire », « attendre », « aucune » et une raison inconnue ne proposent
    # RIEN — une note qui répéterait un fil déjà traité ne serait qu'un bruit.
    account = {"id": "acc-1", "name": "ACME", "via": "domain"}
    assert suggest_writeback("lire", account) is None
    assert suggest_writeback("attendre", account) is None
    assert suggest_writeback("aucune", account) is None
    assert suggest_writeback(None, account) is None


def test_compile_thread_carries_the_suggested_writeback() -> None:
    # #2394.6/.19 — la clé neuve, dérivée de `suggested_action` + `account`
    # déjà projetés par ce même module — jamais un second calcul (GA-26).
    thread = {
        "threadId": "t6",
        "subject": "Relance",
        "counterpart": "jean@acme.com",
        "daysSinceLastMessage": 9,
        "awaitingReply": True,
        "unread": False,
        "hasAttachments": False,
        "account": {"id": "acc-3", "name": "Gamma", "via": "domain"},
        "priorityReason": "awaiting_reply_late",
    }
    compiled = compile_thread(thread)
    assert compiled["suggested_writeback"] == {"kind": "create_note", "reason": "relancer"}


def test_compile_thread_writeback_is_absent_without_an_account() -> None:
    thread = {
        "threadId": "t7",
        "subject": "Relance",
        "counterpart": "jean@acme.com",
        "daysSinceLastMessage": 9,
        "awaitingReply": True,
        "unread": False,
        "hasAttachments": False,
        "priorityReason": "awaiting_reply_late",
    }
    compiled = compile_thread(thread)
    assert compiled["suggested_writeback"] is None


def test_compile_thread_names_its_basis_as_proof() -> None:
    # #2394.8 — une preuve : sur quoi la classification s'appuie, jamais un
    # état affirmé sans base nommée.
    thread = {
        "threadId": "t5",
        "subject": "x",
        "counterpart": "a@b.com",
        "daysSinceLastMessage": 1,
        "awaitingReply": False,
        "unread": False,
        "hasAttachments": False,
        "state": "read",
        "priorityReason": "none",
        "account": {"id": "acc-2", "name": "Beta", "via": "contact"},
    }
    compiled = compile_thread(thread)
    assert set(compiled["basis"]) == {"state", "priorityReason", "account"}
