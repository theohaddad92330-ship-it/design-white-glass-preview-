"""Ownership-scoped Supabase fetches for the per-account IA routers.

These routers run with the service-role key (RLS bypass), so a plain
``.eq("id", account_id)`` returns ANY tenant's row — a cross-tenant IDOR / PII
leak. Fetch scoped to the caller's ``user_id`` and 404 on a miss so one tenant
can never read or mutate another's account/contact. Defence in depth behind the
internal-auth gate (a caller with the internal secret still can't impersonate a
user_id it doesn't own).
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException


def _raise_if_read_failed(res: Any, kind: str) -> None:
    """#3418 — un ÉCHEC de lecture n'est pas une absence. `SupabaseREST` rend
    ``data=None`` + ``error`` quand PostgREST répond 4xx/5xx (colonne inconnue,
    base indisponible) ; le lire comme « pas à toi » faisait dire « Ce contact est
    introuvable » devant une fiche pourtant ouverte. 503 : le proxy l'écrit comme
    un service indisponible, jamais comme une fiche disparue."""
    if res is not None and getattr(res, "error", None):
        raise HTTPException(status_code=503, detail=f"{kind} read failed")


async def fetch_owned_account(
    sb: Any, account_id: str, user_id: str, columns: str = "*", workspace_id: str | None = None
) -> dict:
    """Return the account iff it belongs to ``user_id``; 404 otherwise. Uses the
    non-blocking ``aexecute`` so the Supabase round-trip doesn't freeze the loop.

    #4609.2 — ``workspace_id`` : même élargissement à l'espace que {@link fetch_owned_contact} (le compte d'un
    contact de collègue). Sans lui, la portée reste ``user_id``."""
    if not user_id or not account_id:
        raise HTTPException(status_code=404, detail="Account not found")
    query = sb.table("accounts").select(columns).eq("id", account_id)
    query = query.eq("workspace_id", workspace_id) if workspace_id else query.eq("user_id", user_id)
    res = await query.maybe_single().aexecute()
    _raise_if_read_failed(res, "Account")
    account = getattr(res, "data", None) if res is not None else None
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


async def fetch_owned_contact(
    sb: Any, contact_id: str, user_id: str, columns: str = "*", workspace_id: str | None = None
) -> dict:
    """Return the contact iff it belongs to ``user_id``; 404 otherwise.

    #4609.2 — ``workspace_id`` élargit la portée à TOUT l'espace : l'API lit les contacts par espace
    (`workspaceScopeWhere`), la fiche d'un collègue s'ouvre donc côté écran, et le moteur la refusait (404 lu
    « Ce contact est introuvable »). Un contact d'un AUTRE espace reste refusé. Sans ``workspace_id``
    (résolution échouée), la portée reste ``user_id`` — comportement identique à l'octet."""
    if not user_id or not contact_id:
        raise HTTPException(status_code=404, detail="Contact not found")
    query = sb.table("contacts").select(columns).eq("id", contact_id)
    query = query.eq("workspace_id", workspace_id) if workspace_id else query.eq("user_id", user_id)
    res = await query.maybe_single().aexecute()
    _raise_if_read_failed(res, "Contact")
    contact = getattr(res, "data", None) if res is not None else None
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    return contact


async def fetch_contact_stop(sb: Any, contact_id: str) -> dict | None:
    """BEL-SC-235 (#3264.13) — le refus de CETTE personne (« ne me contactez
    plus »), ou ``None`` s'il n'y en a pas.

    ``contact_stops`` (append-only, `contact_id` unique — ``apps/api/src/
    database/entities/contact-stop.entity.ts``) n'a pas de colonne `user_id` :
    ce n'est pas un trou d'ownership, la ligne qui appelle cette fonction a
    déjà prouvé via {@link fetch_owned_contact} que `contact_id` appartient au
    caller — inutile de re-scoper une deuxième fois ce que la ligne
    précédente a déjà vérifié."""
    if not contact_id:
        return None
    res = await sb.table("contact_stops").select("reason").eq("contact_id", contact_id).maybe_single().aexecute()
    return getattr(res, "data", None) if res is not None else None


#: #3211 (LAU-FINAL-217) — un message SORTI (envoyé ou délivré) sur le MÊME
#: canal, sans réponse ni rebond, reste un doublon tant que rien de nouveau ne
#: le justifie. `replied`/`bounced`/`failed`/`cancelled`/`expired` n'entrent
#: pas dans cette liste : une réponse rouvre la conversation, un rebond est un
#: problème de coordonnée (pas une relance identique), les autres n'ont jamais
#: atteint le contact. Tranché sans Louis : ni le corps de l'issue ni la
#: doctrine ne fixent cette liste — c'est la lecture la plus proche de
#: l'exemple Bernard (« deux emails sans réponse »).
OUTREACH_DUPLICATE_ASK_STATUSES = ("sent", "delivered")


async def fetch_recent_outreach_for_contact(
    sb: Any, contact_id: str, user_id: str, channel: str, workspace_id: str | None = None
) -> dict | None:
    """Le dernier message SORTI (voir {@link OUTREACH_DUPLICATE_ASK_STATUSES})
    préparé pour ce contact sur ce canal, ``None`` si aucun. Sert à
    `prepare_message_for_contact` (#3211) pour refuser une relance identique
    plutôt que d'en proposer une troisième silencieuse.

    #3211.6 (épopée #3234) — ``workspace_id`` élargit la portée à TOUT
    l'espace (un collègue a pu l'envoyer), plutôt que ``user_id`` seul :
    `outreach_messages.workspace_id` est désormais stampé par tout chemin
    d'écriture (`agent_docs/multi-user-workspaces.md`, Phase 2 finalisée) — la
    ligne qui bloquait cette extension dans les lots précédents (« contacts/
    outreach_messages scopés au seul user_id ») n'est plus vraie. `user_id`
    reste sélectionné pour que l'appelant distingue SA relance (l'angle
    nouveau l'efface) d'un envoi d'un COLLÈGUE (rien ne l'efface, #3264.14 même
    posture). Sans ``workspace_id`` (résolution échouée), on retombe sur
    l'ancien scope par `user_id` — comportement identique à l'octet."""
    if not user_id or not contact_id or not channel:
        return None
    query = (
        sb.table("outreach_messages")
        .select("id, channel, status, reason, created_at, user_id")
        .eq("contact_id", contact_id)
        .eq("channel", channel)
        .in_("status", list(OUTREACH_DUPLICATE_ASK_STATUSES))
    )
    query = query.eq("workspace_id", workspace_id) if workspace_id else query.eq("user_id", user_id)
    res = await query.order("created_at", ascending=False).limit(1).aexecute()
    rows = getattr(res, "data", None) if res is not None else None
    return rows[0] if rows else None


#: #3894 — relance dans contact_list (Louis 16/10) : ce que la carte contacts dit de la relance d'une personne.
#: ``sent`` = un message enregistré « envoyé/délivré » ; ``prepared`` = un brouillon préparé (pas parti). Un rebond,
#: un échec, une annulation ne sont NI l'un NI l'autre : ils ne font aucune ligne (on n'affiche pas ce qu'on n'a pas).
FOLLOW_UP_SENT_STATUSES = ("sent", "delivered", "replied")
FOLLOW_UP_PREPARED_STATUSES = ("drafted", "needs_review", "approved", "scheduled")


async def fetch_follow_ups_by_contact(
    sb: Any, contact_ids: list[str], user_id: str, workspace_id: str | None = None
) -> dict[str, dict[str, str]]:
    """Par contact, le dernier envoi (``sent``) ou, à défaut d'envoi, la dernière relance préparée
    (``prepared``) lus dans ``outreach_messages`` — même table, même portée (espace, sinon ``user_id``) que
    {@link fetch_recent_outreach_for_contact}, UNE requête pour toute la liste. Un contact sans trace est ABSENT du
    résultat (jamais « 0 », jamais un statut deviné) ; une date illisible écarte la ligne. Un envoi l'emporte sur
    un brouillon plus récent : « dernier envoi » est la donnée que le commercial cherche, le brouillon se nomme
    seulement quand rien n'est parti."""
    ids = [c for c in dict.fromkeys(contact_ids) if c]
    if not ids or not user_id:
        return {}
    query = (
        sb.table("outreach_messages")
        .select("contact_id, channel, status, created_at")
        .in_("contact_id", ids)
        .in_("status", list(FOLLOW_UP_SENT_STATUSES + FOLLOW_UP_PREPARED_STATUSES))
    )
    query = query.eq("workspace_id", workspace_id) if workspace_id else query.eq("user_id", user_id)
    res = await query.order("created_at", ascending=False).aexecute()
    rows = getattr(res, "data", None) if res is not None else None
    out: dict[str, dict[str, str]] = {}
    for row in rows if isinstance(rows, list) else []:
        contact_id = str(row.get("contact_id") or "")
        day = str(row.get("created_at") or "")[:10]
        status = row.get("status")
        if not contact_id or len(day) != 10 or day[4] != "-" or day[7] != "-":
            continue
        if status in FOLLOW_UP_SENT_STATUSES:
            kind = "sent"
        elif status in FOLLOW_UP_PREPARED_STATUSES:
            kind = "prepared"
        else:
            continue  # rebond, échec, annulation… : ni envoi ni préparation
        if contact_id in out and (out[contact_id]["kind"] == "sent" or kind == "prepared"):
            continue  # lignes triées du plus récent au plus ancien : on garde le premier envoi, sinon le premier brouillon
        channel = str(row.get("channel") or "").strip()
        out[contact_id] = {"kind": kind, **({"channel": channel} if channel else {}), "as_of": day}
    return out


#: #3265.10 (épopée #3265, lot R11 29/09) — une action DÉJÀ PLANIFIÉE (ouverte,
#: `todo`) ou DÉJÀ FAITE (`done`) reste un doublon tant que rien de nouveau ne
#: la justifie — même lecture que {@link OUTREACH_DUPLICATE_ASK_STATUSES},
#: portée cette fois sur le PLAN (`action_plan_items`) plutôt que sur
#: l'historique d'envoi (`outreach_messages`) : #3265.9 a fermé la porte
#: MANUELLE (`createFromPlan`), ce point ferme la même porte côté PROACTIF.
#: `snoozed`/`prepared`/`obsolete` n'entrent pas : un report ou une action
#: devenue obsolète ne bloque pas une nouvelle proposition.
ACTION_PLAN_ITEM_DUPLICATE_ASK_STATUSES = ("todo", "done")


async def fetch_recent_action_plan_item_for_contact(
    sb: Any, contact_id: str, user_id: str, channel: str
) -> dict | None:
    """La dernière action du PLAN (voir {@link ACTION_PLAN_ITEM_DUPLICATE_ASK_STATUSES})
    déjà ouverte ou déjà faite pour ce contact sur ce canal, ``None`` si aucune.
    Sert à `prepare_message_for_contact` (#3265.10) pour refuser une relance
    déjà couverte par le plan plutôt que d'en proposer une seconde qui l'ignore —
    `fetch_recent_outreach_for_contact` juste au-dessus ne voit que ce qui est
    RÉELLEMENT SORTI, pas ce qui est déjà PLANIFIÉ."""
    if not user_id or not contact_id or not channel:
        return None
    res = (
        await sb.table("action_plan_items")
        .select("id, channel, execution_status, reason, due_date, created_at")
        .eq("contact_id", contact_id)
        .eq("user_id", user_id)
        .eq("channel", channel)
        .in_("execution_status", list(ACTION_PLAN_ITEM_DUPLICATE_ASK_STATUSES))
        .order("created_at", ascending=False)
        .limit(1)
        .aexecute()
    )
    rows = getattr(res, "data", None) if res is not None else None
    return rows[0] if rows else None


async def fetch_orientation_actions(sb: Any, user_id: str, limit: int = 5) -> list[dict]:
    """#3265.12 (épopée #3287) — les dernières actions FAITES de cet utilisateur
    dont l'issue déclarée est ``orientation_given`` (« Bernard m'a orienté vers
    Delphine ») ET qui portent un ``result`` non vide.

    Le nom du nouveau contact n'est pas extrait ici : il vit dans le texte
    déclaratif ``result``, rendu tel quel — l'extraire par heuristique serait
    deviner. Une réorientation sans texte ne fait AUCUNE ligne (on n'affiche pas
    ce qu'on n'a pas). Lève si la lecture échoue : l'appelant DIT l'échec plutôt
    que de rendre une liste vide qui se lirait « rien à suivre »."""
    if not user_id:
        return []
    res = (
        await sb.table("action_plan_items")
        .select("id, contact_id, account_id, result, completed_at, channel")
        .eq("user_id", user_id)
        .eq("execution_status", "done")
        .eq("outcome", "orientation_given")
        .order("completed_at", ascending=False)
        .limit(max(limit, 1) * 3)
        .aexecute()
    )
    rows = getattr(res, "data", None) if res is not None else None
    kept = [r for r in (rows or []) if str(r.get("result") or "").strip()]
    return kept[:limit]


#: #3211.1 (extension, #3234) / #3211.9 — le dernier rappel POSÉ (`schedule_reminder`,
#: écrit par `action-router.service.ts::dispatchReminder` dans `user_actions`,
#: `action_type='plan_action_added'`, `metadata.router_intent='schedule_reminder'`)
#: pour ce contact. `None` si aucun. Sert deux portes : ne pas reprogrammer en
#: silence un rappel déjà posé pour la même raison (#3211.1), et signaler qu'un
#: rappel déjà PASSÉ n'a jamais reçu d'outcome (#3211.9) plutôt que de le taire.
async def fetch_pending_reminder_for_contact(
    sb: Any, contact_id: str, user_id: str, workspace_id: str | None = None
) -> dict | None:
    """Le dernier rappel programmé pour ce contact, ``None`` si aucun.

    `user_actions.metadata` n'est pas un champ interrogeable par égalité côté
    PostgREST dans ce dépôt (voir `routers/weekly.py`, même lecture large puis
    filtre en Python) : on lit les dix dernières actions du contact et on
    retient la première dont le `router_intent` est `schedule_reminder`.

    #3211.12 (épopée #3234) — ``workspace_id`` élargit la portée à TOUT
    l'espace (un rappel posé par un collègue compte aussi) : `user_actions.
    workspace_id` est stampé par tout chemin d'écriture (même Phase 2 que
    `outreach_messages` ci-dessus). Sans ``workspace_id``, on retombe sur
    l'ancien scope par `user_id` — comportement identique à l'octet.
    `user_id` reste dans la forme rendue pour que l'appelant NOMME « posé par
    un collègue » plutôt que de le taire (doctrine : on n'affiche jamais 0/rien
    à la place d'un fait qu'on a)."""
    if not user_id or not contact_id:
        return None
    query = (
        sb.table("user_actions")
        .select("id, metadata, created_at, user_id")
        .eq("contact_id", contact_id)
        .eq("action_type", "plan_action_added")
    )
    query = query.eq("workspace_id", workspace_id) if workspace_id else query.eq("user_id", user_id)
    res = await query.order("created_at", ascending=False).limit(10).aexecute()
    rows = getattr(res, "data", None) if res is not None else None
    for row in rows or []:
        metadata = row.get("metadata") if isinstance(row, dict) else None
        if isinstance(metadata, dict) and metadata.get("router_intent") == "schedule_reminder":
            return {
                "id": row.get("id"),
                "remind_at": metadata.get("remind_at"),
                "note": metadata.get("detail"),
                "created_at": row.get("created_at"),
                "user_id": row.get("user_id"),
            }
    return None
