"""# #4465 — la FONCTION d'un contact est son expérience EN COURS chez l'employeur du compte.

Cas bêta (compte CAFPI) : la fonction affichée était l'avant-dernier poste de la personne. Règle, une seule fois :

- une expérience est EN COURS quand elle n'a pas de date de fin et n'est pas marquée terminée (``current`` faux) ;
- parmi celles chez l'employeur du compte, la plus récente par date de début gagne (sans date de début : en dernier) ;
- une expérience terminée n'est JAMAIS choisie ; aucune en cours chez ce compte ⇒ ``None`` (inconnu — l'appelant garde
  ce qu'il avait, jamais une valeur devinée).

Pur, sans I/O. Lit les deux formes d'historique Apollo : la légère (``organization``) et la riche (``organization_name``).
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

_LEGAL_WORDS = re.compile(r"\b(sa|sas|sasu|sarl|eurl|snc|se|spa|gmbh|ltd|inc|plc|group|groupe|holding|societe|the)\b")


def _fold(value: object) -> str:
    text = unicodedata.normalize("NFD", str(value or "")).encode("ascii", "ignore").decode().lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", _LEGAL_WORDS.sub(" ", text)).strip()


def same_employer(left: object, right: object) -> bool:
    """« Cafpi SA » chez « CAFPI » : l'un contient l'autre, à la forme juridique près."""
    a, b = _fold(left), _fold(right)
    return bool(a) and bool(b) and (a in b or b in a)


def _organization(entry: dict[str, Any]) -> str:
    return str(entry.get("organization") or entry.get("organization_name") or "").strip()


def is_ongoing(entry: dict[str, Any]) -> bool:
    return not str(entry.get("end_date") or "").strip() and entry.get("current") is not False


def pick_current_position(history: object, employer: str | None) -> dict[str, Any] | None:
    """L'expérience en cours la plus récente chez ``employer``, ou ``None`` si on ne peut pas la dire."""
    if not isinstance(history, list) or not (employer or "").strip():
        return None
    ongoing = [
        (index, entry)
        for index, entry in enumerate(history)
        if isinstance(entry, dict)
        and is_ongoing(entry)
        and str(entry.get("title") or "").strip()
        and same_employer(_organization(entry), employer)
    ]
    if not ongoing:
        return None
    # Début le plus récent d'abord ; sans début en dernier ; à égalité l'ordre fournisseur.
    ongoing.sort(key=lambda pair: (str(pair[1].get("start_date") or "") == "", _neg(str(pair[1].get("start_date") or "")), pair[0]))
    return ongoing[0][1]


def _neg(date: str) -> tuple[int, ...]:
    return tuple(-ord(ch) for ch in date)
