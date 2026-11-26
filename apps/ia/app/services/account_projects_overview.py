"""#3889 (recette R32, 16/10) — besoins ouverts / anciens besoins / missions en cours d'UN compte, lus en UN passage.

Pur : reçoit ce que `find_needs` (avec ``include_closed``) et `account_staffing_history` ont rendu, rend trois
rubriques. Chaque rubrique dit si sa lecture a eu lieu (``read``) : une rubrique lue et vide vaut
``{"read": True, "count": 0}`` — un FAIT, jamais « non vérifié » ; une lecture en échec vaut ``{"read": False}``
sans ``count`` (« non lue » ne se dit QUE pour elle, jamais « 0 »).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import date
from typing import Any


def _section(items: Sequence[Any]) -> dict[str, Any]:
    return {"read": True, "count": len(items), "items": list(items)}


_NOT_READ: dict[str, Any] = {"read": False}


def _is_upcoming(starts_on: object, today: date) -> bool:
    """#3889.6 (R37) — une mission dont le DÉMARRAGE est futur est « à venir », jamais « en cours ». Un
    démarrage absent ou illisible n'est jamais « à venir » : rien n'est deviné."""
    try:
        return date.fromisoformat(str(starts_on)[:10]) > today
    except ValueError:
        return False


def _is_past(ends_on: object, today: date) -> bool:
    """Une mission est terminée quand sa fin est PASSÉE ; fin absente ou à venir = en cours."""
    try:
        return date.fromisoformat(str(ends_on)[:10]) < today
    except ValueError:
        return False


def build_account_projects_overview(
    needs: Sequence[Mapping[str, Any]] | None,
    staffing: Mapping[str, Any] | None,
    *,
    today: date,
) -> dict[str, Any]:
    """``needs`` : lignes déjà façonnées par `find_needs` (``historical``) ; ``None`` = lecture en échec.
    ``staffing`` : réponse de `account_staffing_history` ; ``None`` ou ``error`` = lecture en échec."""
    if needs is None:
        open_needs, past_needs = dict(_NOT_READ), dict(_NOT_READ)
    else:
        open_needs = _section([n for n in needs if not n.get("historical")])
        past_needs = _section([n for n in needs if n.get("historical")])

    rows = staffing.get("consultants") if isinstance(staffing, Mapping) and not staffing.get("error") else None
    if not isinstance(rows, list):
        in_progress, upcoming, ended = dict(_NOT_READ), dict(_NOT_READ), dict(_NOT_READ)
    else:
        missions = [dict(r) for r in rows if isinstance(r, Mapping)]
        ended_rows = [m for m in missions if _is_past(m.get("ends_on"), today)]
        # #3889.6 — « à venir » : démarrage futur ; « en cours » : ni terminée, ni à venir.
        upcoming_rows = [m for m in missions if m not in ended_rows and _is_upcoming(m.get("starts_on"), today)]
        in_progress = _section([m for m in missions if m not in ended_rows and m not in upcoming_rows])
        upcoming = _section(upcoming_rows)
        ended = _section(ended_rows)
    return {
        "open_needs": open_needs,
        "past_needs": past_needs,
        "missions_in_progress": in_progress,
        "missions_upcoming": upcoming,
        "missions_ended": ended,
        "reading_note": (
            "Chaque rubrique dit `read`. `read: true` et `count: 0` = lue et VIDE : dis « aucun enregistré », "
            "jamais « non vérifié ». `read: false` = lecture réellement en échec : nomme-la comme telle. "
            "Une mission dont le démarrage est FUTUR est `missions_upcoming` (« à venir », avec sa date de "
            "démarrage) : ne l'appelle JAMAIS « en cours »."
        ),
    }
