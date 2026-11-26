"""#4064 / #4065 — les LISTINGS de Laura : une fenêtre (passée ou à venir), une source branchée.

#4064 (recette prod 12/10) — « sur les 3 derniers mois, liste les personnes avec qui j'ai eu une
réunion » rendait « l'agenda n'a pas répondu » sur un agenda branché. Cause : le contrat
`agendaRangeRequestSchema` ne lisait que des bornes en `Z` ; Laura écrit l'heure de Paris
(`…T00:00:00+02:00`) → HTTP 400 au pont → `None` → la phrase générique. Ce module :

- normalise les bornes en UTC avant l'appel (date seule, heure locale, décalage) ;
- lit une longue fenêtre PAR TRANCHES (31 jours, coupées en deux quand une tranche remplit la page) ;
- dit le total lu, et ce qui n'a PAS été lu (agenda muet nommé, tranche en échec avec sa raison).

Rien ici ne parle à un fournisseur : chaque lecture passe par le pont (`bellum_api`), la même que
les autres outils de Laura — jamais un second client parallèle.
"""

from __future__ import annotations

import asyncio
import re
from contextvars import ContextVar
from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from app.models.reply_blocks import validate_reply_block
from app.services import bellum_api
from app.services.chat_requested_mode import current_connected_families

#: L'heure d'une date sans fuseau : celle du produit (ESN françaises). Un `Z` ou un décalage
#: écrit par le modèle prime toujours.
_LOCAL_TZ = ZoneInfo("Europe/Paris")

#: Une tranche d'agenda : un mois. Plus court qu'une fenêtre de trimestre, donc une lecture
#: fournisseur courte (le pont coupe à 12 s).
AGENDA_SLICE_DAYS = 31
#: La page maximale du contrat (`agendaRangeRequestSchema.limit` ≤ 250).
AGENDA_PAGE = 250
#: Plafond de lectures pour UNE fenêtre : au-delà, la fenêtre est dite incomplète, jamais
#: présentée comme lue.
AGENDA_MAX_READS = 16
#: Plus petite tranche qu'on coupe encore en deux (une heure).
_MIN_SPLIT = timedelta(hours=1)
#: Fenêtre la plus large acceptée (un peu plus d'un an).
MAX_WINDOW_DAYS = 400

# #4065 (R20) — « 131 lignes retournées » mais UNE seule rendue : la carte du listing était recopiée par le
# modèle, qui en abrégeait les lignes. La carte VALIDÉE de l'outil est mémorisée pour ce tour (un porteur
# MUTÉ, car les outils tournent dans des tâches filles) et remplace, dans la réponse finale, toute carte
# `file_export` plus courte — ou s'ajoute quand le modèle n'en a posé aucune.
_TURN_LISTING_CARDS: ContextVar[list[dict[str, Any]] | None] = ContextVar("turn_listing_cards", default=None)


#: #4563.1 — ce que la recherche d'offres a répondu CE tour (``count`` offres, ``summary`` ce qui a été cherché).
_TURN_OFFERS_OUTCOME: ContextVar[list[dict[str, Any]] | None] = ContextVar("turn_offers_outcome", default=None)


def begin_turn_listing() -> None:
    _TURN_LISTING_CARDS.set([])
    _TURN_OFFERS_OUTCOME.set([])


def remember_offers_outcome(count: int, summary: str) -> None:
    holder = _TURN_OFFERS_OUTCOME.get()
    if holder is not None:
        holder.append({"count": count, "summary": summary})


def remember_listing_card(card: dict[str, Any]) -> None:
    _remember_listing_card(card)


def _remember_listing_card(card: dict[str, Any]) -> None:
    holder = _TURN_LISTING_CARDS.get()
    if holder is not None:
        holder.append(card)


# #4563.1 — la demande d'offres rend les offres, jamais une justification : « suffisamment nombreuses pour ne pas
# élargir » affirme une donnée que l'écran ne porte pas, et Laura AGIT au lieu de justifier un non-élargissement.
_OFFERS_JUSTIFICATION = re.compile(
    r"(?=[^.!?]*\boffres?\b)[^.!?]*("
    r"(?:suffisamment|assez)\s+(?:nombreu\w+|d['’]offres)"
    r"|(?:ne\s+pas|pas\s+besoin\s+d['’]?|inutile\s+d['’]?|n['’]|plus\s+besoin\s+d['’]?)\s*élarg\w*"
    r"|je\s+n['’]élarg\w*"
    r")[^.!?]*[.!?]?",
    re.IGNORECASE,
)
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+")


def _drop_offers_justification(text: str) -> tuple[str, bool]:
    kept = [s for s in _SENTENCE_END.split(text) if s and not _OFFERS_JUSTIFICATION.fullmatch(s.strip())]
    dropped = len(kept) != len([s for s in _SENTENCE_END.split(text) if s])
    return " ".join(kept).strip() if dropped else text, dropped


def drop_offers_justification(reply: str) -> str:
    """#4563.1 — la phrase de justification ne sort JAMAIS, offre listée ou non. Zéro offre lue : la réponse DIT
    que rien n'a été trouvé et où la recherche est allée (le ``summary`` de l'outil), jamais « assez nombreuses »."""
    from app.services.reply_blocks import _fence, split_reply_blocks

    segments = split_reply_blocks(reply)
    if any(s.kind not in ("text", "block") for s in segments):
        return reply
    dropped_any = False
    parts: list[str] = []
    for segment in segments:
        if segment.kind == "block":
            parts.append(_fence(segment.block or {}))
            continue
        text, dropped = _drop_offers_justification(segment.text)
        dropped_any = dropped_any or dropped
        parts.append(text)
    if not dropped_any:
        return reply
    outcomes = _TURN_OFFERS_OUTCOME.get() or []
    last = outcomes[-1] if outcomes else None
    if last is not None and last["count"] == 0 and last["summary"] not in "".join(parts):
        parts.append(last["summary"])
    return "\n\n".join(part for part in parts if part)


def graft_listing_cards(reply: str) -> str:
    """Rend la réponse avec la carte COMPLÈTE de l'outil à la place d'une copie tronquée."""
    reply = drop_offers_justification(reply)
    cards = _TURN_LISTING_CARDS.get()
    if not cards:
        return reply
    from app.services.reply_blocks import _fence, split_reply_blocks

    segments = split_reply_blocks(reply)
    remaining = list(cards)
    parts: list[str] = []
    for segment in segments:
        if segment.kind == "block" and (segment.block or {}).get("type") == "file_export":
            seen = len(segment.block["rows"])
            full = next(
                (c for c in remaining if len(c["rows"]) > seen and c["columns"] == segment.block["columns"]), None
            )
            if full is not None:
                remaining.remove(full)
                parts.append(_fence(full))
                continue
            remaining = [c for c in remaining if c["columns"] != segment.block["columns"] or len(c["rows"]) > seen]
            parts.append(_fence(segment.block))
        elif segment.kind == "text":
            parts.append(_drop_pipe_tables(segment.text))
        elif segment.kind == "block":
            parts.append(_fence(segment.block or {}))
        else:
            return reply
    for card in remaining:
        if not any(
            s.kind == "block" and (s.block or {}).get("type") == "file_export" and s.block["columns"] == card["columns"]
            for s in segments
        ):
            parts.append(_fence(card))
    return "\n\n".join(part for part in parts if part)


_TABLE_SEPARATOR = re.compile(r"^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$")


def _drop_pipe_tables(text: str) -> str:
    """#4288.5 — un tableau Markdown écrit à côté de la carte du listing la DOUBLE : seule la carte reste.
    Appelée uniquement quand le tour porte une carte de listing ; un tableau sans carte n'est jamais touché."""
    lines = text.split("\n")
    kept: list[str] = []
    i = 0
    while i < len(lines):
        if lines[i].lstrip().startswith("|") and i + 1 < len(lines) and _TABLE_SEPARATOR.match(lines[i + 1]):
            i += 2
            while i < len(lines) and lines[i].lstrip().startswith("|"):
                i += 1
            continue
        kept.append(lines[i])
        i += 1
    return "\n".join(kept).strip("\n")


_DATE_ONLY = re.compile(r"^\d{4}-\d{2}-\d{2}$")

_PROVIDER_LABELS = {"google": "Google Agenda", "microsoft": "Outlook"}


def _utc_iso(moment: datetime) -> str:
    return moment.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_bound(raw: Any, *, end: bool) -> datetime | None:
    """Une borne écrite par le modèle → un instant UTC. `None` si vide.

    Date seule : début du jour (ou, pour une FIN, le début du lendemain — « jusqu'au 12 octobre »
    inclut le 12). Heure sans fuseau : heure de Paris. Lève `ValueError` si illisible."""
    text = str(raw or "").strip()
    if not text:
        return None
    if _DATE_ONLY.match(text):
        day = date.fromisoformat(text)
        if end:
            day = day + timedelta(days=1)
        return datetime(day.year, day.month, day.day, tzinfo=_LOCAL_TZ).astimezone(UTC)
    parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=_LOCAL_TZ)
    return parsed.astimezone(UTC)


def resolve_window(
    from_raw: Any,
    to_raw: Any,
    *,
    now: datetime | None = None,
    default_forward_days: int = 7,
) -> tuple[datetime, datetime] | str:
    """La fenêtre demandée, bornée — ou la phrase qui dit pourquoi elle ne se lit pas."""
    current = now or datetime.now(UTC)
    try:
        start = parse_bound(from_raw, end=False)
        stop = parse_bound(to_raw, end=True)
    except ValueError:
        return "Les dates de la période sont illisibles : écris-les au format AAAA-MM-JJ."
    if start is None and stop is None:
        start, stop = current, current + timedelta(days=default_forward_days)
    elif start is None:
        assert stop is not None
        start = min(current, stop - timedelta(days=default_forward_days))
    elif stop is None:
        # Une fenêtre qui commence dans le passé s'arrête à maintenant (« depuis septembre »).
        stop = current if start < current else start + timedelta(days=default_forward_days)
    if stop <= start:
        return "La fin de la période doit être postérieure à son début."
    if stop - start > timedelta(days=MAX_WINDOW_DAYS):
        return f"La période dépasse {MAX_WINDOW_DAYS} jours : découpe-la."
    return start, stop


def window_label(start: datetime, stop: datetime) -> dict[str, str]:
    """La fenêtre NOMMÉE (jours locaux, fin incluse) — ce que la carte affiche."""
    last = (stop - timedelta(seconds=1)).astimezone(_LOCAL_TZ).date()
    return {"from": start.astimezone(_LOCAL_TZ).date().isoformat(), "to": last.isoformat()}


def _agenda_name(entry: dict[str, Any]) -> str:
    provider = _PROVIDER_LABELS.get(str(entry.get("provider") or ""), "ton agenda")
    calendar = str(entry.get("calendarName") or "").strip()
    return f"{provider} « {calendar} »" if calendar else provider


def agenda_failure_sentence(reason: str | None, message: str | None) -> str:
    """#4064 — la RAISON d'un agenda qui n'a rien rendu, en phrase — jamais « n'a pas répondu »
    générique. La phrase de l'API (« Aucun agenda connecté. », accès éteint côté fournisseur…)
    passe telle quelle : c'est elle qui sait."""
    if message:
        return message
    if reason == "not_configured":
        return "L'agenda n'est pas branché sur ce service."
    if reason == "unreachable":
        return "Ton agenda n'a pas répondu à temps (délai dépassé)."
    if reason in ("http_401", "http_403"):
        return "Ton agenda refuse la lecture : le droit d'accès a expiré, reconnecte-le dans Réglages › Intégrations."
    if reason == "http_400":
        return "Ton agenda n'est pas connecté ou ne donne pas accès à la lecture : vérifie Réglages › Intégrations."
    if reason == "http_429":
        return "Ton agenda limite le nombre de lectures : réessaie dans une minute."
    return "Ton agenda a renvoyé une erreur (indisponible côté fournisseur)."


async def read_agenda_window(
    user_id: str,
    start: datetime,
    stop: datetime,
    *,
    query: str | None = None,
) -> dict[str, Any]:
    """Toute la fenêtre, par tranches. Rend :

    - ``events`` : dédoublonnés par identifiant, triés, annulés exclus ;
    - ``events_read`` : le nombre EXACT de rendez-vous lus ;
    - ``unavailable`` : les agendas muets, NOMMÉS (« Google Agenda « Équipe » ») ;
    - ``unread_periods`` : les tranches non lues, avec leur raison ;
    - ``error`` : seulement si RIEN n'a été lu — la raison, nommée.
    """
    pending: list[tuple[datetime, datetime]] = []
    cursor = start
    while cursor < stop:
        upper = min(stop, cursor + timedelta(days=AGENDA_SLICE_DAYS))
        pending.append((cursor, upper))
        cursor = upper

    by_id: dict[str, dict[str, Any]] = {}
    unavailable: dict[str, dict[str, Any]] = {}
    unread: list[dict[str, str]] = []
    reads = 0
    answered = 0
    last_failure: tuple[str | None, str | None] = (None, None)

    while pending:
        if reads >= AGENDA_MAX_READS:
            for lower, upper in pending:
                unread.append({**window_label(lower, upper), "reason": "Plafond de lecture atteint sur cette période."})
            break
        lower, upper = pending.pop(0)
        reads += 1
        data, reason, message = await bellum_api.agenda_window(
            user_id, from_iso=_utc_iso(lower), to_iso=_utc_iso(upper), query=query, limit=AGENDA_PAGE
        )
        if data is None:
            last_failure = (reason, message)
            unread.append({**window_label(lower, upper), "reason": agenda_failure_sentence(reason, message)})
            continue
        events = [e for e in (data.get("events") or []) if isinstance(e, dict)]
        if len(events) >= AGENDA_PAGE and upper - lower > _MIN_SPLIT:
            # La page est pleine : il y en a peut-être d'autres. On coupe la tranche en deux et on
            # relit — jamais une page pleine présentée comme toute la tranche.
            middle = lower + (upper - lower) / 2
            pending[0:0] = [(lower, middle), (middle, upper)]
            continue
        answered += 1
        for event in events:
            key = str(event.get("id") or "") or f"{event.get('start')}|{event.get('summary')}"
            by_id.setdefault(key, event)
        for entry in data.get("unavailable") or []:
            if isinstance(entry, dict):
                name = _agenda_name(entry)
                unavailable.setdefault(name, {"agenda": name, "reason": str(entry.get("reason") or "")})

    kept = sorted(
        (e for e in by_id.values() if not e.get("cancelled")),
        key=lambda e: str(e.get("start") or "9999"),
    )
    out: dict[str, Any] = {
        "events": kept,
        "events_read": len(kept),
        "unavailable": list(unavailable.values()),
        "unread_periods": unread,
    }
    if not answered:
        out["error"] = agenda_failure_sentence(*last_failure)
    return out


# ── #4065 — `list_records` : un listing générique, toutes sources branchées ────────────────────
#
# Chaque source réutilise la lecture EXISTANTE du pont (agenda par tranches ci-dessus, recherche de
# messagerie, liste Contacts, répertoire des comptes, besoins, vivier, missions, instantané ATS) —
# jamais un second client. Ce qui sort d'une messagerie : qui, quand, objet. JAMAIS le corps.

LIST_SOURCES: tuple[str, ...] = (
    "agenda",
    "mailbox",
    "contacts",
    "accounts",
    "needs",
    "consultants",
    "missions",
    "ats",
    "crm",
)

SOURCE_LABELS: dict[str, str] = {
    "agenda": "Agenda",
    "mailbox": "Messagerie",
    "contacts": "Contacts de l'espace",
    "accounts": "Comptes de l'espace",
    "needs": "Besoins de l'espace",
    "consultants": "Vivier de consultants",
    "missions": "Missions de l'espace",
    "ats": "ATS",
    "crm": "CRM",
}

#: La famille d'outil (« Outils et sources ») qu'exige une source EXTERNE. Les sources de la base
#: Bellum n'exigent rien.
SOURCE_FAMILY: dict[str, str] = {"agenda": "calendar", "mailbox": "email", "ats": "ats", "crm": "crm"}

#: Le tri messagerie (métadonnées seules) → l'intention de recherche du pont.
MAIL_FILTERS: dict[str, str] = {
    "all": "free",
    "awaiting_reply": "no_reply",
    "meeting": "meeting",
    "positive_reply": "positive_reply",
    "unread": "unread",
}

# #4065.9 — `interviewed_candidates` et `ended_missions` sont des fenêtres PASSÉES.
ATS_LISTS: tuple[str, ...] = (
    "ending_missions",
    "benched_consultants",
    "open_needs",
    "interviewed_candidates",
    "ended_missions",
)
ATS_PAST_LISTS: frozenset[str] = frozenset({"interviewed_candidates", "ended_missions"})

#: #4065.8 — les affaires du CRM qu'on liste : perdues, gagnées, ou les deux (jamais les ouvertes).
DEAL_OUTCOMES: tuple[str, ...] = ("lost", "won", "closed")

#: La carte `file_export` accepte 200 lignes au plus (`reply-blocks.ts`).
MAX_ROWS = 200
#: Une page de la liste Contacts / Comptes du pont (`limit` ≤ 25) et le nombre de pages lues.
_PAGE = 25
_MAX_PAGES = 8
#: Le croisement interroge une source PAR société ou PAR personne : borné, le reste est NOMMÉ.
CROSS_MAX = 20

_FREE_MAIL_DOMAINS = frozenset(
    {
        "gmail.com",
        "googlemail.com",
        "hotmail.com",
        "hotmail.fr",
        "outlook.com",
        "outlook.fr",
        "live.fr",
        "yahoo.com",
        "yahoo.fr",
        "icloud.com",
        "me.com",
        "orange.fr",
        "free.fr",
        "sfr.fr",
        "laposte.net",
        "wanadoo.fr",
        "proton.me",
        "protonmail.com",
    }
)

# #4065.1 — l'outil : choisi pour « liste-moi… », « donne-moi tous les… ».
LIST_RECORDS_TOOL: dict[str, Any] = {
    "name": "list_records",
    "description": (
        "Dresse une LISTE exploitable (tableau + export CSV) depuis UNE source branchée, sur une "
        "période PASSÉE ou À VENIR. À utiliser pour « liste-moi… », « donne-moi tous les… », « fais-moi "
        "la liste de… » : « les personnes que j'ai rencontrées ces 3 derniers mois » (source agenda, "
        "group_by person), « les contacts à qui j'ai écrit depuis septembre sans réponse » (mailbox, "
        "mail_filter awaiting_reply), « tous mes contacts chez ACME » (contacts), « mes comptes du "
        "secteur banque » (accounts), « les besoins ouverts » (needs), « mes consultants Java » "
        "(consultants), « les missions qui finissent d'ici décembre » (missions), « les consultants "
        "sans mission dans l'ATS » (ats), « mes comptes du CRM sans activité depuis 3 mois » (crm, "
        "inactive_since), « les affaires perdues en 2026 et leur interlocuteur » (crm, deal_outcome "
        "lost + période), « les candidats vus en entretien ce trimestre » (ats, ats_list "
        "interviewed_candidates), « les missions terminées ce trimestre » (missions ou ats ended_missions, "
        "période passée). CROISEMENT : « rencontrées en réunion ET absentes du CRM » = "
        "source agenda + cross {source: crm, mode: absent} ; « … absentes de ma base » = cross "
        "{source: contacts}. La période s'écrit en dates (AAAA-MM-JJ) : « 3 derniers mois » = from_iso "
        "il y a 3 mois, to_iso aujourd'hui. Recopie TELLE QUELLE la carte `file_export` rendue dans "
        "`card` (colonnes déjà choisies, export CSV inclus), puis dis en une phrase la source, la "
        "période et le total lu (`records_read`). Une source rendue dans `absent_sources` n'est PAS "
        "branchée ou est décochée pour ce fil : dis-le, ne dis JAMAIS « 0 ». `unread_periods` et "
        "`unavailable` se nomment aussi. Le contenu des messages n'est jamais lu : seulement qui, "
        "quand, objet."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "source": {"type": "string", "enum": list(LIST_SOURCES), "description": "La source à lister."},
            "from_iso": {"type": "string", "description": "Début de période (AAAA-MM-JJ ou ISO 8601)."},
            "to_iso": {"type": "string", "description": "Fin de période, incluse (AAAA-MM-JJ ou ISO 8601)."},
            "query": {"type": "string", "description": "Filtre texte (nom, société, domaine, mot de l'objet)."},
            "group_by": {
                "type": "string",
                "enum": ["none", "person", "company"],
                "description": "Une ligne par élément (none), par PERSONNE dédoublonnée, ou par SOCIÉTÉ.",
            },
            "mail_filter": {
                "type": "string",
                "enum": list(MAIL_FILTERS),
                "description": "Messagerie seulement : tous les fils, sans réponse, réunions, réponses favorables, non lus.",
            },
            "ats_list": {
                "type": "string",
                "enum": list(ATS_LISTS),
                "description": (
                    "ATS seulement : missions qui se terminent, consultants sans mission, besoins ouverts, "
                    "candidats vus en entretien (période passée), missions terminées (période passée)."
                ),
            },
            "deal_outcome": {
                "type": "string",
                "enum": list(DEAL_OUTCOMES),
                "description": (
                    "CRM seulement : liste les AFFAIRES perdues (lost), gagnées (won) ou les deux (closed) "
                    "avec leur interlocuteur ; la période filtre sur la date de clôture."
                ),
            },
            "inactive_since": {
                "type": "string",
                "description": (
                    "CRM seulement : AAAA-MM-JJ — garde les comptes dont la dernière activité CRM est "
                    "ANTÉRIEURE à cette date (« sans activité depuis 3 mois » = il y a 3 mois), ou sans "
                    "activité tracée."
                ),
            },
            "include_internal": {
                "type": "boolean",
                "description": "Agenda : inclure les participants internes (défaut : externes seuls).",
            },
            "cross": {
                "type": "object",
                "description": "Croiser la liste avec une autre source : garder ce qui y est ABSENT ou PRÉSENT.",
                "properties": {
                    "source": {"type": "string", "enum": ["crm", "contacts"]},
                    "mode": {"type": "string", "enum": ["absent", "present"]},
                },
                "required": ["source"],
            },
        },
        "required": ["source"],
    },
}


def _record(
    *,
    person: Any = None,
    email: Any = None,
    company: Any = None,
    at: Any = None,
    label: Any = None,
    detail: Any = None,
    extra: Any = None,
) -> dict[str, str | None]:
    def text(value: Any) -> str | None:
        cleaned = str(value).strip() if value is not None and not isinstance(value, bool) else ""
        return cleaned[:200] or None

    return {
        "person": text(person),
        "email": (text(email) or "").lower() or None,
        "company": text(company),
        "date": text(at),
        "label": text(label),
        "detail": text(detail),
        "extra": text(extra),
    }


def _domain_of(email: str | None) -> str | None:
    if not email or "@" not in email:
        return None
    domain = email.rsplit("@", 1)[1].strip().lower()
    return None if not domain or domain in _FREE_MAIL_DOMAINS else domain


def _split_address(raw: Any) -> tuple[str | None, str | None]:
    """« Claire Martin <claire@acme.fr> » → (nom, e-mail). Une adresse seule → (None, e-mail)."""
    text = str(raw or "").strip()
    match = re.match(r"^\s*\"?([^\"<]*?)\"?\s*<([^>]+)>\s*$", text)
    if match:
        return (match.group(1).strip() or None), match.group(2).strip().lower()
    return (None, text.lower()) if "@" in text else ((text or None), None)


def _day(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(_LOCAL_TZ).date().isoformat()
    except ValueError:
        return value[:10]


def _fetched(**kwargs: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "records": [],
        "records_read": 0,
        "records_total": None,
        "complete": True,
        "window_applies": True,
        "notes": [],
        "unavailable": [],
        "unread_periods": [],
        "error": None,
    }
    base.update(kwargs)
    return base


# #4065.2 — une lecture par source, la MÊME que les autres outils de Laura (pont copilot).
async def _fetch_agenda(
    user_id: str, window: tuple[datetime, datetime], query: str | None, include_internal: bool
) -> dict[str, Any]:
    read = await read_agenda_window(user_id, *window, query=query)
    if read.get("error"):
        return _fetched(error=read["error"])
    records: list[dict[str, str | None]] = []
    without_person = 0
    for event in read["events"]:
        listed = 0
        for attendee in event.get("attendees") or []:
            if not isinstance(attendee, dict) or attendee.get("resource"):
                continue
            if not include_internal and not attendee.get("external"):
                continue
            listed += 1
            email = str(attendee.get("email") or "").strip().lower() or None
            records.append(
                _record(
                    person=attendee.get("displayName"),
                    email=email,
                    company=_domain_of(email),
                    at=_day(event.get("start")),
                    label=event.get("summary"),
                )
            )
        if not listed:
            without_person += 1
    note = f"{read['events_read']} rendez-vous lus sur la période."
    if without_person:
        # #4065.7 — un rendez-vous sans invité externe n'a aucune ligne : on le DIT, pour que le
        # tableau ne se lise pas « partiel » alors que la lecture est complète.
        note += f" Dont {without_person} sans invité externe (hors tableau, pas une lecture manquante)."
    return _fetched(
        records=records,
        records_read=read["events_read"],
        complete=not read["unread_periods"],
        unavailable=read["unavailable"],
        unread_periods=read["unread_periods"],
        notes=[note],
    )


async def _fetch_mailbox(
    user_id: str, window: tuple[datetime, datetime], query: str | None, mail_filter: str
) -> dict[str, Any]:
    start, stop = window
    now = datetime.now(UTC)
    if start >= now:
        return _fetched(error="La messagerie se lit vers le passé : choisis une période déjà écoulée.")
    window_days = max(1, min(365, -(-int((now - start).total_seconds()) // 86_400)))
    result = await bellum_api.search_mailbox(
        user_id, intent=MAIL_FILTERS.get(mail_filter, "free"), query=query, window_days=window_days, limit=100
    )
    if result is None:
        return _fetched(error="Ta messagerie n'a pas répondu ou n'est pas connectée : aucun fil n'a été lu.")
    records: list[dict[str, str | None]] = []
    threads = [t for t in (result.get("threads") or []) if isinstance(t, dict)]
    for thread in threads:
        last = str(thread.get("lastMessageAt") or "")
        try:
            moment = datetime.fromisoformat(last.replace("Z", "+00:00")) if last else None
        except ValueError:
            moment = None
        if moment is not None and moment.tzinfo is None:
            moment = moment.replace(tzinfo=UTC)
        if moment is not None and not (start <= moment < stop):
            continue
        name, email = _split_address(thread.get("counterpart"))
        account = thread.get("account") if isinstance(thread.get("account"), dict) else {}
        # Métadonnées SEULES : qui, quand, objet, état. Jamais un extrait ni un corps.
        records.append(
            _record(
                person=name,
                email=email,
                company=account.get("name") or _domain_of(email),
                at=_day(last or None),
                label=thread.get("subject"),
                detail="Sans réponse" if thread.get("awaitingReply") else None,
            )
        )
    truncated = bool(result.get("truncated"))
    notes = [f"{len(threads)} fils lus sur la période."]
    if truncated:
        notes.append("La messagerie a rendu ses 100 fils les plus récents : la liste n'est pas complète.")
    return _fetched(records=records, records_read=len(threads), complete=not truncated, notes=notes)


async def _paged(fetch: Any, key: str, query: str | None) -> tuple[list[dict[str, Any]], int | None, bool] | None:
    """Les pages successives d'une liste du pont (`limit` 25, `offset`), jusqu'à `MAX_ROWS`."""
    rows: list[dict[str, Any]] = []
    total: int | None = None
    for page in range(_MAX_PAGES):
        result = await fetch(query=query, list_all=query is None, offset=page * _PAGE, limit=_PAGE)
        if result is None:
            if not rows:
                return None
            return rows, total, False
        batch = [r for r in (result.get(key) or []) if isinstance(r, dict)]
        total = result.get("total") if isinstance(result.get("total"), int) else total
        rows.extend(batch)
        if len(batch) < _PAGE or (total is not None and len(rows) >= total) or query is not None:
            break
    complete = total is None or len(rows) >= total
    return rows, total, complete


async def _fetch_contacts(user_id: str, query: str | None) -> dict[str, Any]:
    async def fetch(**kw: Any) -> dict[str, Any] | None:
        return await bellum_api.workspace_contacts(
            user_id,
            query=kw["query"],
            company=None,
            role=None,
            limit=kw["limit"],
            list_all=kw["list_all"],
            offset=kw["offset"],
        )

    paged = await _paged(fetch, "contacts", query)
    if paged is None:
        return _fetched(error="La liste des contacts de l'espace n'a pas répondu.")
    rows, total, complete = paged
    records = [
        _record(
            person=r.get("full_name"),
            email=r.get("email"),
            company=r.get("company_name"),
            label=r.get("title"),
            detail=r.get("relationship_status"),
        )
        for r in rows
    ]
    return _fetched(
        records=records, records_read=total if total is not None else len(rows), complete=complete, window_applies=False
    )


async def _fetch_accounts(user_id: str, query: str | None) -> dict[str, Any]:
    async def fetch(**kw: Any) -> dict[str, Any] | None:
        return await bellum_api.workspace_accounts(
            user_id, query=kw["query"], sector=None, limit=kw["limit"], list_all=kw["list_all"], offset=kw["offset"]
        )

    paged = await _paged(fetch, "accounts", query)
    if paged is None:
        return _fetched(error="Le répertoire des comptes de l'espace n'a pas répondu.")
    rows, total, complete = paged
    records = [
        _record(
            company=r.get("company_name"),
            at=_day(r.get("last_analyzed_at")),
            label=r.get("sector"),
            detail=r.get("owner") if isinstance(r.get("owner"), str) else None,
        )
        for r in rows
    ]
    return _fetched(
        records=records,
        records_read=total if total is not None else len(rows),
        complete=complete,
        window_applies=False,
        notes=["Comptes déjà analysés de l'espace."],
    )


#: Comptes dont la présence CRM est lue pour un listing d'inactivité (une lecture PAR compte, bornée).
CRM_LIST_MAX = 60


async def _fetch_crm_inactive(user_id: str, cutoff: datetime, query: str | None) -> dict[str, Any]:
    """#4065 (recette R26) — les comptes de l'espace PRÉSENTS dans le CRM branché dont la dernière
    activité CRM précède `cutoff` (ou n'est pas tracée). Même lecture que le croisement : jamais un
    second client. Un compte non lu est NOMMÉ, jamais classé inactif."""
    paged = await _paged(
        lambda **kw: bellum_api.workspace_accounts(
            user_id, query=kw["query"], sector=None, limit=kw["limit"], list_all=kw["list_all"], offset=kw["offset"]
        ),
        "accounts",
        query,
    )
    if paged is None:
        return _fetched(error="Le répertoire des comptes de l'espace n'a pas répondu.")
    accounts, total, complete = paged
    names = list(dict.fromkeys(str(a.get("company_name")).strip() for a in accounts if a.get("company_name")))
    read, skipped = names[:CRM_LIST_MAX], names[CRM_LIST_MAX:]
    results = await asyncio.gather(
        *(bellum_api.crm_company_presence(user_id, company_name=n) for n in read), return_exceptions=True
    )
    sector_of = {str(a.get("company_name")).strip(): a.get("sector") for a in accounts}
    records: list[dict[str, str | None]] = []
    unchecked: list[str] = list(skipped)
    for name, res in zip(read, results, strict=True):
        if not isinstance(res, dict) or res.get("error"):
            unchecked.append(name)
            continue
        if res.get("connected") is False:
            return _fetched(error="Aucun CRM n'est branché pour ton espace : je ne peux pas lire l'activité.")
        if not res.get("matched"):
            continue
        try:
            last = parse_bound(res.get("lastActivityAt"), end=False)
        except ValueError:
            unchecked.append(name)
            continue
        if last is not None and last >= cutoff:
            continue
        records.append(_record(company=name, at=_day(_utc_iso(last)) if last else None, label=sector_of.get(name)))
    notes = ["Comptes de l'espace présents dans le CRM ; « Dernière activité » vide = aucune activité tracée."]
    if unchecked:
        notes.append(
            f"{len(unchecked)} compte(s) non lus (CRM injoignable ou au-delà de {CRM_LIST_MAX}) : {', '.join(unchecked[:10])}."
        )
    out = _fetched(
        records=records,
        records_read=len(read) - len(unchecked) + len(skipped),
        complete=complete and not unchecked,
        window_applies=False,
        notes=notes,
    )
    return out


async def _fetch_crm_deals(
    user_id: str, outcome: str, window: tuple[datetime, datetime] | None, query: str | None
) -> dict[str, Any]:
    """#4065.8 — les affaires gagnées / perdues du CRM branché et leur interlocuteur : le pont CRM de
    l'API (adaptateur commun `read.deals`). Une affaire dont la clôture n'est pas lisible n'est jamais
    rangée dans une période — elle est NOMMÉE. Un CRM qui ne rend pas l'interlocuteur laisse la cellule
    vide (jamais devinée)."""
    result = await bellum_api.crm_deals(user_id, outcome=outcome, since=_utc_iso(window[0]) if window else None)
    if result is None:
        return _fetched(error="Le CRM n'a pas répondu : rien n'a été lu.")
    if result.get("error") == "crm_read_forbidden":
        return _fetched(error="Tu n'as pas le droit de lire le CRM de l'espace : rien n'a été lu.")
    if result.get("error"):
        return _fetched(error="Le CRM n'a pas répondu : rien n'a été lu.")
    if result.get("connected") is False:
        if outcome in ("lost", "closed"):
            return await _fetch_bellum_lost_deals(user_id, window, query)
        return _fetched(error="Aucun CRM lisible n'est branché pour ton espace : je ne peux pas lister ses affaires.")
    needle = (query or "").casefold()
    records: list[dict[str, str | None]] = []
    undated = 0
    any_contact = False
    for deal in result.get("deals") or []:
        if not isinstance(deal, dict):
            continue
        if needle and needle not in f"{deal.get('accountName') or ''} {deal.get('title') or ''}".casefold():
            continue
        closed = None
        if window is not None:
            try:
                closed = parse_bound(deal.get("closedAt"), end=False)
            except ValueError:
                closed = None
            if closed is None:
                undated += 1
                continue
            if not (window[0] <= closed < window[1]):
                continue
        any_contact = any_contact or bool(deal.get("contactName"))
        amount = deal.get("amount")
        records.append(
            _record(
                company=deal.get("accountName"),
                label=deal.get("title"),
                detail={"won": "Gagnée", "lost": "Perdue"}.get(str(deal.get("status"))),
                at=_day(deal.get("closedAt")),
                person=deal.get("contactName"),
                extra=f"{round(amount)} €"
                if isinstance(amount, (int, float)) and not isinstance(amount, bool)
                else None,
            )
        )
    notes = []
    if undated:
        notes.append(f"{undated} affaire(s) sans date de clôture lisible dans le CRM : non rangées dans la période.")
    if records and not any_contact:
        notes.append("Ton CRM ne rend pas l'interlocuteur de ces affaires : la colonne reste vide.")
    read = result.get("dealsRead")
    total = result.get("dealsTotal")
    return _fetched(
        records=records,
        records_read=read if isinstance(read, int) else len(result.get("deals") or []),
        records_total=total if isinstance(total, int) else None,
        complete=result.get("complete") is not False,
        window_applies=window is not None,
        notes=notes,
    )


async def _fetch_bellum_lost_deals(
    user_id: str, window: tuple[datetime, datetime] | None, query: str | None
) -> dict[str, Any]:
    """#4288.4 (#4065.8) — aucun CRM lisible : les affaires PERDUES se lisent dans l'espace Bellum, sur la MÊME
    population que l'écran Projets › « Voir les perdues » (opportunités à l'étape « perdu », route
    `projects/lost`), et la source lue est DITE. Le repli lisait les BESOINS : « 3 enregistrements examinés »
    contre 2 lignes à l'écran. Une lecture qui échoue dit « rien n'a été lu », jamais « aucune »."""
    result = await bellum_api.lost_projects(user_id)
    if result is None or result.get("error"):
        return _fetched(
            error="Aucun CRM lisible n'est branché et les affaires de l'espace n'ont pas répondu : rien n'a été lu."
        )
    needle = (query or "").casefold()
    records: list[dict[str, str | None]] = []
    undated = 0
    for row in result.get("projects") or []:
        if not isinstance(row, dict):
            continue
        if needle and needle not in f"{row.get('companyName') or ''} {row.get('label') or ''}".casefold():
            continue
        closed = None
        if window is not None:
            try:
                closed = parse_bound(row.get("closedAt"), end=False)
            except ValueError:
                closed = None
            if closed is None:
                undated += 1
                continue
            if not (window[0] <= closed < window[1]):
                continue
        records.append(
            _record(company=row.get("companyName"), label=row.get("label"), detail="Perdue", at=_day(row.get("closedAt")))
        )
    total = result.get("total")
    notes = [
        "Aucun CRM lisible n'est branché : j'ai lu les affaires perdues de ton espace Bellum (la liste de l'écran "
        "Projets › « Voir les perdues »). L'interlocuteur n'y est pas rendu."
    ]
    if undated:
        notes.append(f"{undated} affaire(s) perdue(s) sans date de clôture lisible : non rangées dans la période.")
    return _fetched(
        records=records,
        records_read=total if isinstance(total, int) else len(result.get("projects") or []),
        complete=True,
        window_applies=window is not None,
        notes=notes,
    )


async def _fetch_needs(user_id: str, window: tuple[datetime, datetime] | None, query: str | None) -> dict[str, Any]:
    result = await bellum_api.find_needs(user_id, query=query, limit=50, include_closed=window is not None)
    if result is None:
        return _fetched(error="Les besoins de l'espace n'ont pas répondu.")
    rows = [r for r in (result.get("data") or []) if isinstance(r, dict)]
    total = (result.get("pagination") or {}).get("totalItems") if isinstance(result.get("pagination"), dict) else None
    records = []
    for r in rows:
        created = r.get("created_at") or r.get("status_changed_at")
        if window is not None and isinstance(created, str):
            try:
                moment = datetime.fromisoformat(created.replace("Z", "+00:00"))
                if moment.tzinfo is None:
                    moment = moment.replace(tzinfo=UTC)
                if not (window[0] <= moment < window[1]):
                    continue
            except ValueError:
                pass
        records.append(
            _record(
                company=r.get("account_name"),
                at=_day(created if isinstance(created, str) else None),
                label=r.get("title"),
                detail=r.get("status"),
            )
        )
    complete = not isinstance(total, int) or total <= len(rows)
    return _fetched(
        records=records,
        records_read=total if isinstance(total, int) else len(rows),
        complete=complete,
        window_applies=window is not None,
    )


async def _fetch_consultants(user_id: str, query: str | None) -> dict[str, Any]:
    result = await bellum_api.search_talents(user_id, query=query)
    if result is None:
        return _fetched(error="Le vivier de consultants n'a pas répondu.")
    rows = [r for r in (result.get("items") or []) if isinstance(r, dict)]
    total = result.get("total") if isinstance(result.get("total"), int) else None
    records = [
        _record(
            person=r.get("fullName"),
            label=r.get("title"),
            at=_day(r.get("availableFrom")),
            detail=", ".join(
                str(s.get("label")) for s in (r.get("topSkills") or []) if isinstance(s, dict) and s.get("label")
            ),
        )
        for r in rows
    ]
    complete = total is None or total <= len(rows)
    notes = (
        [] if complete else [f"Le vivier rend ses {len(rows)} premiers profils sur {total} : affine avec un filtre."]
    )
    return _fetched(
        records=records,
        records_read=total if total is not None else len(rows),
        complete=complete,
        window_applies=False,
        notes=notes,
    )


async def _fetch_missions(user_id: str, window: tuple[datetime, datetime]) -> dict[str, Any]:
    now = datetime.now(UTC)
    records: list[dict[str, str | None]] = []
    read = 0
    # #4065.9 — la part PASSÉE de la fenêtre : les missions TERMINÉES (même liste que « qui finissent »).
    if window[0] < now - timedelta(minutes=1):
        days = max(1, min(1500, -(-int((now - window[0]).total_seconds()) // 86_400)))
        ended = await bellum_api.missions_ended(user_id, ended_since_days=days)
        if ended is None:
            return _fetched(error="Les missions de l'espace n'ont pas répondu.")
        for r in ended.get("missions") or []:
            if not isinstance(r, dict):
                continue
            read += 1
            try:
                end = parse_bound(r.get("ends_on"), end=False)
            except ValueError:
                end = None
            if end is None or not (window[0] <= end < window[1]):
                continue
            records.append(_record(company=r.get("accountName"), at=r.get("ends_on"), label=r.get("label")))
    if window[1] > now:
        days = max(1, min(400, -(-int((window[1] - now).total_seconds()) // 86_400)))
        result = await bellum_api.missions_ending(user_id, ending_within_days=days)
        if result is None:
            return _fetched(error="Les missions de l'espace n'ont pas répondu.")
        rows = result.get("missions") if isinstance(result, dict) else result
        rows = [r for r in (rows or []) if isinstance(r, dict)]
        read += len(rows)
        # VU.3 (18/10) — UNE fenêtre : `missions/ending` ne connaît que « dans N jours » ; une fin avant le début
        # de la période demandée (ou après sa fin) ne se range pas sous l'en-tête « du A au B ».
        rows = [r for r in rows if _ends_inside_window(r.get("ends_on"), window)]
        records.extend(
            _record(company=r.get("accountName"), at=r.get("ends_on"), label=r.get("label"), detail=r.get("renewal"))
            for r in rows
        )
    return _fetched(records=records, records_read=read, notes=["Missions dont la fin tombe dans la période."])


def _ends_inside_window(raw: Any, window: tuple[datetime, datetime]) -> bool:
    """Une fin datée au JOUR compte dans la fenêtre dès que son jour la touche ; sans date lisible, elle reste."""
    try:
        end = parse_bound(raw, end=False)
    except ValueError:
        return True
    if end is None:
        return True
    return end < window[1] and end + timedelta(days=1) > window[0]


def _past_days(window: tuple[datetime, datetime]) -> int:
    """Le nombre de jours en arrière que couvre le début de la fenêtre (au moins 1)."""
    return max(1, min(1500, -(-int((datetime.now(UTC) - window[0]).total_seconds()) // 86_400)))


async def _fetch_ats_past(user_id: str, window: tuple[datetime, datetime], ats_list: str) -> dict[str, Any]:
    """#4065.9 — candidats vus en entretien / missions terminées : la fenêtre PASSÉE, jamais devinée."""
    days = _past_days(window)
    if ats_list == "interviewed_candidates":
        result = await bellum_api.ats_records(user_id, interviewed_since_days=days)
    else:
        result = await bellum_api.ats_records(user_id, ended_since_days=days)
    if result is None:
        return _fetched(error="L'ATS n'a pas répondu : rien n'a été lu.")
    if result.get("connected") is False:
        if ats_list == "interviewed_candidates":
            # #4288.5 (#4065.9) — le constat en clair : ce n'est pas « zéro candidat », c'est « pas lu ».
            return _fetched(error="Tes entretiens ne sont pas lus : aucun outil de recrutement branché pour ton espace.")
        return _fetched(error="Aucun ATS n'est branché pour ton espace.")
    if ats_list == "interviewed_candidates":
        if result.get("candidatesRead") is not True:
            return _fetched(error="La liste des candidats de l'ATS n'a pas répondu : rien n'a été lu.")
        records = []
        for r in result.get("interviewedCandidates") or []:
            if not isinstance(r, dict):
                continue
            try:
                seen = parse_bound(r.get("interviewedAt"), end=False)
            except ValueError:
                seen = None
            if seen is None or not (window[0] <= seen < window[1]):
                continue
            records.append(_record(person=r.get("fullName"), label=r.get("title"), at=_day(r.get("interviewedAt"))))
        return _fetched(
            records=records,
            records_read=len(result.get("interviewedCandidates") or []),
            notes=["Seuls les candidats dont l'ATS rend une date d'entretien sont listés."],
        )
    records = []
    for r in result.get("endedMissions") or []:
        if not isinstance(r, dict):
            continue
        try:
            end = parse_bound(r.get("endsAt"), end=False)
        except ValueError:
            end = None
        if end is None or not (window[0] <= end < window[1]):
            continue
        records.append(
            _record(
                person=r.get("consultantName"),
                company=r.get("companyName"),
                at=_day(r.get("endsAt")),
                label=r.get("title"),
            )
        )
    return _fetched(records=records, records_read=len(result.get("endedMissions") or []))


async def _fetch_ats(user_id: str, window: tuple[datetime, datetime], ats_list: str) -> dict[str, Any]:
    if ats_list in ATS_PAST_LISTS:
        return await _fetch_ats_past(user_id, window, ats_list)
    now = datetime.now(UTC)
    days = max(1, min(400, -(-int((window[1] - now).total_seconds()) // 86_400))) if window[1] > now else None
    result = await bellum_api.ats_records(user_id, ending_within_days=days)
    if result is None:
        return _fetched(error="L'ATS n'a pas répondu : rien n'a été lu.")
    if result.get("connected") is False:
        return _fetched(error="Aucun ATS n'est branché pour ton espace.")
    if ats_list == "benched_consultants":
        rows = result.get("benchedConsultants") or []
        records = [
            _record(
                person=r.get("fullName"),
                label=r.get("title"),
                at=_day(r.get("availableAt")),
                detail=f"{r['daysWithoutMission']} j sans mission"
                if isinstance(r.get("daysWithoutMission"), int)
                else None,
            )
            for r in rows
            if isinstance(r, dict)
        ]
        return _fetched(records=records, records_read=len(records), window_applies=False)
    if ats_list == "open_needs":
        rows = result.get("openNeeds") or []
        records = [
            _record(
                company=r.get("companyName"), at=_day(r.get("createdAt")), label=r.get("title"), detail=r.get("state")
            )
            for r in rows
            if isinstance(r, dict)
        ]
        notes = ["L'ATS rend ses 25 premiers besoins ouverts."] if len(records) >= 25 else []
        return _fetched(
            records=records, records_read=len(records), window_applies=False, complete=len(records) < 25, notes=notes
        )
    rows = result.get("endingMissions") or []
    records = [
        _record(
            person=r.get("consultantName"), company=r.get("companyName"), at=_day(r.get("endsAt")), label=r.get("title")
        )
        for r in rows
        if isinstance(r, dict)
    ]
    return _fetched(records=records, records_read=len(records))


# #4065.5 — dédoublonnage par personne ou par société ; une valeur absente reste `None`.
def _group(records: list[dict[str, str | None]], group_by: str) -> tuple[list[str], list[list[str | None]]]:
    """Les colonnes et les lignes du tableau. Une valeur absente reste `None` (non mesuré)."""
    if group_by == "person":
        people: dict[str, dict[str, Any]] = {}
        for r in records:
            key = r["email"] or (r["person"] or "").lower()
            if not key:
                continue
            entry = people.setdefault(
                key,
                {
                    "person": r["person"],
                    "email": r["email"],
                    "company": r["company"],
                    "count": 0,
                    "date": None,
                    "label": None,
                },
            )
            entry["count"] += 1
            entry["person"] = entry["person"] or r["person"]
            entry["company"] = entry["company"] or r["company"]
            if r["date"] and (entry["date"] is None or r["date"] >= entry["date"]):
                entry["date"], entry["label"] = r["date"], r["label"]
        ordered = sorted(people.values(), key=lambda e: e["date"] or "", reverse=True)
        return (
            ["Personne", "E-mail", "Société / domaine", "Occurrences", "Dernière date", "Dernier objet"],
            [[e["person"], e["email"], e["company"], str(e["count"]), e["date"], e["label"]] for e in ordered],
        )
    if group_by == "company":
        companies: dict[str, dict[str, Any]] = {}
        for r in records:
            name = r["company"] or _domain_of(r["email"])
            if not name:
                continue
            entry = companies.setdefault(name.lower(), {"company": name, "people": [], "count": 0, "date": None})
            entry["count"] += 1
            who = r["person"] or r["email"]
            if who and who not in entry["people"]:
                entry["people"].append(who)
            if r["date"] and (entry["date"] is None or r["date"] > entry["date"]):
                entry["date"] = r["date"]
        ordered = sorted(companies.values(), key=lambda e: e["date"] or "", reverse=True)
        return (
            ["Société / domaine", "Personnes", "Occurrences", "Dernière date"],
            [[e["company"], ", ".join(e["people"][:5]) or None, str(e["count"]), e["date"]] for e in ordered],
        )
    return (
        ["Date", "Personne", "E-mail", "Société", "Objet / libellé", "Détail"],
        [[r["date"], r["person"], r["email"], r["company"], r["label"], r["detail"]] for r in records],
    )


# R46 — une colonne sans AUCUNE valeur n'est pas une colonne : elle dirait « non renseigné » sur chaque ligne.
def _drop_empty_columns(columns: list[str], rows: list[list[str | None]]) -> tuple[list[str], list[list[str | None]]]:
    if not rows:
        return columns, rows
    keep = [i for i in range(len(columns)) if any((row[i] or "").strip() for row in rows if i < len(row))]
    if not keep or len(keep) == len(columns):
        return columns, rows
    return [columns[i] for i in keep], [[row[i] if i < len(row) else None for i in keep] for row in rows]


# #4065.4 — le croisement entre sources (décision Louis 12/10 : inclus).
async def _cross_with(
    user_id: str, rows: list[list[str | None]], columns: list[str], cross: dict[str, Any]
) -> dict[str, Any]:
    """Garde les lignes ABSENTES (ou PRÉSENTES) d'une autre source. Une ligne non vérifiée n'est
    JAMAIS classée absente : elle est nommée « non vérifiée »."""
    target = str(cross.get("source") or "")
    mode = "present" if cross.get("mode") == "present" else "absent"
    company_col = next((i for i, c in enumerate(columns) if c.startswith("Société")), None)
    email_col = columns.index("E-mail") if "E-mail" in columns else None
    person_col = columns.index("Personne") if "Personne" in columns else None

    verdicts: dict[str, bool] = {}
    unchecked: list[str] = []
    keys: list[str | None] = []
    for row in rows:
        if target == "crm":
            key = row[company_col] if company_col is not None else None
        else:
            key = (row[email_col] if email_col is not None else None) or (
                row[person_col] if person_col is not None else None
            )
        keys.append(key)
    for key in dict.fromkeys(k for k in keys if k):
        if len(verdicts) >= CROSS_MAX:
            unchecked.append(key)
            continue
        if target == "crm":
            domain = key if "." in key and " " not in key else None
            result = await bellum_api.crm_company_presence(user_id, company_name=key, domain=domain)
            if not isinstance(result, dict) or result.get("error") or result.get("connected") is False:
                if isinstance(result, dict) and result.get("connected") is False:
                    return {"error": "Croisement impossible : aucun CRM n'est branché pour ton espace."}
                unchecked.append(key)
                continue
            verdicts[key] = bool(result.get("matched"))
        else:
            result = await bellum_api.workspace_contacts(user_id, query=key, company=None, role=None, limit=5)
            if not isinstance(result, dict):
                unchecked.append(key)
                continue
            found = [c for c in (result.get("contacts") or []) if isinstance(c, dict)]
            needle = key.lower()
            verdicts[key] = any(
                str(c.get("email") or "").lower() == needle or str(c.get("full_name") or "").lower() == needle
                for c in found
            )
    kept = [
        row for row, key in zip(rows, keys, strict=True) if key in verdicts and verdicts[key] == (mode == "present")
    ]
    return {
        "rows": kept,
        "summary": {
            "source": SOURCE_LABELS.get(target, target),
            "mode": mode,
            "checked": len(verdicts),
            "kept": len(kept),
            "unchecked": unchecked,
        },
    }


def _csv_name(source: str, label: dict[str, str] | None) -> str:
    stem = f"liste-{source}"
    if label:
        stem += f"-{label['from']}-au-{label['to']}"
    return f"{stem}.csv"


#: Les sources qui vivent dans la base Bellum de l'espace (« données de l'espace »).
WORKSPACE_SOURCES = frozenset({"contacts", "accounts", "needs", "consultants", "missions"})


def _source_is_off(source: str, excluded_families: list[str] | None, exclude_workspace_data: bool) -> bool:
    """« Outils et sources » : la source est-elle non branchée ou décochée pour ce fil ?"""
    if source in WORKSPACE_SOURCES:
        return exclude_workspace_data
    family = SOURCE_FAMILY.get(source)
    if not family:
        return False
    if family in (excluded_families or ()):
        return True
    connected = current_connected_families()
    return connected is not None and family not in connected


async def run_list_records(
    user_id: str,
    tool_input: dict[str, Any],
    *,
    excluded_families: list[str] | None = None,
    exclude_workspace_data: bool = False,
) -> dict[str, Any]:
    """#4065 — le listing : une source, une période, un filtre, un regroupement, un croisement."""
    source = str(tool_input.get("source") or "").strip()
    if source not in LIST_SOURCES:
        return {"error": f"Source inconnue : {source or '(vide)'}. Sources possibles : {', '.join(LIST_SOURCES)}."}
    label = SOURCE_LABELS[source]
    # #4065.9 (18/10) — « missions terminées » vit AUSSI dans la base Bellum : sans ATS branché (ou décoché), la
    # lecture va en base et le DIT, au lieu de « l'ATS n'a pas été lu pour ce fil ». Les candidats vus en entretien,
    # eux, n'ont pas de lecture en base d'ici : ils restent nommés non lus.
    ats_list_requested = str(tool_input.get("ats_list") or "")
    if (
        source == "ats"
        and ats_list_requested == "ended_missions"
        and _source_is_off("ats", excluded_families, exclude_workspace_data)
        and not _source_is_off("missions", excluded_families, exclude_workspace_data)
    ):
        base_input = {**{k: v for k, v in tool_input.items() if k != "ats_list"}, "source": "missions"}
        if not (str(tool_input.get("from_iso") or "").strip() or str(tool_input.get("to_iso") or "").strip()):
            # Sans période, la même fenêtre passée que l'ATS : les 90 derniers jours.
            base_input["from_iso"] = (datetime.now(UTC) - timedelta(days=90)).date().isoformat()
        from_base = await run_list_records(
            user_id,
            base_input,
            excluded_families=excluded_families,
            exclude_workspace_data=exclude_workspace_data,
        )
        from_base["notes"] = [
            "Aucun ATS n'est branché pour ce fil : les missions terminées sont lues dans la base Bellum de ton espace.",
            *from_base.get("notes", []),
        ]
        return from_base
    # #4065.3 — « Outils et sources » : une source non branchée ou décochée est NOMMÉE absente,
    # jamais lue, jamais comptée « 0 ».
    if _source_is_off(source, excluded_families, exclude_workspace_data):
        return {
            "source": label,
            "absent_sources": [label],
            "note": f"{label} : non branché(e) ou décoché(e) pour ce fil — rien n'a été lu, ce n'est pas « 0 ».",
        }
    if not bellum_api.is_configured():
        return {"error": f"Je n'ai pas accès à la source {label} depuis ici."}

    query = str(tool_input.get("query") or "").strip() or None
    group_by = str(tool_input.get("group_by") or "none")
    if group_by not in ("none", "person", "company"):
        group_by = "none"
    has_window = bool(str(tool_input.get("from_iso") or "").strip() or str(tool_input.get("to_iso") or "").strip())
    default_forward = 30 if source in ("missions", "ats") else 7
    window = resolve_window(tool_input.get("from_iso"), tool_input.get("to_iso"), default_forward_days=default_forward)
    if isinstance(window, str):
        return {"error": window}
    ats_list_asked = str(tool_input.get("ats_list") or "ending_missions")
    # #4065.9 — une liste PASSÉE de l'ATS sans période se lit sur les 90 derniers jours (et se NOMME).
    if source == "ats" and ats_list_asked in ATS_PAST_LISTS and not has_window:
        window = (datetime.now(UTC) - timedelta(days=90), datetime.now(UTC))
        has_window = True

    try:
        cutoff = parse_bound(tool_input.get("inactive_since"), end=False) if source == "crm" else None
    except ValueError:
        cutoff = None
    deal_outcome = str(tool_input.get("deal_outcome") or "").strip()
    if source == "crm":
        if deal_outcome in DEAL_OUTCOMES:
            # #4065.8 — la liste des AFFAIRES (gagnées / perdues) et de leur interlocuteur.
            fetched = await _fetch_crm_deals(user_id, deal_outcome, window if has_window else None, query)
        elif cutoff is None:
            return {
                "error": (
                    "Pour lister le CRM, dis-moi le critère : « sans activité depuis 3 mois » (inactive_since), "
                    "ou les affaires « perdues » / « gagnées » (deal_outcome). "
                    "Je peux aussi croiser une liste (agenda, messagerie, contacts) avec le CRM."
                )
            }
        else:
            fetched = await _fetch_crm_inactive(user_id, cutoff, query)
    elif source == "agenda":
        fetched = await _fetch_agenda(user_id, window, query, bool(tool_input.get("include_internal")))
    elif source == "mailbox":
        if not has_window:
            window = (datetime.now(UTC) - timedelta(days=30), datetime.now(UTC))
        fetched = await _fetch_mailbox(user_id, window, query, str(tool_input.get("mail_filter") or "all"))
    elif source == "contacts":
        fetched = await _fetch_contacts(user_id, query)
    elif source == "accounts":
        fetched = await _fetch_accounts(user_id, query)
    elif source == "needs":
        fetched = await _fetch_needs(user_id, window if has_window else None, query)
    elif source == "consultants":
        fetched = await _fetch_consultants(user_id, query)
    elif source == "missions":
        fetched = await _fetch_missions(user_id, window)
    else:
        fetched = await _fetch_ats(
            user_id, window, ats_list_asked if ats_list_asked in ATS_LISTS else "ending_missions"
        )

    window_named = window_label(*window) if fetched["window_applies"] else None
    if fetched["error"]:
        return {"error": fetched["error"], "source": label, **({"window": window_named} if window_named else {})}

    if source == "crm" and deal_outcome in DEAL_OUTCOMES:
        columns = ["Société", "Affaire", "Statut", "Montant", "Interlocuteur", "Clôturée le"]
        rows = [[r["company"], r["label"], r["detail"], r["extra"], r["person"], r["date"]] for r in fetched["records"]]
    elif source == "crm":
        columns = ["Société", "Secteur", "Dernière activité CRM"]
        rows = [[r["company"], r["label"], r["date"]] for r in fetched["records"]]
    else:
        columns, rows = _group(fetched["records"], group_by)
    cross_summary: dict[str, Any] | None = None
    cross = tool_input.get("cross")
    if isinstance(cross, dict) and cross.get("source") in ("crm", "contacts") and rows:
        if _source_is_off(str(cross["source"]), excluded_families, exclude_workspace_data):
            target = SOURCE_LABELS[str(cross["source"])]
            return {
                "error": f"Croisement impossible : la source {target} n'est pas branchée ou est décochée pour ce fil.",
                "source": label,
                "absent_sources": [target],
            }
        crossed = await _cross_with(user_id, rows, columns, cross)
        if crossed.get("error"):
            return {"error": crossed["error"], "source": label}
        rows, cross_summary = crossed["rows"], crossed["summary"]

    # R46 — « on n'affiche pas ce qu'on n'a pas » : une colonne vide sur TOUTES les lignes ne s'affiche pas
    # (Personne / E-mail sur une liste de comptes). Après le croisement, qui lit les colonnes par leur nom.
    columns, rows = _drop_empty_columns(columns, rows)
    # Le total annoncé est le nombre de lignes RENDUES : un compte (« 82 ») plus court que les lignes lues (84)
    # n'a jamais été un total, c'était le compteur d'une autre requête. Une lecture partielle garde son total.
    records_read = fetched["records_read"]
    if source in WORKSPACE_SOURCES and group_by == "none" and not cross_summary:
        records_read = max(records_read, len(rows))
    out: dict[str, Any] = {
        "source": label,
        "records_read": records_read,
        "rows_total": len(rows),
        "complete": fetched["complete"],
    }
    if window_named:
        out["window"] = window_named
    elif has_window:
        out["window_note"] = f"La période ne s'applique pas à la source {label} : la liste est celle d'aujourd'hui."
    if fetched["notes"]:
        out["notes"] = fetched["notes"]
    if fetched["unavailable"]:
        out["unavailable"] = fetched["unavailable"]
    if fetched["unread_periods"]:
        out["unread_periods"] = fetched["unread_periods"]
    if cross_summary:
        out["cross"] = cross_summary
    if len(rows) > MAX_ROWS:
        out["truncated"] = True
        out["notes"] = [*out.get("notes", []), f"Le tableau montre {MAX_ROWS} lignes sur {len(rows)}."]
    if not rows:
        # Une absence se dit en texte, jamais une carte sans ligne.
        if not fetched["complete"]:
            # #4288.4 — conclusion négative interdite sur une lecture bornée : « 3 examinées » n'est pas « 23 »,
            # et « aucune » n'est dicible que si TOUT le périmètre a été lu. Sinon : non mesuré, avec la raison.
            total = fetched.get("records_total")
            scope = f"{records_read} sur {total}" if isinstance(total, int) and total >= records_read else f"{records_read}"
            out["note"] = (
                f"Non mesuré : la lecture est incomplète ({scope} lus). Ne conclus PAS « aucune » : dis le nombre lu "
                "comme une limite et que le reste n'a pas été lu."
            )
            out["negative_conclusion_forbidden"] = True
            return out
        out["note"] = "Aucune ligne ne correspond sur ce qui a été lu."
        return out
    period = f" — du {window_named['from']} au {window_named['to']}" if window_named else ""
    # #4065.6 — la carte `file_export` (export CSV local), source et période nommées, total lu dit.
    card = validate_reply_block(
        {
            "type": "file_export",
            "title": f"{label}{period}"[:120],
            "filename": _csv_name(source, window_named),
            "columns": columns,
            "rows": [{"cells": row} for row in rows[:MAX_ROWS]],
            "note": (
                f"{records_read} éléments lus · {len(rows)} lignes"
                + ("" if fetched["complete"] else " · lecture incomplète (voir ci-dessous)")
            )[:300],
        }
    )
    if card:
        out["card"] = card
        _remember_listing_card(card)
    return out
