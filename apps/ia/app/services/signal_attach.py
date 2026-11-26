"""#4437 (Louis 21/10/2026, épopée #4433) — un signal au libellé LIBRE est rattaché au plus proche du référentiel.

Le référentiel des signaux d'intention est fermé (``tender``, ``award``, ``hiring``). Un libellé hors liste
(« recrutement React », « marché attribué », « consultation ») ne disparaît plus en silence : il est rattaché
au signal le plus proche par ses racines, et le rattachement se DIT (``line``). Un libellé sans voisin est
NOMMÉ (``unmatched``), jamais rattaché au hasard ni inventé.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Sequence
from dataclasses import dataclass, field

#: Racines (sans accents, minuscules) → signal du référentiel. L'ordre compte : l'attribution gagne sur l'appel d'offres.
_STEMS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("award", ("attribu", "remport", "adjug", "notifi", "marche gagne", "marche public gagne")),
    ("tender", ("appel d offre", "appels d offre", "consultation", "marche public", "dce", "rfp", "tender", "ao ")),
    ("hiring", ("recrut", "embauch", "offre d emploi", "offres d emploi", "poste", "hiring", "job", "cdi", "cdd")),
)


def _fold(value: str) -> str:
    text = unicodedata.normalize("NFD", value)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn").lower()
    return " " + " ".join(re.findall(r"[a-z0-9+#]+", text.replace("'", " "))) + " "


@dataclass(frozen=True)
class SignalAttachment:
    signals: list[str] = field(default_factory=list)
    attached: list[dict[str, str]] = field(default_factory=list)
    unmatched: list[str] = field(default_factory=list)
    line: str | None = None


def attach_signals(raw: object, allowed: Sequence[str]) -> SignalAttachment:
    """Les signaux du référentiel (ordre canonique), ce qui a été rattaché, ce qui reste sans voisin."""
    values = raw if isinstance(raw, list) else []
    known: set[str] = set()
    attached: list[dict[str, str]] = []
    unmatched: list[str] = []
    for value in values:
        label = str(value).strip() if isinstance(value, str) else ""
        if not label:
            continue
        if label.lower() in allowed:
            known.add(label.lower())
            continue
        folded = _fold(label)
        target = next(
            (key for key, stems in _STEMS if key in allowed and any(f" {s.strip()}" in folded for s in stems)),
            None,
        )
        if target is None:
            unmatched.append(label)
            continue
        known.add(target)
        attached.append({"asked": label, "attachedTo": target})
    line = None
    if attached:
        line = "Rattaché au signal le plus proche : " + " ; ".join(f"« {a['asked']} » → {a['attachedTo']}" for a in attached) + "."
    return SignalAttachment(
        signals=[key for key in allowed if key in known], attached=attached, unmatched=unmatched, line=line
    )
