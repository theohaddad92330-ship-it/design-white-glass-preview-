"""#4408 — « pas de gros process achat » : UNE mesure déterministe, partagée.

Recette 21/10 : « sans gros process achat » rendait deux mutuelles nationales. La contrainte
n'avait aucune porte dans l'outil de recherche de Laura (régression de #3705, qui n'avait posé que
des NOTES au modèle, `purchasing_barrier_note`, et seulement pour une tranche d'effectif demandée).
Décision #4036 Q8 (19/10) : le critère « processus d'achat » est GARDÉ ; le modèle d'achat est une
liste fermée.

Deux preuves, dans cet ordre (GA-26 : une seule fonction pour Laura et Découvrir) :
- un compte DÉJÀ ANALYSÉ porte sa barrière calculée (`accessBarrier.access_class`) : elle fait foi ;
- sinon, ce que le registre SAIT : catégorie « GE », ou tranche d'effectif ≥ 5 000 salariés.
Aucune donnée de taille = aucune preuve = le compte RESTE (jamais écarté sur une absence).
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Mapping, Sequence
from typing import Any

from app.services.access_scoring import headcount_from_tranche

#: Valeurs du paramètre `purchasing_process` (liste fermée, #4036 Q7).
PURCHASING_PROCESS_VALUES: tuple[str, ...] = ("light",)

#: Seuil de « gros process » côté registre : borne BASSE de la tranche 5 000-9 999.
_HEAVY_HEADCOUNT = 5000
#: #4408 — pour une demande de « petite structure », une ETI (≥ 250 salariés, tailles maison TPE/PME/ETI/GC)
#: est LOURDE : process d'achat structuré. Mesuré sur la tranche INSEE, la catégorie ou l'effectif exact.
_ETI_HEADCOUNT = 250
#: Classes de la barrière calculée qui valent « process lourd » (C semi-ouvert, D verrouillé).
_HEAVY_CLASSES = frozenset({"C", "D"})


def _tranche_floor(code: Any) -> int | None:
    """Borne BASSE d'une tranche INSEE (la borne haute de la tranche d'en dessous + 1)."""
    upper = headcount_from_tranche(code)
    if upper is None:
        return None
    return {19: 10, 49: 20, 99: 50, 199: 100, 249: 200, 499: 250, 999: 500, 1999: 1000, 4999: 2000,
            9999: 5000, 20000: 10000}.get(upper)


def heavy_purchasing_reason(row: Mapping[str, Any]) -> str | None:
    """La raison NOMMÉE d'un process d'achat lourd probable, ou ``None`` (pas de preuve)."""
    barrier = row.get("accessBarrier")
    if isinstance(barrier, Mapping) and barrier.get("access_class") in _HEAVY_CLASSES:
        label = str(barrier.get("label") or "").strip() or "barrière d'achat élevée"
        return f"barrière d'achat calculée sur le compte analysé : {label}"
    reasons: list[str] = []
    category = str(row.get("sizeClass") or row.get("category") or "").strip().upper()
    floor = _tranche_floor(row.get("headcountTranche"))
    count = row.get("headcount")
    exact = count if isinstance(count, int) and not isinstance(count, bool) else None
    if category == "GE":
        reasons.append("grande entreprise (catégorie GE du registre)")
    if floor is not None and floor >= _HEAVY_HEADCOUNT:
        reasons.append(f"effectif {floor:,}+ salariés".replace(",", " "))
    elif floor is None and exact is not None and exact >= _HEAVY_HEADCOUNT:
        reasons.append(f"effectif {exact:,} salariés".replace(",", " "))
    if not reasons and (
        category == "ETI"
        or (floor is not None and floor >= _ETI_HEADCOUNT)
        or (floor is None and exact is not None and exact >= _ETI_HEADCOUNT)
    ):
        reasons.append("ETI — process d'achat structuré")
    return " ; ".join(reasons) or None


def has_size_data(row: Mapping[str, Any]) -> bool:
    count = row.get("headcount")
    return bool(
        row.get("sizeClass") or row.get("category") or row.get("accessBarrier")
        or _tranche_floor(row.get("headcountTranche")) is not None
        or (isinstance(count, int) and not isinstance(count, bool))
    )


def split_heavy_purchasing(
    candidates: Sequence[Mapping[str, Any]],
) -> tuple[list[Mapping[str, Any]], list[dict[str, str]]]:
    """``(retenus, écartés)`` — l'ordre est gardé ; chaque écarté dit sa raison."""
    kept: list[Mapping[str, Any]] = []
    dropped: list[dict[str, str]] = []
    for row in candidates:
        reason = heavy_purchasing_reason(row)
        if not reason:
            kept.append(row)
            continue
        entry = {"name": str(row.get("name") or "").strip(), "siren": str(row.get("siren") or "").strip(), "reason": reason}
        dropped.append(entry)
    return kept, dropped


#: #4408.1 — la consigne, telle qu'on la DIT (accents et casse repliés). Liste fermée : un mot hors liste ne pose rien.
_LIGHT_ASKED_RE = re.compile(
    r"\bpetites? structures?\b"
    r"|\b(?:pas de|sans)\s+gros(?:ses?)?\s+process(?:us)?(?:\s+d)?\s*(?:'|\s)?\s*achats?\b"
    r"|\b(?:pas de|sans)\s+grands?\s+groupes?\b"
    r"|\bPME\b|\bTPE\b",
    re.IGNORECASE,
)


def _fold(text: str) -> str:
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().replace("\u2019", "'")


def light_purchasing_asked(message: str, history: Sequence[Mapping[str, Any]]) -> bool:
    """#4408.1 — la personne a-t-elle demandé « petite structure / pas de gros process achat » ?

    Recette prod 25/10 : la porte `purchasing_process` n'agissait que si le MODÈLE la passait, et il ne la passait
    pas. Lue ici dans le message du tour et les tours PRÉCÉDENTS de la personne (une contrainte posée tient le
    fil) ; jamais dans un tour de l'assistant.
    """
    texts = [message, *(str(t.get("content") or "") for t in history if t.get("role") == "user")]
    return any(_LIGHT_ASKED_RE.search(_fold(text)) for text in texts if text)
