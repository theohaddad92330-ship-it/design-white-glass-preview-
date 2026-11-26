"""#4072.1 — les organigrammes PRÉSENTS dans les documents de l'espace (Drive, imports).

Lecture seule de `rag_documents` : on ne lit que les documents qui SE DISENT
organigramme (titre, ou première ligne), et on n'en tire que ce que le texte
ÉCRIT — des personnes déclarables au format `OrgDeclaredPerson`
(`packages/contracts` `org-graph.ts`), datées, citant leur document.

Ce qu'on refuse plutôt que de deviner :

* un N+1 n'existe que s'il est ÉCRIT (« rattaché à X », « N+1 : X », « reports
  to X », colonne Manager) — jamais déduit d'une indentation, d'un ordre ou
  d'un titre : se tromper de N+1 oriente toute une approche vers la mauvaise
  personne ;
* une ligne qui n'est pas un nom de personne ne fait AUCUNE ligne ;
* la date est celle que le document DIT (« au 12/03/2023 ») ; à défaut celle de
  l'import, et la sortie le dit (`date_basis`) — un organigramme de 2023 ne
  passe pas pour vérifié ce jour ;
* un doublon dans le même document est écarté (le premier gagne) ;
* la sortie est bornée à `ORG_PEOPLE_MAX`, la troncature est annoncée.

Ce module PROPOSE ; il n'écrit rien. Une correction humaine gagne toujours : le
branchement dans le graphe passe par la porte de déclaration existante.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

#: Aligné sur `declareOrgPeopleRequestSchema.people.max(200)`.
ORG_PEOPLE_MAX = 200
#: Le texte d'un document lu au-delà n'est pas balayé.
_SCAN_CHARS = 60_000

_ORG_DOC = re.compile(r"organigramme|org\s*chart|organi[sz]ation(?:al)?\s+chart", re.IGNORECASE)
_NAME_TOKEN = re.compile(r"^[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'’\-]+$")
_PARTICLES = {"de", "du", "des", "la", "le", "van", "von", "da", "di", "el"}
_SEPARATORS = (" — ", " – ", " - ", " : ", ", ")
_MANAGER = re.compile(
    r"\(?\s*(?:rattach[ée]e?\s+[àa]|reports?\s+to|n\+1\s*:?|manager\s*:)\s+([^)\n;|]+?)\s*\)?\s*$",
    re.IGNORECASE,
)
_DAY_FR = re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b")
_DAY_ISO = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")

_HEADERS = {
    "nom": "fullName",
    "nom complet": "fullName",
    "name": "fullName",
    "fonction": "title",
    "poste": "title",
    "titre": "title",
    "title": "title",
    "direction": "entityName",
    "service": "entityName",
    "entite": "entityName",
    "departement": "entityName",
    "manager": "managerName",
    "n+1": "managerName",
    "responsable": "managerName",
    "reports to": "managerName",
}


def _fold(value: str) -> str:
    stripped = "".join(c for c in unicodedata.normalize("NFD", value) if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9+]+", " ", stripped.lower()).strip()


def _looks_like_person(text: str) -> bool:
    tokens = text.split()
    if not 2 <= len(tokens) <= 4 or re.search(r"\d", text):
        return False
    core = [t for t in tokens if t.lower() not in _PARTICLES]
    return len(core) >= 2 and all(_NAME_TOKEN.match(t) or t.isupper() and len(t) > 1 for t in core)


def _document_day(text: str, created_at: str | None) -> tuple[str | None, str]:
    head = text[:600]
    iso = _DAY_ISO.search(head)
    if iso:
        return f"{iso[1]}-{iso[2]}-{iso[3]}", "document"
    fr = _DAY_FR.search(head)
    if fr:
        day, month, year = int(fr[1]), int(fr[2]), int(fr[3])
        if 1 <= month <= 12 and 1 <= day <= 31:
            return f"{year:04d}-{month:02d}-{day:02d}", "document"
    if created_at and re.match(r"^\d{4}-\d{2}-\d{2}", created_at):
        return created_at[:10], "import"
    return None, "unknown"


def _split_cells(line: str) -> list[str] | None:
    for sep in ("|", "\t", ";"):
        if sep in line:
            return [c.strip() for c in line.strip().strip(sep).split(sep)]
    return None


def _table_people(lines: list[str]) -> list[dict[str, str]]:
    columns: list[str | None] | None = None
    out: list[dict[str, str]] = []
    for line in lines:
        cells = _split_cells(line)
        if cells is None:
            continue
        if columns is None:
            mapped = [_HEADERS.get(_fold(c)) for c in cells]
            if "fullName" in mapped:
                columns = mapped
            continue
        row: dict[str, str] = {}
        for field, cell in zip(columns, cells, strict=False):
            if field and cell:
                row[field] = cell
        if _looks_like_person(row.get("fullName", "")):
            out.append(row)
    return out


def _line_person(line: str) -> dict[str, str] | None:
    text = line.strip().lstrip("-•*·▪ ").strip()
    if not text or _split_cells(text) is not None:
        return None
    manager = ""
    found = _MANAGER.search(text)
    if found:
        manager = found[1].strip()
        text = text[: found.start()].strip()
    for sep in _SEPARATORS:
        if sep in text:
            name, _, title = text.partition(sep)
            name = name.strip()
            if _looks_like_person(name):
                person = {"fullName": name}
                if title.strip():
                    person["title"] = title.strip()
                if manager and _looks_like_person(manager):
                    person["managerName"] = manager
                return person
            return None
    return None


def extract_org_people(docs: list[dict[str, Any]]) -> dict[str, Any]:
    """Les personnes déclarables des documents-organigrammes lus. Pure."""
    people: list[dict[str, Any]] = []
    seen: set[str] = set()
    read = 0
    truncated = False
    for doc in docs:
        title = str(doc.get("title") or "").strip() or "Document sans titre"
        text = str(doc.get("content") or "")[:_SCAN_CHARS]
        first_line = next((ln for ln in text.splitlines() if ln.strip()), "")
        if not (_ORG_DOC.search(title) or _ORG_DOC.search(first_line)):
            continue
        read += 1
        day, basis = _document_day(text, doc.get("created_at"))
        lines = text.splitlines()
        rows = _table_people(lines) + [p for p in (_line_person(ln) for ln in lines) if p]
        for row in rows:
            key = _fold(row["fullName"])
            if key in seen:
                continue
            if len(people) >= ORG_PEOPLE_MAX:
                truncated = True
                break
            seen.add(key)
            person: dict[str, Any] = {**row, "source": title, "source_id": doc.get("id"), "date_basis": basis}
            if day:
                person["documentDate"] = day
            people.append(person)
    return {"people": people, "documents_read": read, "truncated": truncated}
