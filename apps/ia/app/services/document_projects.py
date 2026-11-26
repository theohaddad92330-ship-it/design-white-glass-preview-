"""#3889 (épopée #3977) — les projets décrits dans les DOCUMENTS de l'espace, par compte.

Lecture seule de la base documentaire (`rag_documents`) : ce module ne lit JAMAIS
les besoins enregistrés en base (`find_needs`, `OpenNeedsService`) ni les missions
saisies (`search_missions`) — il lit ce que les documents déposés par l'espace
DISENT d'un compte, et le range :

* ``open_needs`` — un besoin que le document dit ouvert (statut) ou daté à venir ;
* ``past_needs`` — un besoin que le document dit clos (statut) ou daté de plus
  d'un an ;
* ``missions`` — une mission ou prestation décrite, avec son état si le document
  le dit ;
* ``client_projects`` — un projet, programme ou chantier du client, qui n'est ni
  un besoin ni une mission : il garde sa nature (#3889.3) ;
* ``unsettled_needs`` — un besoin dont le document ne dit pas s'il est ouvert ou
  ancien : « non daté » (ni date ni statut), « daté, statut non dit » (une date
  récente seule) ou « ambigu » (le document dit les deux).

Ouvert / ancien se décide sur ce que le document ÉCRIT, jamais deviné : un mot de
statut l'emporte, sinon une date franchement à venir ou franchement passée, sinon
rien. Chaque projet cite le titre de son document.

Isolation : la portée est celle de la récupération générale
(`rag_service._scope_retrieval` — même prédicat que la RLS et la RPC vectorielle) :
l'espace de la personne, ses documents `personal` seulement, les documents
`account` de CE compte seulement, jamais un document `conversation`, jamais un
document archivé. Le compte est d'abord vérifié dans le portefeuille de la
personne (`fetch_owned_account`) : un compte étranger ne lit aucun document.
Une connaissance DISTILLÉE par nos analyses (`origin = 'distilled'`) n'est pas un
document de l'espace : elle est écartée.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any

from fastapi import HTTPException

from app.services.ownership import fetch_owned_account
from app.services.rag_service import _scope_retrieval, _valid_account_id
from app.services.supabase_client import get_supabase
from app.services.workspace_scope import resolve_workspace_id

BUCKETS: tuple[str, ...] = ("open_needs", "past_needs", "missions", "client_projects", "unsettled_needs")

_COLUMNS = "id, title, content, scope, account_id, origin, created_at"
#: Documents lus par passe (rattachés au compte / qui le nomment). Une base qui en
#: porte davantage sur UN compte est rare ; le résultat dit combien ont été lus.
_DOCS_PER_PASS = 40
#: Le texte d'un document lu au-delà de ce seuil n'est pas balayé (un export massif
#: ne doit pas figer le tour) — le passage cité reste celui du début du document.
_SCAN_CHARS = 60_000
_EXCERPT_CHARS = 300
_LONG_LINE = 400
#: « Franchement passé » : une date dont la fin remonte à plus d'un an. Plus récente
#: et sans statut, elle ne dit pas si le besoin est encore ouvert — on ne tranche pas.
_PAST_AFTER = timedelta(days=365)


def _today() -> date:
    return datetime.now(UTC).date()


# ─── Ce que le document DIT ────────────────────────────────────────────────

_NEED = re.compile(
    r"\bbesoins?\b|\bappels? d['’]offres?\b|\bconsultations?\b|\brfp\b|\bà pourvoir\b|\ba pourvoir\b"
    r"|\bdemandes? de (?:profils?|prestations?|consultants?)\b"
)
_MISSION = re.compile(r"\bmissions?\b|\bprestations?\b|\binterventions?\b")
_PROJECT = re.compile(r"\bprojets?\b|\bprogrammes?\b|\bchantiers?\b")
#: Une mission ET un besoin dans la même phrase : c'est une mission si la phrase dit
#: qu'elle a été (ou est) menée — « mission réalisée pour répondre au besoin… ».
_DELIVERED = re.compile(r"\bréalis|\brealis|\bmen[ée]e?s?\b|\blivr[ée]|\btermin[ée]|\bintervenu|\baccompagn")

_OPEN = re.compile(
    r"\b(ouverte?s?|en cours|à pourvoir|a pourvoir|à venir|a venir|prévue?s?|prevue?s?|annoncée?s?"
    r"|en attente|actif|active)\b"
)
_CLOSED = re.compile(
    r"\b(fermée?s?|clos|closes?|clôturée?s?|cloturée?s?|terminée?s?|achevée?s?|annulée?s?|pourvue?s?"
    r"|perdue?s?|gagnée?s?|abandonnée?s?|livrée?s?|réalisée?s?|realisee?s?|anciens?|anciennes?)\b"
)

_MONTHS = {
    "janvier": 1,
    "février": 2,
    "fevrier": 2,
    "mars": 3,
    "avril": 4,
    "mai": 5,
    "juin": 6,
    "juillet": 7,
    "août": 8,
    "aout": 8,
    "septembre": 9,
    "octobre": 10,
    "novembre": 11,
    "décembre": 12,
    "decembre": 12,
}
_DAY_FR = re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b")
_DAY_ISO = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")
_MONTH = re.compile(r"\b(" + "|".join(_MONTHS) + r")\s+(\d{4})\b", re.IGNORECASE)
_QUARTER = re.compile(r"\b[TQ]([1-4])\s*(\d{4})\b")
_SEMESTER = re.compile(r"\bS([12])\s*(\d{4})\b")
_YEAR = re.compile(r"\b(19[89]\d|20\d\d)\b")


@dataclass(frozen=True)
class _Period:
    text: str
    start: date
    end: date


def _month_end(year: int, month: int) -> date:
    return (date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)) - timedelta(days=1)


def _safe_day(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _dates_said(text: str) -> list[_Period]:
    """Les dates ÉCRITES dans le passage, telles qu'écrites, chacune avec sa période."""
    found: list[tuple[int, _Period]] = []
    taken: list[tuple[int, int]] = []

    def _free(span: tuple[int, int]) -> bool:
        return all(span[1] <= a or span[0] >= b for a, b in taken)

    def _add(match: re.Match[str], start: date | None, end: date | None) -> None:
        if start is None or end is None or not _free(match.span()):
            return
        taken.append(match.span())
        found.append((match.start(), _Period(match.group(0), start, end)))

    for m in _DAY_FR.finditer(text):
        day = _safe_day(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        _add(m, day, day)
    for m in _DAY_ISO.finditer(text):
        day = _safe_day(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        _add(m, day, day)
    for m in _MONTH.finditer(text):
        year, month = int(m.group(2)), _MONTHS[m.group(1).lower()]
        _add(m, date(year, month, 1), _month_end(year, month))
    for m in _QUARTER.finditer(text):
        year, quarter = int(m.group(2)), int(m.group(1))
        _add(m, date(year, 3 * quarter - 2, 1), _month_end(year, 3 * quarter))
    for m in _SEMESTER.finditer(text):
        year, half = int(m.group(2)), int(m.group(1))
        _add(m, date(year, 6 * half - 5, 1), _month_end(year, 6 * half))
    for m in _YEAR.finditer(text):
        year = int(m.group(1))
        _add(m, date(year, 1, 1), date(year, 12, 31))
    return [period for _, period in sorted(found, key=lambda pair: pair[0])]


def _nature(lowered: str) -> str | None:
    need, mission = bool(_NEED.search(lowered)), bool(_MISSION.search(lowered))
    if need and mission:
        return "mission" if _DELIVERED.search(lowered) else "besoin"
    if need:
        return "besoin"
    if mission:
        return "mission"
    if _PROJECT.search(lowered):
        return "projet"
    return None


#: L'état rendu, par nature — un besoin est « ouvert »/« ancien », une mission ou un
#: projet est « en cours »/« terminé(e) ».
_STATE_LABELS = {
    "besoin": {"open": "ouvert", "past": "ancien"},
    "mission": {"open": "en cours", "past": "terminée"},
    "projet": {"open": "en cours", "past": "terminé"},
}


def _temporal(lowered: str, periods: list[_Period], today: date) -> tuple[str, str | None, str | None]:
    """(état, fondement, mot du document). L'état vaut ``open``/``past`` seulement
    quand le document le DIT ; sinon ``ambiguous``, ``dated`` ou ``undated``."""
    opened, closed = _OPEN.search(lowered), _CLOSED.search(lowered)
    if opened and closed:
        return "ambiguous", None, None
    if closed:
        return "past", "statut", closed.group(1)
    if opened:
        return "open", "statut", opened.group(1)
    if not periods:
        return "undated", None, None
    if any(period.start > today for period in periods):
        return "open", "date", None
    if max(period.end for period in periods) < today - _PAST_AFTER:
        return "past", "date", None
    return "dated", None, None


_UNSETTLED_LABELS = {"undated": "non daté", "dated": "daté, statut non dit", "ambiguous": "ambigu"}


def _passages(content: str) -> Iterable[str]:
    for raw_line in content[:_SCAN_CHARS].splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if len(line) <= _LONG_LINE:
            yield line
            continue
        for sentence in re.split(r"(?<=[.!?;])\s+", line):
            if sentence.strip():
                yield sentence.strip()


def _names(company_name: str) -> re.Pattern[str] | None:
    name = (company_name or "").strip()
    if len(name) < 2:
        return None
    return re.compile(r"(?<!\w)" + re.escape(name) + r"(?!\w)", re.IGNORECASE)


def _excerpt(text: str) -> str:
    return text if len(text) <= _EXCERPT_CHARS else text[: _EXCERPT_CHARS - 1].rstrip() + "…"


def extract_document_projects(
    docs: list[dict[str, Any]],
    *,
    company_name: str,
    today: date,
    account_docs: set[str],
) -> dict[str, list[dict[str, Any]]]:
    """Range les passages-projets des documents lus. Pure.

    Un document rattaché au compte (``account_docs``, ou dont le TITRE nomme le
    compte) parle du compte de bout en bout : chacune de ses lignes compte. Un
    document d'équipe qui le cite au passage ne rattache au compte que les lignes
    qui le NOMMENT — une référence sur dix clients ne devient pas dix projets du
    compte."""
    buckets: dict[str, list[dict[str, Any]]] = {key: [] for key in BUCKETS}
    pattern = _names(company_name)
    for doc in docs:
        doc_id = str(doc.get("id") or "")
        title = str(doc.get("title") or "").strip() or "Document sans titre"
        whole = doc_id in account_docs or bool(pattern and pattern.search(title))
        seen: set[str] = set()
        for passage in _passages(str(doc.get("content") or "")):
            if not whole and not (pattern and pattern.search(passage)):
                continue
            lowered = passage.lower()
            nature = _nature(lowered)
            if nature is None or passage in seen:
                continue
            seen.add(passage)
            periods = _dates_said(passage)
            when, basis, said = _temporal(lowered, periods, today)
            settled = when in ("open", "past")
            item = {
                "excerpt": _excerpt(passage),
                "nature": nature,
                "state": _STATE_LABELS[nature][when] if settled else _UNSETTLED_LABELS[when],
                "said": said,
                "dates": [period.text for period in periods],
                "basis": basis,
                "source": title,
                "source_id": doc_id or None,
            }
            if nature == "mission":
                buckets["missions"].append(item)
            elif nature == "projet":
                buckets["client_projects"].append(item)
            elif when == "open":
                buckets["open_needs"].append(item)
            elif when == "past":
                buckets["past_needs"].append(item)
            else:
                buckets["unsettled_needs"].append(item)
    return buckets


# ─── La lecture, scopée ────────────────────────────────────────────────────


class DocumentReadError(RuntimeError):
    """La base documentaire n'a pas répondu — jamais confondu avec « aucun document »."""


class AccountNotOwned(LookupError):
    """Le compte n'est pas dans le portefeuille de la personne."""


async def _read(query: Any) -> list[dict[str, Any]]:
    res = await query.aexecute()
    if getattr(res, "error", None):
        raise DocumentReadError(str(res.error))
    return [row for row in (getattr(res, "data", None) or []) if isinstance(row, dict)]


async def fetch_account_documents(
    sb: Any,
    *,
    user_id: str,
    workspace_id: str | None,
    account_id: str,
    company_name: str,
) -> tuple[list[dict[str, Any]], set[str]]:
    """Les documents de l'espace qui parlent du compte : ceux qui lui sont
    RATTACHÉS (portée `account`), puis ceux de l'équipe ou de la personne qui le
    NOMMENT (titre ou texte). Rend (documents, identifiants rattachés)."""
    account = _valid_account_id(account_id)

    def _base() -> Any:
        return _scope_retrieval(sb.table("rag_documents").select(_COLUMNS), user_id, workspace_id, account)

    rows: list[dict[str, Any]] = []
    if account:
        rows += await _read(_base().eq("scope", "account").eq("account_id", account).limit(_DOCS_PER_PASS))
    name = (company_name or "").strip()[:100]
    if len(name) >= 2:
        rows += await _read(_base().ilike("title", f"%{name}%").limit(_DOCS_PER_PASS))
        rows += await _read(_base().ilike("content", f"%{name}%").limit(_DOCS_PER_PASS))

    docs: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in rows:
        doc_id = str(row.get("id") or "")
        if not doc_id or doc_id in seen or row.get("origin") == "distilled":
            continue
        seen.add(doc_id)
        docs.append(row)
    attached = {str(d["id"]) for d in docs if d.get("scope") == "account" and str(d.get("account_id")) == account}
    return docs, attached


_SCOPE_NOTE = (
    "Ces projets viennent des documents de l'espace (base de connaissance), tels qu'ils y sont écrits. Ils ne "
    "remplacent ni les besoins enregistrés dans l'application ni les missions saisies : une absence ici ne dit rien "
    "de ceux-là, ni des autres comptes. Un projet cité n'est pas créé dans le pipe, et une mission décrite dans un "
    "document ne prouve ni une mission menée par ton ESN ni une relation encore active."
)


class CompanyNameTooShort(ValueError):
    """Ni compte, ni nom exploitable : rien n'est lu."""


async def search_account_document_projects(
    account_id: str | None, user_id: str, *, company_name: str | None = None
) -> dict[str, Any]:
    """Point d'entrée de l'outil. Lève :class:`AccountNotOwned` pour un compte hors
    portefeuille et :class:`DocumentReadError` sur une lecture en échec.

    #3889 (recette prod 11/10) — SANS compte du portefeuille, un NOM d'entreprise suffit : on lit
    alors les documents d'équipe et personnels qui la nomment (même portée que la récupération
    générale), jamais ceux rattachés à un compte. Un compte fourni garde le comportement d'avant."""
    sb = get_supabase()
    if account_id:
        try:
            account = await fetch_owned_account(sb, account_id, user_id, columns="id, company_name")
        except HTTPException as exc:
            raise AccountNotOwned(account_id) from exc
        company = str(account.get("company_name") or "").strip()
    else:
        company = (company_name or "").strip()
        if len(company) < 2:
            raise CompanyNameTooShort(company)
    workspace_id = await resolve_workspace_id(user_id, sb=sb)
    try:
        docs, attached = await fetch_account_documents(
            sb, user_id=user_id, workspace_id=workspace_id, account_id=account_id or "", company_name=company
        )
    except DocumentReadError:
        raise
    except Exception as exc:  # noqa: BLE001 — une panne réseau se dit, elle ne se tait pas en « aucun »
        raise DocumentReadError(str(exc)) from exc

    buckets = extract_document_projects(docs, company_name=company, today=_today(), account_docs=attached)
    used = {item["source"] for items in buckets.values() for item in items}
    result: dict[str, Any] = {
        "account": company or None,
        "account_id": account_id or None,
        "documents_read": len(docs),
        **buckets,
        "sources": sorted(used),
        "scope_note": _SCOPE_NOTE
        if account_id
        else _SCOPE_NOTE
        + " Cette entreprise n'est pas un compte de ton portefeuille : seuls les documents d'équipe ou personnels"
        " qui la nomment ont été lus, pas ceux rattachés à un compte.",
    }
    label = company or "ce compte"
    if not docs:
        result["message"] = (
            f"Aucun document de ton espace ne parle de {label} : je n'ai aucun projet documenté à te donner."
        )
    elif not used:
        result["message"] = (
            f"J'ai lu {len(docs)} document(s) qui parlent de {label}, et aucun ne décrit un besoin, une mission "
            "ou un projet."
        )
    return result
