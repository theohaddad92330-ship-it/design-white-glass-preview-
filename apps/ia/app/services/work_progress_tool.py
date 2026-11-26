"""#4611 — Laura DIT où en est le travail lancé, au lieu de le raconter sans donnée.

Prod, 26/10 13:44 : « où en est la carte ? » → « les analyses des 15 comptes sont toujours en cours de
retour… » puis, dans la même bulle, « cette réponse ne s'appuie sur aucun résultat d'outil ce tour ». Laura
décrivait un état qu'elle n'avait pas lu. Ce module est le LECTEUR qui manquait : ``get_work_progress`` lit
l'état réel (analyses, imports, enrichissements, synchros CRM, rattrapages — une seule forme, #4611.2) et le
rend en CARTE (#4611.3), jamais en prose rédigée par le modèle.

Ce que l'outil ne fait JAMAIS : écrire, relancer, rejouer (« Laura n'envoie rien : elle prépare »), donner une
probabilité ou une estimation de fin (rien ne la mesure), agréger un coût d'accès entre espaces. L'espace et le
périmètre de portefeuille sont résolus côté API depuis l'utilisateur ; un lot d'un autre espace revient
« inconnu » (#4611.8).

Les quatre refus que ce fichier tient :
  * #4611.5 — un chiffre non mesuré reste ``None`` et se NOMME ; il ne devient jamais « 0 » (ni dans la sortie
    de l'outil, ni dans la carte) ;
  * #4611.4 — aucun compteur n'est calculé ici : chacun vient tel que l'API l'a mesuré ;
  * #4611.7 — un amont injoignable est une erreur claire ; un délai dépassé est ``unknown`` et NE se rejoue pas ;
  * #4611.10 — ``progress_answer_gate`` : une question d'avancement sans lecture réussie n'est pas
    racontée, elle reçoit « je n'ai pas pu lire ».
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Mapping
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from app.models.reply_blocks import validate_reply_block
from app.services.reply_blocks import REPLY_BLOCK_FENCE, split_reply_blocks

GET_WORK_PROGRESS_TOOL_NAME = "get_work_progress"

GET_WORK_PROGRESS_TOOL: dict[str, Any] = {
    "name": "get_work_progress",
    "description": (
        "L'ÉTAT RÉEL du travail lancé : combien d'analyses, d'imports, d'enrichissements, de synchros CRM, "
        "de rattrapages, de jobs en plusieurs étapes et de recherches de conversation ont été LANCÉS, sont "
        "RENDUS, sont EN ERREUR, sont EN COURS, et depuis quand — lu en base, jamais deviné. À utiliser pour "
        "« où en sont mes analyses », « où en est la carte », « comment avance l'ensemble », « où en est mon "
        "import », « où en est ma recherche » (une recherche qui tourne encore dans un autre fil : elle n'est "
        "PAS interrompue par cette question). RÉPONDS par la carte `comparison` que cet outil "
        "fait partir : ce sont ses chiffres qui comptent, ta phrase ne fait que les introduire — n'écris "
        "AUCUN chiffre, AUCUN état que cet outil n'a pas rendu. Un chiffre rendu `null` est NON MESURÉ : dis "
        "qu'il n'est pas mesuré (et pourquoi, `unmeasured`), JAMAIS « 0 » ni « aucun ». Ne déduis jamais un "
        "compteur d'un autre (« lancées moins rendues »). Un lot en erreur se NOMME avec la raison que la "
        "source a donnée (`failures`) — n'en invente pas. Aucune probabilité, aucune estimation de fin : "
        "rien ne la mesure. `lot_id` (facultatif) : UN lot d'analyses déjà lu dans ce fil, jamais un "
        "identifiant deviné ; un lot absent du périmètre revient « inconnu ». L'outil LIT seulement : il ne "
        "relance rien, ne rejoue rien, n'écrit rien. Si l'outil n'a pas pu lire, dis que tu n'as pas pu "
        "lire — ne raconte pas l'avancement de mémoire."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "lot_id": {
                "type": "string",
                "description": "Identifiant d'UN lot d'analyses déjà lu dans ce fil. Absent : les cinq familles.",
            },
        },
    },
}

_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)

#: #4611.2 — les familles, MIROIR de ``WORK_FAMILIES`` (``work-progress.ts``) ; l'ordre est celui de la carte.
#: Lot L6 — ``laura_job`` (jobs en plusieurs étapes) et ``chat_research`` (recherches de conversation qui
#: tournent côté serveur, #4967 : seul « en cours » s'y mesure), ajoutées EN FIN.
FAMILIES: tuple[str, ...] = (
    "analysis",
    "import",
    "enrichment",
    "crm_sync",
    "catch_up",
    "laura_job",
    "chat_research",
)
COUNTERS: tuple[str, ...] = ("launched", "done", "failed", "running")

_LABELS: dict[str, dict[str, str]] = {
    "fr": {
        "analysis": "Analyses",
        "import": "Imports",
        "enrichment": "Enrichissements",
        "crm_sync": "Synchros CRM",
        "catch_up": "Rattrapages",
        "laura_job": "Jobs en plusieurs étapes",
        "chat_research": "Recherches en conversation",
        "launched": "Lancées",
        "done": "Rendues",
        "failed": "En erreur",
        "running": "En cours",
        "title": "Où en est le travail lancé · {days} derniers jours",
        "since": "depuis le {date}",
        "nothing": "Rien de lancé : {names}.",
        "unmeasured": "Non mesuré : {parts}.",
        "failures": "En erreur — {parts}.",
        "no_reason": "raison non fournie par la source",
    },
    "en": {
        "analysis": "Analyses",
        "import": "Imports",
        "enrichment": "Enrichments",
        "crm_sync": "CRM syncs",
        "catch_up": "Catch-ups",
        "laura_job": "Multi-step jobs",
        "chat_research": "Conversation searches",
        "launched": "Started",
        "done": "Done",
        "failed": "Failed",
        "running": "Running",
        "title": "Where the launched work stands · last {days} days",
        "since": "since {date}",
        "nothing": "Nothing started: {names}.",
        "unmeasured": "Not measured: {parts}.",
        "failures": "Failed — {parts}.",
        "no_reason": "no reason given by the source",
    },
}

_PARIS = ZoneInfo("Europe/Paris")
_NOTE_MAX = 300


def _labels(language: str | None) -> dict[str, str]:
    return _LABELS["en" if (language or "").lower().startswith("en") else "fr"]


def _short_date(iso: object, language: str | None) -> str | None:
    if not isinstance(iso, str) or not iso:
        return None
    try:
        moment = datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(_PARIS)
    except ValueError:
        return None
    return moment.strftime("%m/%d") if (language or "").lower().startswith("en") else moment.strftime("%d/%m")


# ── L'outil ──────────────────────────────────────────────────────────────────

_UNKNOWN_MESSAGE = (
    "La lecture de l'avancement n'a pas répondu à temps : je ne sais pas où en est le travail. "
    "Ce n'est pas un échec du travail — c'est ma lecture qui manque."
)
_UNREADABLE_MESSAGE = "Je n'ai pas pu lire l'avancement du travail lancé depuis ici : je ne te raconte rien de mémoire."


def _counter_value(counter: object) -> int | None:
    """#4611.5 — un compteur MESURÉ rend son nombre ; tout le reste (non mesuré, forme inattendue) rend
    ``None``. Jamais « 0 » par défaut."""
    if isinstance(counter, Mapping) and counter.get("measured") is True:
        value = counter.get("value")
        if isinstance(value, int) and not isinstance(value, bool) and value >= 0:
            return value
    return None


def _unmeasured_reason(counter: object) -> str | None:
    if isinstance(counter, Mapping) and counter.get("measured") is False:
        reason = counter.get("reasonLabel") or counter.get("reason")
        return str(reason) if reason else "non mesuré"
    return None


def _family_of(raw: Mapping[str, Any], language: str | None) -> dict[str, Any] | None:
    family = raw.get("family")
    counters = raw.get("counters")
    if family not in FAMILIES or not isinstance(counters, Mapping):
        return None
    labels = _labels(language)
    values = {name: _counter_value(counters.get(name)) for name in COUNTERS}
    unmeasured = {
        name: reason
        for name in COUNTERS
        if values[name] is None and (reason := _unmeasured_reason(counters.get(name))) is not None
    }
    # Une forme que l'API n'a pas tenue (compteur absent) reste NOMMÉE non mesurée, jamais comptée.
    for name in COUNTERS:
        if values[name] is None and name not in unmeasured:
            unmeasured[name] = "non mesuré"
    failures = []
    for failure in raw.get("failures") or []:
        if not isinstance(failure, Mapping):
            continue
        reason = failure.get("reason")
        failures.append(
            {
                "label": str(failure.get("label") or "")[:120],
                # #4611.6 — la raison TELLE QUE LA SOURCE L'A DONNÉE ; absente ⇒ ``None``, jamais devinée.
                "reason": str(reason)[:300] if isinstance(reason, str) and reason.strip() else None,
                "at": failure.get("at") if isinstance(failure.get("at"), str) else None,
            }
        )
    return {
        "family": family,
        "label": labels[family],
        "counters": values,
        "unmeasured": unmeasured,
        "since": raw.get("since") if isinstance(raw.get("since"), str) else None,
        "last_activity_at": raw.get("lastActivityAt") if isinstance(raw.get("lastActivityAt"), str) else None,
        "failures": failures,
    }


async def execute_get_work_progress(tool_input: Mapping[str, Any] | None, *, user_id: str) -> dict[str, Any]:
    """Lit l'avancement via le pont API — une LECTURE. Jamais un chiffre inventé : tout échec rend une erreur claire."""
    from app.services import bellum_api

    raw_lot = (tool_input or {}).get("lot_id")
    lot_id = str(raw_lot).strip() if raw_lot else None
    # Un identifiant mal formé n'atteint jamais l'API : le modèle ne devine pas un lot.
    if lot_id and not _UUID.match(lot_id):
        return {"error": "Ce lot n'est pas un identifiant lu dans ce fil : je ne devine pas de lot."}
    if not bellum_api.is_configured():
        return {"error": _UNREADABLE_MESSAGE}

    data, failure = await bellum_api.work_progress(user_id, lot_id=lot_id)
    if failure == "timeout":
        # #4611.7 — un délai dépassé n'est PAS un échec : on ne sait pas. ``retryable: False`` arrête la reprise.
        return {"error": _UNKNOWN_MESSAGE, "outcome": "unknown", "retryable": False}
    if failure is not None or data is None:
        return {"error": _UNREADABLE_MESSAGE}

    if data.get("kind") == "lot_unknown":
        # #4611.8 — aucun chiffre, aucune différence entre « absent » et « d'un autre espace ».
        return {
            "status": "lot_unknown",
            "lot_id": lot_id,
            "message": "Ce lot est inconnu dans ton périmètre : je n'en lis aucun chiffre.",
        }
    if data.get("kind") != "progress":
        return {"error": _UNREADABLE_MESSAGE}

    families = [
        built for raw in data.get("families") or [] if isinstance(raw, Mapping) and (built := _family_of(raw, None))
    ]
    if not families:
        return {"error": _UNREADABLE_MESSAGE}
    return {
        "status": "progress",
        "read_at": data.get("readAt") if isinstance(data.get("readAt"), str) else None,
        "window_days": data.get("windowDays") if isinstance(data.get("windowDays"), int) else None,
        "families": families,
    }


# ── La carte (#4611.3) ───────────────────────────────────────────────────────


def _is_measured_nothing(family: Mapping[str, Any]) -> bool:
    """Une famille dont TOUS les compteurs sont mesurés et à zéro : rien n'a été lancé. Elle ne fait pas de
    ligne (« on n'affiche pas ce qu'on n'a pas ») — l'absence se nomme dans la note."""
    counters = family["counters"]
    return all(counters[name] == 0 for name in COUNTERS)


def _cut(segments: list[str], limit: int) -> str:
    kept: list[str] = []
    for segment in segments:
        if len(" ".join([*kept, segment])) > limit:
            break
        kept.append(segment)
    return " ".join(kept)


def progress_block_from_output(output: object, *, language: str | None = None) -> dict | None:
    """La carte `comparison` bâtie du SEUL résultat de l'outil : une ligne par famille, quatre colonnes, une
    case non mesurée VIDE (jamais « 0 »). ``None`` : pas une lecture réussie, ou rien à montrer."""
    if not isinstance(output, Mapping) or output.get("error") or output.get("status") != "progress":
        return None
    labels = _labels(language)
    families = [f for f in output.get("families") or [] if isinstance(f, Mapping) and f.get("family") in FAMILIES]
    rows: list[dict[str, Any]] = []
    nothing: list[str] = []
    unmeasured: list[str] = []
    failures: list[str] = []
    for family in families:
        name = labels[str(family["family"])]
        if _is_measured_nothing(family):
            nothing.append(name)
            continue
        counters = family["counters"]
        label = name
        since = _short_date(family.get("since"), language)
        if since:
            label = f"{name} · {labels['since'].format(date=since)}"
        rows.append(
            {
                "label": label[:80],
                # #4611.5 — ``None`` ⇒ case vide ⇒ « Non mesuré » à l'écran ; un vrai 0 mesuré reste « 0 ».
                "cells": [None if counters[c] is None else str(counters[c]) for c in COUNTERS],
            }
        )
        missing = family.get("unmeasured") or {}
        if missing:
            columns = ", ".join(labels[c].lower() for c in COUNTERS if c in missing)
            reasons = sorted({str(r) for r in missing.values()})
            unmeasured.append(f"{name} ({columns} — {' ; '.join(reasons)})")
        for failure in family.get("failures") or []:
            # Recette prod 31/10 : « Relancez-la.. » — la raison de la source finit souvent par un point,
            # la phrase de la carte en ajoute un : celui de la source tombe (le texte, lui, est intact).
            reason = str(failure.get("reason") or labels["no_reason"]).rstrip(" .")
            failures.append(f"{failure.get('label') or name} : {reason}")
    if not rows:
        return None
    segments = [
        labels["failures"].format(parts=" ; ".join(failures)) if failures else "",
        labels["unmeasured"].format(parts=" ; ".join(unmeasured)) if unmeasured else "",
        labels["nothing"].format(names=", ".join(nothing)) if nothing else "",
    ]
    note = _cut([s for s in segments if s], _NOTE_MAX)
    days = output.get("window_days")
    block: dict[str, Any] = {
        "type": "comparison",
        "title": labels["title"].format(days=days if isinstance(days, int) else 7),
        "columns": [labels[c] for c in COUNTERS],
        "rows": rows,
    }
    if note:
        block["note"] = note
    try:
        return validate_reply_block(block)
    except ValueError:
        return None


def with_progress_card(reply: str, block: Mapping[str, Any]) -> str:
    """La carte de l'outil FAIT FOI : une `comparison` que le modèle aurait écrite lui-même (avec ses propres
    chiffres) est remplacée, jamais doublée — rien n'apparaît deux fois sous la même forme (GA-26)."""
    import json

    kept = [
        segment
        for segment in split_reply_blocks(reply)
        if not (segment.kind == "block" and segment.block and segment.block.get("type") == "comparison")
    ]
    parts: list[str] = []
    for segment in kept:
        if segment.kind == "text":
            parts.append(segment.text)
        elif segment.block:
            parts.append(f"```{REPLY_BLOCK_FENCE}\n{json.dumps(segment.block, ensure_ascii=False)}\n```")
    parts.append(f"```{REPLY_BLOCK_FENCE}\n{json.dumps(dict(block), ensure_ascii=False)}\n```")
    return "\n\n".join(part for part in parts if part.strip())


# ── La demande, et le refus (#4611.10) ───────────────────────────────────────

_PROGRESS_PHRASE = re.compile(
    r"\boù\s+en\s+(?:est|sont|sommes)\b|\bou\s+en\s+(?:est|sont)\b|\bavancement\b|(?<!l')(?<!l’)\bavance(?:nt)?\b|\bprogress(?:ion)?\b",
    re.IGNORECASE,
)
#: Ce dont on demande l'état : du TRAVAIL lancé. « où en est ce compte / ce deal » est une autre question.
_WORK_NOUN = re.compile(
    r"\b(?:analyses?|imports?|enrichissements?|synchro(?:nisation)?s?|rattrapages?|lots?|traitements?|travail|"
    r"travaux|cartes?|cartographie|jobs?|lanc[ée]e?s?|l'ensemble|recherches?)\b",
    re.IGNORECASE,
)


def _fold(text: str) -> str:
    return unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode("ascii").lower()


def asks_work_progress(user_message: str | None) -> bool:
    """« où en sont les 15 analyses lancées », « où en est la carte », « comment avance l'ensemble » : la
    demande a la forme d'un POINT D'AVANCEMENT *et* porte sur du travail lancé. L'un sans l'autre n'en est
    pas une (« où en est le deal Thales » est une question de pipe)."""
    text = (user_message or "").strip()
    if not text:
        return False
    folded = _fold(text)
    return bool(_PROGRESS_PHRASE.search(text) or _PROGRESS_PHRASE.search(folded)) and bool(
        _WORK_NOUN.search(text) or _WORK_NOUN.search(folded)
    )


def progress_answer_gate(
    user_message: str | None, *, read: Mapping[str, Any] | None, language: str | None = None
) -> str | None:
    """#4611.10 — LA GARDE QUI SAIT DIRE NON. Une question d'avancement sans lecture réussie ne reçoit PAS de
    récit : elle reçoit la phrase qui dit qu'on n'a pas pu lire (ou qu'on ne sait pas, si la lecture n'a pas
    répondu à temps — sans inviter à relancer). ``None`` : la réponse peut partir (autre question, ou lecture
    réussie — y compris « lot inconnu », qui est une réponse)."""
    if not asks_work_progress(user_message):
        return None
    if read is None:
        return _UNREADABLE_MESSAGE
    if read.get("outcome") == "unknown":
        return _UNKNOWN_MESSAGE
    if read.get("error"):
        return _UNREADABLE_MESSAGE
    return None
