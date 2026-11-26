"""#3904.1 — LE PLAN D'ACTIONS COMMERCIAL, regroupé par GESTE.

« Qui relancer, qui appeler, qui contacter, quel compte est proche de signer »
— à partir de ce que l'espace possède déjà. Ce module ne calcule AUCUNE
catégorie : il COMPOSE des lectures déjà faites ailleurs (GA-26).

- Le bilan de relance (#3903, `ActivitiesService.engagementReport` via
  `get_reengagement_report`) fournit, par compte, la catégorie (balle chez
  nous / à relancer / chez le client), la date, le sens et le canal de la
  dernière interaction. Le plan la RELIT, jamais ne la recalcule.

Les gestes et leur règle — chacune lisible depuis la seule ligne du bilan :

- `repondre`  — `en_attente_chez_nous` : le client a écrit en dernier.
- `appeler`   — `a_relancer` ET (la dernière tentative restée sans réponse
  était un APPEL, OU deux e-mails SORTANTS consécutifs sont restés sans
  réponse — `consecutiveOutboundEmails`). #3904 — DÉCISION LOUIS 09/10.
- `relancer`  — `a_relancer` sur tout autre canal (e-mail, réunion, réseau).

`en_attente_chez_le_client` ne produit AUCUN geste : relancer un client qui
n'a pas encore eu le temps de répondre n'est pas une action, c'est du bruit.

#3904.4 — `contacter` se COMPOSE de deux lectures existantes, jamais d'un
troisième moteur :

- `list_accounts_to_act` (`AccountsService.accountsAwaitingAction`) : un compte
  suivi SANS mouvement depuis 30 jours (`no_recent_action`) et absent du bilan
  (aucun échange dans la fenêtre — sinon il a déjà son geste ci-dessus).
  `awaiting_decision` n'est PAS un geste de contact : c'est une décision de
  portefeuille, elle reste à `list_accounts_to_act`.
- `search_dormant_network` : les personnes sans échange depuis N mois, avec
  leur score de réactivation et ses axes NOMMÉS, relayés tels quels (un score
  n'est jamais nu).

#3904 — DÉCISION LOUIS 09/10 : `proche_de_signer` = une opportunité au stade
PROPOSITION ou NÉGOCIATION, dans Bellum OU dans le CRM branché (pont
`accounts/near-signing`, `ActivitiesService.nearSigning`). Un stade déclaré,
jamais une probabilité ni un pourcentage (refusé six fois). La source lue se
NOMME sur chaque ligne (`opportunite_bellum` / `ton_crm`) ; un CRM jamais lu
se nomme dans `notEvaluated`, jamais lu « rien de proche de signer ».

#3904.3 — `coverage.connectors` : l'état des QUATRE connecteurs (CRM,
téléphonie, agenda, mail) et leur dernière synchro, relus de la lecture
UNIQUE `salesSourceConnections` (`@bellum/contracts`, pont
`internal/copilot/sources/connections`) — la même que l'écran. Un connecteur
absent y est NOMMÉ `not_connected` ; un état illisible vaut `None` et se nomme
dans `sourcesFailed`, jamais « tout est branché ».

Une source qui n'a pas répondu se NOMME (`sourcesFailed`, et `source_failed`
sur chaque geste qu'elle alimente) : jamais « rien à faire ».
"""

from __future__ import annotations

from typing import Any

#: Même borne que les autres outils de liste du chat (`_LIST_TOOL_CAP`,
#: GA-317) : un geste au-delà est coupé, et le dit (`truncated`, `total`).
ACTION_PLAN_GESTURE_CAP = 20

#: L'ordre de présentation : ce qui nous est DÛ d'abord, puis ce qui se
#: rattrape, puis ce qui se reprend au téléphone.
_REPORT_GESTURES = ("repondre", "relancer", "appeler")

_REPORT_SOURCE = "bilan_de_relance"
_TO_ACT_SOURCE = "comptes_a_traiter"
_DORMANT_SOURCE = "reseau_dormant"
_CONNECTIONS_SOURCE = "etat_des_connecteurs"
_NEAR_SIGNING_SOURCE = "opportunites_proches_de_signer"

#: #3904 — deux e-mails sortants consécutifs sans réponse : on décroche.
_EMAILS_BEFORE_CALL = 2

_REASONS = {
    "repondre": "Le dernier échange est venu du client : une réponse nous est due.",
    "relancer": "Le dernier échange est parti de chez nous et reste sans réponse depuis plus de deux semaines.",
    "appeler": "La dernière tentative, un appel, est restée sans réponse depuis plus de deux semaines : on rappelle.",
    "appeler_apres_emails": (
        "Deux e-mails sortants consécutifs sont restés sans réponse depuis plus de deux semaines : on appelle."
    ),
    "proche_de_signer_bellum": "Opportunité au stade « {stage} » dans Bellum.",
    "proche_de_signer_crm": "Affaire au stade « {stage} » dans ton CRM.",
    "contacter_compte": "Compte suivi sans aucune action depuis plus de 30 jours, et sans échange dans la fenêtre.",
    "contacter_personne": "Contact de ton réseau sans échange depuis au moins {months} mois.",
}

_BELLUM_STAGE_LABELS = {"profiles_submitted": "Profils présentés", "negotiation": "Négociation"}

_CRM_NOT_READ = {
    "gesture": "proche_de_signer",
    "source": "ton_crm",
    "reason": (
        "Aucune affaire de ton CRM n'a été lue : seules les opportunités Bellum sont classées "
        "« proche de signer »."
    ),
}


def _gesture_of(row: dict[str, Any]) -> str | None:
    category = row.get("category")
    if category == "en_attente_chez_nous":
        return "repondre"
    if category == "a_relancer":
        return "appeler" if row.get("lastKind") == "call" or _emails_unanswered(row) else "relancer"
    return None


def _emails_unanswered(row: dict[str, Any]) -> bool:
    count = row.get("consecutiveOutboundEmails")
    return isinstance(count, int) and count >= _EMAILS_BEFORE_CALL


def _report_action(row: dict[str, Any], gesture: str) -> dict[str, Any]:
    reason_key = "appeler_apres_emails" if gesture == "appeler" and row.get("lastKind") != "call" else gesture
    return {
        "accountId": row.get("accountId"),
        "companyName": row.get("companyName"),
        "reason": _REASONS[reason_key],
        "attempts": row.get("attempts"),
        # #3903 — le SENS du dernier échange (`inbound`/`outbound`), tel que le bilan le porte.
        "direction": row.get("lastDirection"),
        "sources": [{"source": "journal_echanges", "kind": row.get("lastKind"), "date": row.get("lastOccurredAt")}],
    }


def _gesture_block(gesture: str, actions: list[dict[str, Any]] | None) -> dict[str, Any]:
    """`actions is None` : la source qui alimente ce geste n'a pas répondu."""
    if actions is None:
        return {"gesture": gesture, "status": "source_failed", "actions": [], "total": None, "truncated": False}
    return {
        "gesture": gesture,
        "status": "ok" if actions else "empty",
        "actions": actions[:ACTION_PLAN_GESTURE_CAP],
        "total": len(actions),
        "truncated": len(actions) > ACTION_PLAN_GESTURE_CAP,
    }


def _bridge_ok(result: Any) -> bool:
    return isinstance(result, dict) and not result.get("error")


def _contact_actions(
    to_act: dict[str, Any] | None, dormant: dict[str, Any] | None, already_planned: set[Any]
) -> list[dict[str, Any]]:
    """#3904.4 — le geste `contacter`, composé des deux lectures existantes."""
    actions: list[dict[str, Any]] = []
    for row in (to_act or {}).get("accounts") or []:
        if not isinstance(row, dict) or row.get("reason") != "no_recent_action":
            continue
        if row.get("id") in already_planned:
            continue
        actions.append(
            {
                "accountId": row.get("id"),
                "companyName": row.get("companyName"),
                "reason": _REASONS["contacter_compte"],
                # `null` = aucune action jamais enregistrée — jamais une date inventée.
                "sources": [{"source": "portefeuille", "kind": "derniere_action", "date": row.get("lastActionAt")}],
            }
        )
    months = (dormant or {}).get("months")
    for contact in (dormant or {}).get("contacts") or []:
        if not isinstance(contact, dict):
            continue
        actions.append(
            {
                "accountId": contact.get("account_id"),
                "companyName": contact.get("company_name"),
                "contactId": contact.get("contact_id"),
                "contactName": contact.get("full_name"),
                "contactTitle": contact.get("title"),
                "reason": _REASONS["contacter_personne"].format(months=months if isinstance(months, int) else 6),
                "reactivationScore": contact.get("reactivation_score"),
                "sources": [{"source": "reseau_dormant", "kind": "silence_mois", "date": None}],
            }
        )
    return actions


def _near_signing_actions(near_signing: dict[str, Any]) -> list[dict[str, Any]]:
    """#3904 — Bellum puis CRM, chaque ligne avec sa source et son stade."""
    actions: list[dict[str, Any]] = []
    for row in near_signing.get("bellum") or []:
        if not isinstance(row, dict):
            continue
        stage = _BELLUM_STAGE_LABELS.get(str(row.get("stage")), str(row.get("stage")))
        actions.append(
            {
                "accountId": row.get("accountId"),
                "companyName": row.get("companyName"),
                "opportunityId": row.get("opportunityId"),
                "opportunityLabel": row.get("label"),
                "stage": stage,
                "reason": _REASONS["proche_de_signer_bellum"].format(stage=stage),
                "sources": [{"source": "opportunite_bellum", "kind": row.get("stage"), "date": None}],
            }
        )
    for row in near_signing.get("crm") or []:
        if not isinstance(row, dict):
            continue
        actions.append(
            {
                "accountId": row.get("accountId"),
                "companyName": row.get("companyName"),
                "dealName": row.get("dealName"),
                "stage": row.get("stageLabel"),
                "reason": _REASONS["proche_de_signer_crm"].format(stage=row.get("stageLabel")),
                "sources": [{"source": "ton_crm", "kind": row.get("stageLabel"), "date": None}],
            }
        )
    return _grouped_by_stage(actions)


def _grouped_by_stage(actions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """#2887 — un stade n'est jamais coupé en deux : les stades Bellum d'abord (le plus avancé en tête),
    puis ceux du CRM dans leur ordre de lecture ; un libellé commun aux deux sources se regroupe."""
    order = list(_BELLUM_STAGE_LABELS.values())[::-1]
    for action in actions:
        if action.get("stage") not in order:
            order.append(action.get("stage"))
    return sorted(actions, key=lambda action: order.index(action.get("stage")))


_TABLE_COLUMNS = ["Geste", "Compte", "Sens", "Pourquoi", "Source et date"]
_GESTURE_LABELS = {
    "repondre": "Répondre",
    "relancer": "Relancer",
    "appeler": "Appeler",
    "proche_de_signer": "Proche de signer",
    "contacter": "Contacter",
}
_SOURCE_LABELS = {
    "journal_echanges": "Journal d'échanges",
    "ton_crm": "Ton CRM",
    "opportunite_bellum": "Opportunité Bellum",
    "portefeuille": "Portefeuille",
    "reseau_dormant": "Réseau dormant",
}
_DIRECTION_LABELS = {"inbound": "Entrant", "outbound": "Sortant"}
_CELL_MAX = 200  # limite du contrat `file_export` (`Cell`)


def _cell(text: Any) -> str | None:
    """Une cellule non mesurée reste `None` (jamais « 0 » ni un tiret inventé)."""
    if not isinstance(text, str) or not text.strip():
        return None
    return text.strip()[:_CELL_MAX]


def _source_cell(sources: Any) -> str | None:
    if not isinstance(sources, list) or not sources or not isinstance(sources[0], dict):
        return None
    first = sources[0]
    label = _SOURCE_LABELS.get(str(first.get("source")), str(first.get("source") or ""))
    date = first.get("date")
    day = date[:10] if isinstance(date, str) and len(date) >= 10 else None
    return _cell(f"{label}, {day}" if day else label)


def _export_table(gestures: list[dict[str, Any]]) -> dict[str, Any]:
    """#3903 — le plan EN TABLEAU : Geste / Compte / Sens / Pourquoi / Source et date.

    Recette prod 10/10 : la carte « Plan d'actions commercial » sortait en liste à
    puces (0 `<table>`, pas de colonne « Sens »). Le tableau est composé ICI, une
    ligne par action, à partir des mêmes actions que `gestures` — jamais un second
    calcul. Le sens n'existe que pour un échange (`direction`) ; ailleurs, `None`."""
    rows: list[dict[str, Any]] = []
    for block in gestures:
        label = _GESTURE_LABELS.get(str(block.get("gesture")), str(block.get("gesture")))
        for action in block.get("actions") or []:
            account = action.get("companyName")
            person = action.get("contactName")
            compte = f"{account} — {person}" if account and person else (account or person)
            # #2887.10 (r40) — « proche de signer » se range PAR STADE : le stade est dans le libellé du geste.
            stage = action.get("stage") if block.get("gesture") == "proche_de_signer" else None
            row_label = f"{label} — {stage}" if isinstance(stage, str) and stage.strip() else label
            rows.append(
                {
                    "cells": [
                        _cell(row_label),
                        _cell(compte),
                        _DIRECTION_LABELS.get(str(action.get("direction"))),
                        _cell(action.get("reason")),
                        _source_cell(action.get("sources")),
                    ]
                }
            )
    # #2887.2 (recette prod 12/10) — « Sens » = « non mesuré » sur 25 lignes : une colonne ENTIÈREMENT vide
    # ne s'affiche pas (on n'affiche pas ce qu'on n'a pas). Une colonne partiellement remplie reste, ses
    # trous en `None`.
    kept = [i for i in range(len(_TABLE_COLUMNS)) if any(row["cells"][i] is not None for row in rows)] or list(
        range(len(_TABLE_COLUMNS))
    )
    return {
        "columns": [_TABLE_COLUMNS[i] for i in kept],
        "rows": [{"cells": [row["cells"][i] for i in kept]} for row in rows],
    }


def compose_action_plan(
    *,
    report: dict[str, Any] | None,
    to_act: dict[str, Any] | None = None,
    dormant: dict[str, Any] | None = None,
    connections: dict[str, Any] | None = None,
    near_signing: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Compose le plan. Une lecture à `None` (ou en erreur) n'a pas répondu :
    elle se NOMME dans `sourcesFailed`, jamais lue « rien à faire »."""
    sources_failed: list[str] = []
    by_gesture: dict[str, list[dict[str, Any]] | None]
    if report is None:
        sources_failed.append(_REPORT_SOURCE)
        by_gesture = {gesture: None for gesture in _REPORT_GESTURES}
    else:
        by_gesture = {gesture: [] for gesture in _REPORT_GESTURES}
        for row in report.get("accounts") or []:
            if not isinstance(row, dict):
                continue
            gesture = _gesture_of(row)
            if gesture is not None:
                by_gesture[gesture].append(_report_action(row, gesture))  # type: ignore[union-attr]

    to_act_ok, dormant_ok = _bridge_ok(to_act), _bridge_ok(dormant)
    if not to_act_ok:
        sources_failed.append(_TO_ACT_SOURCE)
    if not dormant_ok:
        sources_failed.append(_DORMANT_SOURCE)
    # Un compte DÉJÀ dans le bilan (même « balle chez le client ») a un échange
    # en cours : il n'est jamais « à contacter » en plus.
    already_planned = {row.get("accountId") for row in (report or {}).get("accounts") or [] if isinstance(row, dict)}
    contact_actions = (
        _contact_actions(to_act if to_act_ok else None, dormant if dormant_ok else None, already_planned)
        if (to_act_ok or dormant_ok)
        else None
    )

    connectors = (connections or {}).get("sources") if _bridge_ok(connections) else None
    if not isinstance(connectors, list):
        connectors = None
        sources_failed.append(_CONNECTIONS_SOURCE)

    # #3904 — décision Louis 09/10 : « proche de signer » lit un STADE.
    near_ok = _bridge_ok(near_signing)
    near_actions = _near_signing_actions(near_signing) if near_ok and near_signing is not None else None
    not_evaluated: list[dict[str, Any]] = []
    if not near_ok:
        sources_failed.append(_NEAR_SIGNING_SOURCE)
    elif (near_signing or {}).get("crm") is None:
        not_evaluated.append(dict(_CRM_NOT_READ))

    coverage = (report or {}).get("sourcesCoverage") or {}
    gestures = [
        *(_gesture_block(gesture, by_gesture[gesture]) for gesture in _REPORT_GESTURES),
        _gesture_block("proche_de_signer", near_actions),
        _gesture_block("contacter", contact_actions),
    ]
    return {
        "window": {"since": (report or {}).get("since")},
        "gestures": gestures,
        "exportTable": _export_table(gestures),
        "notEvaluated": not_evaluated,
        "coverage": {
            "activityKindsNotObserved": list(coverage.get("notObserved") or []),
            "reportNotEvaluated": list((report or {}).get("notEvaluated") or []),
            "connectors": connectors,
        },
        "sourcesFailed": sources_failed,
    }
