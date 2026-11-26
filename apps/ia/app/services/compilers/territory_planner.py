"""Le terrain de jeu multi-talents (#2337, LAU-FINAL-078).

« J'ai trois consultants disponibles. Construis-moi le terrain de jeu. »

Mesuré le 23/09/2026 : le matching inverse répondait pour UN talent (écran
« Marché inversé », `InverseMatchingService`) ; rien ne lisait plusieurs talents
d'un coup, et trois recherches séparées envoyaient trois CV au même compte sans
contexte commun. Ce module COMPILE les faits que le pont rend
(`POST /internal/copilot/talents/territory-plan`, moteur de matching EXISTANT,
treize axes, borné à l'espace et au périmètre de BU) en UN terrain de jeu :

* **fusion** — un compte n'apparaît qu'une fois, avec tous les talents qui y
  sont compatibles (#2337.1/.3) ;
* **talent d'entrée / alternatif** — un seul angle, jamais N CV d'un coup
  (#2337.4/.6) ;
* **collisions** — même contact, plusieurs porteurs, talent déjà présenté ou
  déjà refusé, talent sollicité partout (#2337.5) ;
* **capacité** — quelques comptes actifs, une réserve, le reste COMPTÉ et dit
  (#2337.7/.9).

Ce qu'il ne fait PAS, par doctrine :

* **aucune probabilité** — le rang prolonge la grille EXISTANTE
  `account_fit_score_25` (décision Louis 18/09 : pas de modèle neuf) et
  l'aptitude à être poussé du moteur de matching ; aucun « % de chance » ;
* **un score n'est jamais nu** — les axes qui ordonnent sont nommés sur la
  carte, et ce qui n'a pas pu être évalué est NOMMÉ sur chaque compte ;
* **une absence ne fait aucune ligne** — un compte sans talent compatible
  n'apparaît pas ; un talent qu'aucun besoin ne lit n'invente rien ;
* **aucun critère protégé** — les faits n'en portent aucun ;
* **rien n'écrit seul** — les cartes rendues se lisent et s'exportent d'un
  geste local (`file_export`) ; aucune action, aucun message n'est créé.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from app.services.reply_blocks import reply_card

#: #2337.7/.9 — la capacité par défaut d'une petite équipe : quelques comptes
#: actifs, pas cinquante. Déclarable par l'utilisateur, bornée des deux côtés.
DEFAULT_ACTIVE_CAPACITY = 5
MAX_ACTIVE_CAPACITY = 10
#: La réserve : ce qu'on ouvre quand un compte actif se ferme — pas une seconde liste active.
RESERVE_SIZE = 5
#: Au-delà de deux comptes actifs, un talent d'entrée n'est plus un angle mais une diffusion.
MAX_ACTIVE_ACCOUNTS_PER_TALENT = 2

#: Les axes qui ORDONNENT le terrain — nommés sur la carte (un rang n'est jamais nu).
RANKING_AXES: tuple[str, ...] = (
    "Talents compatibles sur le compte (complémentarité)",
    "Note du compte /25 — grille de compte existante",
    "Aptitude du talent d'entrée à être poussé (matching du vivier)",
)

_COMPATIBLE_BUCKETS = ("recommended", "borderline")

#: Les treize axes du moteur, dits en clair quand ils n'ont pas pu être évalués.
_AXIS_LABELS: dict[str, str] = {
    "must_have": "Compétences indispensables",
    "nice_to_have": "Compétences souhaitées",
    "seniority": "Séniorité",
    "sector": "Secteur",
    "environment": "Environnement technique",
    "language": "Langues",
    "location": "Localisation",
    "availability": "Disponibilité",
    "contract_status": "Statut contractuel",
    "rate": "Tarif",
    "evidence_quality": "Qualité des preuves",
    "client_constraints": "Contraintes client",
    "risks": "Risques",
}

_FLAG_LABELS: dict[str, str] = {
    "previously_rejected_by_client": "déjà refusé par ce client",
    "already_on_mission_at_client": "déjà en mission chez ce client",
}

#: `CONSULTANT_AVAILABILITIES` (packages/contracts) — `inconnu` n'a PAS de
#: libellé : il n'est jamais présenté comme une disponibilité.
_AVAILABILITY_LABELS: dict[str, str] = {
    "immediate": "disponible immédiatement",
    "sous_1_mois": "libre sous un mois",
    "sous_3_mois": "libre sous trois mois",
    "indisponible": "indisponible",
    "en_mission": "en mission",
}


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _clip(value: str, limit: int) -> str:
    text = value.strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _short_name(full_name: str) -> str:
    """« Camille Roussel » → « Camille R. » : assez pour se repérer sur la carte."""
    parts = full_name.split()
    if len(parts) < 2:
        return full_name or "Talent sans nom"
    return f"{parts[0]} {parts[-1][0]}."


def _capacity(value: Any) -> int:
    try:
        declared = int(value)
    except (TypeError, ValueError):
        return DEFAULT_ACTIVE_CAPACITY
    return max(1, min(MAX_ACTIVE_CAPACITY, declared))


def _territory_matches(territory: str, location: str | None) -> bool | None:
    """``None`` quand le besoin ne dit pas où il se tient : non vérifiable, pas exclu."""
    if not location:
        return None
    left, right = territory.lower(), location.lower()
    return left in right or right in left


def _talent_inputs(raw: Sequence[Any] | None) -> dict[str, dict[str, str]]:
    out: dict[str, dict[str, str]] = {}
    for entry in raw or []:
        if not isinstance(entry, Mapping):
            continue
        consultant_id = _clean(entry.get("consultant_id"))
        if consultant_id:
            out[consultant_id] = {
                "conditions": _clean(entry.get("conditions")),
                "territory": _clean(entry.get("territory")),
            }
    return out


def _availability_of(talent: Mapping[str, Any]) -> str | None:
    free_from = _clean(talent.get("freeFrom"))
    if free_from:
        return f"libre le {free_from[:10]}"
    declared = _clean(talent.get("declaredAvailability"))
    return _AVAILABILITY_LABELS.get(declared) or None


def _best_fits(
    account: Mapping[str, Any],
    talent_ids: Sequence[str],
    inputs: Mapping[str, Mapping[str, str]],
) -> tuple[dict[str, dict[str, Any]], set[str], bool]:
    """Par talent, son MEILLEUR besoin compatible sur ce compte.

    Rend aussi les talents non évaluables ici (nommés, jamais comptés « non »)
    et si un territoire déclaré n'a pas pu être vérifié faute de lieu sur le
    besoin."""
    best: dict[str, dict[str, Any]] = {}
    not_evaluable: set[str] = set()
    territory_unverified = False
    for need in account.get("needs") or []:
        if not isinstance(need, Mapping):
            continue
        for evaluation in need.get("evaluations") or []:
            if not isinstance(evaluation, Mapping):
                continue
            talent_id = _clean(evaluation.get("consultantId"))
            if talent_id not in talent_ids:
                continue
            bucket = _clean(evaluation.get("bucket"))
            if bucket == "not_evaluable":
                not_evaluable.add(talent_id)
                continue
            if bucket not in _COMPATIBLE_BUCKETS:
                continue
            territory = inputs.get(talent_id, {}).get("territory", "")
            if territory:
                verdict = _territory_matches(territory, _clean(need.get("location")) or None)
                if verdict is False:
                    continue
                if verdict is None:
                    territory_unverified = True
            key = (int(evaluation.get("pushableScore") or 0), int(evaluation.get("correspondenceScore") or 0))
            current = best.get(talent_id)
            if current is None or key > current["key"]:
                best[talent_id] = {"key": key, "need": need, "evaluation": evaluation}
    # Un talent compatible sur un besoin n'est pas « non évaluable » sur le compte.
    not_evaluable -= set(best)
    return best, not_evaluable, territory_unverified


def _plan_account(
    account: Mapping[str, Any],
    talents: Mapping[str, Mapping[str, Any]],
    inputs: Mapping[str, Mapping[str, str]],
) -> dict[str, Any] | None:
    best, not_evaluable, territory_unverified = _best_fits(account, list(talents), inputs)
    if not best:
        # « On n'affiche pas ce qu'on n'a pas » : aucun talent compatible, aucune ligne.
        return None

    ranked = sorted(
        best.items(),
        key=lambda item: (-item[1]["key"][0], -item[1]["key"][1], _clean(talents[item[0]].get("fullName"))),
    )
    principal_id, principal = ranked[0]
    alternate = ranked[1] if len(ranked) > 1 else None
    name_of = {tid: _short_name(_clean(talents[tid].get("fullName"))) for tid in talents}

    principal_need = principal["need"]
    principal_eval = principal["evaluation"]
    need_title = _clean(principal_need.get("title")) or "besoin sans intitulé"

    reasons: list[str] = []
    skills = [s for s in principal_eval.get("matchedSkills") or [] if _clean(s)]
    reasons.append(
        f"Talent d'entrée : {name_of[principal_id]} sur « {need_title} »"
        + (f" — couvre {', '.join(skills[:4])}." if skills else ".")
    )
    if alternate is not None:
        alt_id, alt = alternate
        alt_title = _clean(alt["need"].get("title")) or "besoin sans intitulé"
        reasons.append(f"Talent alternatif : {name_of[alt_id]} sur « {alt_title} », à évoquer dans un second temps.")
    others = [name_of[tid] for tid, _ in ranked[2:]]
    if others:
        listed = ", ".join(others)
        # « Inès K. » finit déjà par un point : jamais « Inès K.. ».
        reasons.append(
            f"Aussi compatible{'s' if len(others) > 1 else ''} : {listed}" + ("" if listed.endswith(".") else ".")
        )
    fit = account.get("fitScore25")
    verdict = _clean(account.get("fitVerdict"))
    if isinstance(fit, int):
        reasons.append(f"Note du compte : {fit}/25" + (f" ({verdict})." if verdict else "."))

    owners = sorted(
        {_clean(entry["need"].get("ownerName")) for entry in best.values() if _clean(entry["need"].get("ownerName"))}
    )
    if len(owners) == 1:
        reasons.append(f"Porteur : {owners[0]}.")

    # ── Collisions (#2337.5) — dites AVANT tout message ──────────────────────
    collisions: list[str] = []
    contacts: dict[str, list[str]] = {}
    for tid, entry in best.items():
        contact_id = _clean(entry["need"].get("contactId"))
        if contact_id:
            contacts.setdefault(contact_id, []).append(name_of[tid])
    for names in contacts.values():
        if len(names) > 1:
            collisions.append(f"Même contact visé pour {', '.join(sorted(names))} : un seul message, un seul angle.")
    if len(owners) > 1:
        collisions.append(f"Plusieurs porteurs ({', '.join(owners)}) : désigner un seul owner avant d'écrire.")
    presented = {_clean(tid) for tid in account.get("presentedConsultantIds") or []}
    for tid in best:
        if tid in presented:
            collisions.append(f"{name_of[tid]} déjà présenté sur ce compte.")
        for flag in best[tid]["evaluation"].get("flags") or []:
            label = _FLAG_LABELS.get(_clean(flag))
            if label:
                collisions.append(f"{name_of[tid]} {label}.")

    # ── Ce qui n'a pas pu être évalué — nommé, jamais compté 0 ───────────────
    not_evaluated: list[str] = []
    if not isinstance(fit, int):
        not_evaluated.append("Note du compte /25")
    if not owners:
        not_evaluated.append("Porteur du besoin")
    for axis in principal_eval.get("notEvaluatedAxes") or []:
        label = _AXIS_LABELS.get(_clean(axis))
        if label and label not in not_evaluated:
            not_evaluated.append(label)
    for tid in sorted(not_evaluable):
        not_evaluated.append(f"{name_of[tid]} (fiche incomplète)")
    if territory_unverified:
        not_evaluated.append("Territoire (besoin sans lieu)")

    if alternate is not None:
        first_move = (
            f"Un seul angle : ouvrir par {name_of[principal_id]} sur « {need_title} », "
            f"garder {name_of[alternate[0]]} pour un second temps — pas deux CV d'un coup."
        )
    else:
        first_move = f"Ouvrir par {name_of[principal_id]} sur « {need_title} »."

    return {
        "account_id": _clean(account.get("accountId")),
        "name": _clean(account.get("accountName")) or "Compte sans nom",
        "principal": principal_id,
        "alternate": alternate[0] if alternate else None,
        "compatible": [tid for tid, _ in ranked],
        "fit": fit if isinstance(fit, int) else None,
        "pushable": principal["key"][0],
        "owner": owners[0] if len(owners) == 1 else None,
        "first_move": first_move,
        "reasons": reasons,
        "collisions": collisions,
        "not_evaluated": not_evaluated,
    }


def _order_key(entry: Mapping[str, Any]) -> tuple[Any, ...]:
    # Une note absente se range APRÈS les notes connues, à complémentarité égale —
    # et elle reste nommée « non évaluée » sur sa ligne : jamais lue comme 0.
    fit = entry["fit"]
    return (-len(entry["compatible"]), fit is None, -(fit or 0), -entry["pushable"], entry["name"].lower())


def _ranking_item(entry: Mapping[str, Any]) -> dict[str, Any]:
    item: dict[str, Any] = {
        "name": _clip(entry["name"], 120),
        "verdict": _clip(entry["first_move"], 300),
        "why": [_clip(line, 400) for line in entry["reasons"][:5]],
    }
    if entry["account_id"]:
        item["href"] = f"/accounts/{entry['account_id']}"
        item["action"] = {"label": "Ouvrir le compte", "href": f"/accounts/{entry['account_id']}"}
    if entry["collisions"]:
        item["limits"] = [_clip(line, 400) for line in entry["collisions"][:5]]
    if entry["not_evaluated"]:
        item["not_evaluated"] = [_clip(line, 80) for line in entry["not_evaluated"][:6]]
    return item


def compile_territory_plan(
    facts: Mapping[str, Any],
    *,
    talent_inputs: Sequence[Any] | None = None,
    capacity: Any = None,
) -> dict[str, Any]:
    """Compile les faits du pont en UN terrain de jeu — pur, sans I/O."""
    inputs = _talent_inputs(talent_inputs)
    talents: dict[str, Mapping[str, Any]] = {
        _clean(t.get("consultantId")): t
        for t in facts.get("talents") or []
        if isinstance(t, Mapping) and _clean(t.get("consultantId"))
    }
    unknown = [tid for tid in facts.get("unknownTalentIds") or [] if _clean(tid)]
    if len(talents) < 2:
        return {
            "error": (
                "Il me faut au moins deux talents de ce vivier pour un terrain de jeu commun"
                + (f" ({len(unknown)} introuvable(s) dans cet espace)." if unknown else ".")
                + " Pour un seul talent, son marché inversé répond déjà."
            )
        }

    active_capacity = _capacity(capacity)
    planned = [
        entry
        for entry in (_plan_account(account, talents, inputs) for account in facts.get("accounts") or [])
        if entry is not None
    ]
    planned.sort(key=_order_key)

    # #2337.9 — la capacité ET l'exposition d'un talent bornent l'actif : un
    # talent d'entrée ne se présente pas sur plus de deux comptes à la fois.
    active: list[dict[str, Any]] = []
    rest: list[dict[str, Any]] = []
    per_talent: dict[str, int] = {}
    for entry in planned:
        if len(active) < active_capacity and per_talent.get(entry["principal"], 0) < MAX_ACTIVE_ACCOUNTS_PER_TALENT:
            active.append(entry)
            per_talent[entry["principal"]] = per_talent.get(entry["principal"], 0) + 1
        else:
            rest.append(entry)
    reserve, beyond = rest[:RESERVE_SIZE], len(rest) - min(len(rest), RESERVE_SIZE)

    name_of = {tid: _clean(t.get("fullName")) or "Talent sans nom" for tid, t in talents.items()}
    talent_rows = [
        {
            "consultant_id": tid,
            "name": name_of[tid],
            "title": _clean(talent.get("title")) or None,
            "availability": _availability_of(talent),
            "conditions": inputs.get(tid, {}).get("conditions") or None,
            "territory": inputs.get(tid, {}).get("territory") or (", ".join(talent.get("zones") or []) or None),
            "proofs": _first_evidence(facts, tid),
        }
        for tid, talent in talents.items()
    ]

    result: dict[str, Any] = {
        "capacity": active_capacity,
        "talents": talent_rows,
        "active_accounts": [_public(entry, name_of) for entry in active],
        "reserve_accounts": [_public(entry, name_of) for entry in reserve],
        "beyond_capacity": beyond,
        "evaluated_needs": facts.get("evaluatedNeeds"),
        "truncated": bool(facts.get("truncated")),
    }
    if unknown:
        result["unknown_talents"] = len(unknown)
    if not planned:
        result["notice"] = (
            "Aucun besoin ouvert de cet espace ne reçoit ces talents aujourd'hui : "
            "pas de terrain de jeu à proposer, et je n'en invente pas."
        )
        return result

    result["talents_card"] = reply_card(_talents_block(talent_rows))
    result["card"] = reply_card(
        {
            "type": "account_ranking",
            "title": _clip(f"Terrain de jeu — {len(active)} compte(s) actif(s) sur {active_capacity}", 120),
            "axes": list(RANKING_AXES),
            "items": [_ranking_item(entry) for entry in active],
        }
    )
    if reserve:
        result["reserve_card"] = reply_card(
            {
                "type": "account_ranking",
                "title": "Réserve — à ouvrir quand un compte actif se ferme",
                "axes": list(RANKING_AXES),
                "items": [_ranking_item(entry) for entry in reserve],
            }
        )
    result["download_card"] = reply_card(_export_block(active, reserve, name_of))
    return result


def _first_evidence(facts: Mapping[str, Any], talent_id: str) -> str | None:
    for account in facts.get("accounts") or []:
        for need in account.get("needs") or []:
            for evaluation in need.get("evaluations") or []:
                if _clean(evaluation.get("consultantId")) == talent_id and _clean(evaluation.get("evidenceDetail")):
                    return _clean(evaluation.get("evidenceDetail"))
    return None


def _public(entry: Mapping[str, Any], name_of: Mapping[str, str]) -> dict[str, Any]:
    return {
        "account_id": entry["account_id"],
        "name": entry["name"],
        "principal": name_of.get(entry["principal"]),
        "alternate": name_of.get(entry["alternate"]) if entry["alternate"] else None,
        "compatible": [name_of.get(tid) for tid in entry["compatible"]],
        "owner": entry["owner"],
        "first_move": entry["first_move"],
        "collisions": entry["collisions"],
        "not_evaluated": entry["not_evaluated"],
    }


def _talents_block(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """#2337.2 — chaque talent porte SES attributs ; une case inconnue reste vide."""

    def cell(value: Any) -> str | None:
        text = _clean(value)
        return _clip(text, 200) if text else None

    table = [
        {"label": label, "cells": [cell(row[key]) for row in rows[:4]]}
        for label, key in (
            ("Disponibilité", "availability"),
            ("Conditions", "conditions"),
            ("Preuves", "proofs"),
            ("Territoire", "territory"),
        )
    ]
    # « On n'affiche pas ce qu'on n'a pas » : une ligne vide pour TOUS les
    # talents ne fait aucune ligne. La disponibilité reste, même vide — c'est
    # la question qu'on pose d'abord, et la carte ne peut pas être sans ligne.
    kept = [line for line in table if line["label"] == "Disponibilité" or any(line["cells"])]
    return {
        "type": "comparison",
        "title": "Les talents du terrain de jeu",
        "columns": [_clip(_short_name(row["name"]), 80) for row in rows[:4]],
        "rows": kept,
        "note": "Une case vide n'a pas été renseignée : elle ne vaut ni « non » ni zéro.",
    }


def _export_block(
    active: Sequence[Mapping[str, Any]],
    reserve: Sequence[Mapping[str, Any]],
    name_of: Mapping[str, str],
) -> dict[str, Any]:
    """#2337.8 — le tableau exportable : un téléchargement LOCAL, rien n'est créé."""

    def row(entry: Mapping[str, Any], status: str) -> dict[str, Any]:
        cells = [
            entry["name"],
            status,
            name_of.get(entry["principal"]),
            name_of.get(entry["alternate"]) if entry["alternate"] else None,
            entry["owner"],
            entry["first_move"],
        ]
        return {"cells": [_clip(_clean(c), 200) if _clean(c) else None for c in cells]}

    return {
        "type": "file_export",
        "title": "Terrain de jeu — tableau",
        "filename": "terrain-de-jeu.csv",
        "columns": ["Compte", "Statut", "Talent d'entrée", "Talent alternatif", "Porteur", "Premier mouvement"],
        "rows": [row(e, "actif") for e in active] + [row(e, "réserve") for e in reserve],
        "note": "Téléchargement local : aucune action ni aucun message n'est créé.",
    }
