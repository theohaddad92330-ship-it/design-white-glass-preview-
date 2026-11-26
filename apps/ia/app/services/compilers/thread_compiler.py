"""#2394.7/.8/.10/.11/.12/.13 — le compilateur d'un fil de messagerie pour /chat.

Mesuré le 22/09/2026 (registre `chat-lot3`) : `computeMailThreadPriority` et
`computeMailThreadCommercialState` (NestJS, `mailbox.service.ts:presentThreads`)
calculent DÉJÀ, pour chaque fil rendu par `/internal/copilot/mailbox/search`,
son état unifié, son niveau de priorité, sa raison ET qui a la balle
(« engagement »). `search_mailbox` (chat_tools.py) les JETAIT avant de
répondre au modèle : les ingrédients existaient côté pont, le plat n'existait
pas côté chat.

Ce module ne RECALCULE rien (GA-26, un calcul à un seul endroit) : il projette
tel quel ce que le pont a déjà rendu, et n'ajoute qu'UNE dérivation neuve —
`suggested_action` — absente des deux côtés jusqu'ici.

Doctrine D65 : aucune des clés lues ici ne porte le corps d'un message ;
`test_chat_mailbox_tools.py` tient cette frontière au niveau de l'outil.
"""

from __future__ import annotations

from typing import Any

# #2394.13 — clé stable → action suggérée, dans le MÊME vocabulaire que
# `priorityReason` (mail-priority.ts). Une raison absente ou inconnue ne
# suggère RIEN plutôt qu'une action devinée.
_SUGGESTED_ACTION_BY_REASON: dict[str, str] = {
    "positive_reply_unread": "repondre",
    "positive_reply": "repondre",
    "unread": "lire",
    "awaiting_reply_late": "relancer",
    "awaiting_reply": "attendre",
    "treated": "aucune",
    "irrelevant": "aucune",
    "none": "aucune",
}


def suggest_next_action(priority_reason: str | None) -> str | None:
    """La prochaine action, dérivée de la même raison stable que l'écran
    `/mailbox` (`priorityReason`, `mail-priority.ts`). `None` pour une raison
    absente ou qu'on ne reconnaît pas encore — jamais une action inventée.
    """
    if not isinstance(priority_reason, str):
        return None
    return _SUGGESTED_ACTION_BY_REASON.get(priority_reason)


# #2394.6 — les seules actions suggérées qui valent la peine d'être tracées
# dans le CRM du client : répondre ou relancer. Un fil déjà lu, en attente, ou
# sans action connue ne produit AUCUNE piste — une note qui ne ferait que
# répéter un fil déjà traité serait du bruit, pas un diff.
_WRITEBACK_WORTHY_ACTIONS = frozenset({"repondre", "relancer"})


def suggest_writeback(suggested_action: str | None, account: dict[str, Any] | None) -> dict[str, Any] | None:
    """Le DIFF CRM que le compilateur propose (#2394.6/.19) — jamais un envoi,
    jamais une écriture : `kind` reprend une nature déjà reconnue par
    `CRM_WRITE_KINDS` (`crm-write-request.ts`), la porte d'écriture réelle
    reste `OutboundWriteService`. Dérivé UNIQUEMENT de `suggested_action`
    (lui-même dérivé de `priorityReason`, jamais recalculé ici — GA-26) et de
    la présence d'un compte RÉSOLU : sans compte à qui rattacher la note,
    aucune piste ne se devine.
    """
    if suggested_action not in _WRITEBACK_WORTHY_ACTIONS:
        return None
    if not isinstance(account, dict) or not account.get("id"):
        return None
    return {"kind": "create_note", "reason": suggested_action}


def compile_thread(thread: dict[str, Any]) -> dict[str, Any]:
    """Projette un fil (forme `MailThread` du pont) vers ce que le modèle peut
    recevoir. Les clés déjà calculées par `presentThreads` (compte,
    participants, contact, état, priorité, engagement) sont relayées TELLES
    QUELLES — jamais recalculées ici ; seule `suggested_action` est neuve.
    Une clé absente (API antérieure à son ajout) rend `None`/`[]`, jamais une
    valeur devinée.
    """
    account = thread.get("account") if isinstance(thread.get("account"), dict) else None
    other_participants = thread.get("otherParticipants")
    contact_id = thread.get("contactId")
    priority_reason = thread.get("priorityReason") if isinstance(thread.get("priorityReason"), str) else None
    state = thread.get("state") if isinstance(thread.get("state"), str) else None
    suggested_action = suggest_next_action(priority_reason)

    return {
        "thread_id": thread.get("threadId"),
        "subject": thread.get("subject"),
        "counterpart": thread.get("counterpart"),
        "days_since_last_message": thread.get("daysSinceLastMessage"),
        "awaiting_reply": thread.get("awaitingReply"),
        "unread": thread.get("unread"),
        "has_attachments": thread.get("hasAttachments"),
        # #2394.10 — participants et entreprise, résolus par
        # `withAccountContext` côté NestJS ; jamais devinés ici.
        "other_participants": other_participants if isinstance(other_participants, list) else [],
        "contact_id": contact_id if isinstance(contact_id, str) else None,
        "account": (
            {"id": account.get("id"), "name": account.get("name"), "via": account.get("via")}
            if account
            else None
        ),
        # #2394.12 — l'état unifié et son niveau, calculés par
        # `computeMailThreadPriority` — jamais recalculés ici.
        "state": state,
        "priority_level": thread.get("priorityLevel") if isinstance(thread.get("priorityLevel"), int) else None,
        "priority_reason": priority_reason,
        # #2394.11 — « dernier engagement du fil » : qui a la balle, calculé
        # par `computeMailThreadCommercialState` — jamais une promesse
        # extraite d'un corps que ce module ne lit pas.
        "commercial_state": thread.get("commercialState"),
        # #2394.13 — dérivé de la MÊME raison stable, jamais une seconde source.
        "suggested_action": suggested_action,
        # #2394.6/.19 — le diff CRM suggéré, dérivé de CE MÊME `suggested_action`
        # et du compte déjà résolu — jamais un second calcul (GA-26), jamais un
        # envoi : `null` tant qu'aucun compte n'est connu ou que rien n'est dû.
        "suggested_writeback": suggest_writeback(suggested_action, account),
        # #2394.8 — la preuve : sur quoi la classification s'appuie, pour ne
        # jamais laisser un état se lire comme une affirmation sans base.
        "basis": [
            key
            for key, value in (("state", state), ("priorityReason", priority_reason), ("account", account))
            if value is not None
        ],
    }
