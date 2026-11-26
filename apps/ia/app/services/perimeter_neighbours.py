"""#AM.54 (#4058) — le PÉRIMÈTRE d'une expertise demandée, et ses voisins AUTORISÉS.

« Interlocuteurs cyber GRC chez EDF » : un responsable fiscal ou une offre électricité n'est pas la bonne personne,
même s'il est rendu par la recherche. Ce module juge chaque personne lue contre l'expertise demandée :

* `exact` — son intitulé nomme l'expertise (GRC, gouvernance, risque, conformité… pour « GRC » ; cyber, sécurité… pour
  « cyber ») ;
* `neighbour` — son intitulé est d'un périmètre voisin AUTORISÉ (RSSI, DSI sécurité, conformité) : proposé comme tel,
  jamais présenté comme l'expert demandé ;
* hors périmètre — écarté, compté, jamais rendu comme la bonne personne.

Une expertise que ce module ne connaît pas ⇒ `None` : le résultat de l'outil reste byte-identique. Aucun nom n'est
inventé : on ne fait que classer des personnes déjà lues, sur leur intitulé.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any

_GRC_TERMS = ("grc", "gouvernance", "governance", "risque", "risk", "conformite", "compliance")
_CYBER_TERMS = ("cyber", "securite", "security", "ssi")
# Les voisins autorisés de toute demande cyber / GRC (mots entiers, sans accents).
_NEIGHBOURS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("RSSI", re.compile(r"\b(?:rssi|ciso)\b")),
    ("DSI sécurité", re.compile(r"\bdsi\b.*\bsecurit|\bsecurit\w*\b.*\bdsi\b|\bresponsable securite\b")),
    ("conformité", re.compile(r"\bconformite\b|\bcompliance\b|\bdpo\b")),
)
_ASKED = re.compile(
    r"cyber|grc|ssi\b|securit|security|gouvernance|governance|risque|risk|conformit|compliance|rssi|ciso"
)


def _fold(text: object) -> str:
    plain = "".join(c for c in unicodedata.normalize("NFD", str(text or "")) if unicodedata.category(c) != "Mn")
    return " ".join(plain.lower().split())


def _has_term(title: str, terms: tuple[str, ...]) -> bool:
    return any(re.search(rf"\b{re.escape(term)}", title) for term in terms)


@dataclass
class PerimeterReading:
    asked: str
    exact: list[dict[str, Any]] = field(default_factory=list)
    neighbours: list[dict[str, Any]] = field(default_factory=list)
    dropped: int = 0
    limit: str = ""

    @property
    def kept(self) -> list[dict[str, Any]]:
        return [*self.exact, *self.neighbours]


def read_perimeter(asked: str | None, contacts: list[dict[str, Any]]) -> PerimeterReading | None:
    """Classe `contacts` contre l'expertise `asked`, ou ``None`` si elle n'est pas du périmètre cyber / GRC."""
    folded = _fold(asked)
    if not folded or not _ASKED.search(folded):
        return None
    wants_grc = _has_term(folded, _GRC_TERMS)
    core = _GRC_TERMS if wants_grc else _CYBER_TERMS
    reading = PerimeterReading(asked=str(asked).strip())
    for contact in contacts:
        title = _fold(contact.get("title") or contact.get("role"))
        if _has_term(title, core) and not (not wants_grc and _has_term(title, ("grc",))):
            reading.exact.append({**contact, "perimeter_fit": "exact"})
            continue
        via = next((label for label, pattern in _NEIGHBOURS if pattern.search(title)), None)
        if via is None and not wants_grc and _has_term(title, _GRC_TERMS):
            via = "GRC"
        if via is None and wants_grc and _has_term(title, _CYBER_TERMS):
            via = "cyber"
        if via is not None:
            reading.neighbours.append({**contact, "perimeter_fit": "neighbour", "perimeter_via": via})
        else:
            reading.dropped += 1
    reading.limit = _limit(reading, total=len(contacts))
    return reading


def _limit(reading: PerimeterReading, *, total: int) -> str:
    if reading.exact:
        return ""
    if reading.neighbours:
        vias = ", ".join(dict.fromkeys(str(row["perimeter_via"]) for row in reading.neighbours))
        return (
            f"Aucun responsable {reading.asked} connu sur ce compte. Périmètre voisin autorisé proposé comme tel "
            f"({vias}) : ce n'est pas l'expert {reading.asked}, dis-le."
        )
    return (
        f"Aucun responsable {reading.asked} connu sur ce compte, ni voisin autorisé (RSSI, DSI sécurité, conformité) : "
        f"{total} personnes lues, toutes hors périmètre — limite exacte à dire, puis propose la recherche de nouvelles "
        "personnes sur ce rôle (propose_people_search). Ne présente aucune de ces personnes comme la bonne."
    )
