"""#2257.12/.13/.14 — HORIZON, URGENCE, NIVEAU DE DÉTAIL (LAU-FINAL-002, reste
du 25/09/2026).

Mesuré au registre `.claude/notes/registre-2026-09-17-lau-002-2257.md` : trois
des dix-huit champs du contrat de demande structuré (#2257.1) n'avaient aucun
producteur — `horizon`, `urgence`, `niveau_detail` restaient toujours `None`.
`#2321` (`intent_router.py`) avait déjà posé le PATRON à suivre pour un
producteur déterministe de ce compilateur : des marqueurs **déclarés** (FR et
EN), une comparaison sur des frontières de mot (jamais une sous-chaîne), et
surtout — aucun appel de modèle, aucune valeur devinée. Ce module applique le
même patron à ces trois champs ; il ne redéfinit ni le normalisateur ni le
principe (GA-26).

⚠️ L'ABSENCE DE MARQUEUR N'EST JAMAIS UNE VALEUR. Un message sans marqueur
d'urgence n'est pas `"normal"`, un message sans marqueur d'horizon n'est pas
`"non_precise"` — chaque fonction rend `None` : la doctrine « non mesuré n'est
jamais 0 » s'applique ici à un champ de contrat plutôt qu'à un score.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Sequence


def _normalize(message: str) -> str:
    """Minuscules, accents retirés, apostrophes typographiques ramenées à
    l'apostrophe droite, espaces tassés — même normalisation que
    `intent_router._normalize` (#2321), dupliquée ici volontairement : les deux
    modules n'ont pas de dépendance l'un vers l'autre (aucun n'est un détail
    d'implémentation de l'autre)."""
    text = message or ""
    text = unicodedata.normalize("NFD", text)
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    for quote in ("‘", "’", "ʼ"):
        text = text.replace(quote, "'")
    return " ".join(text.lower().split())


def _has_any(haystack: str, markers: Sequence[str]) -> bool:
    """Un marqueur compte seulement sur une FRONTIÈRE DE MOT — jamais en simple
    sous-chaîne (même défaut mesuré sur le routeur #2321 : « candidature »
    n'est pas « candidat »)."""
    return any(
        re.search(rf"(?<![a-z0-9]){re.escape(_normalize(marker))}(?![a-z0-9])", haystack) for marker in markers
    )


#: #2257.12 — HORIZON : catégories FERMÉES, dans l'ordre de priorité en cas de
#: marqueurs de plusieurs catégories dans le même message (le plus proche gagne).
_HORIZON_MARKERS: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        "immediat",
        (
            "aujourd'hui",
            "maintenant",
            "tout de suite",
            "des maintenant",
            "demain",
            "today",
            "tomorrow",
            "right now",
            "right away",
        ),
    ),
    (
        "cette_semaine",
        ("cette semaine", "d'ici vendredi", "this week", "by friday"),
    ),
    (
        "ce_mois",
        ("ce mois", "ce mois-ci", "d'ici la fin du mois", "this month", "by the end of the month"),
    ),
    (
        "ce_trimestre",
        ("ce trimestre", "d'ici la fin du trimestre", "this quarter", "by the end of the quarter"),
    ),
)


def horizon_from_message(message: str) -> str | None:
    """#2257.12 — l'HORIZON temporel déclaré. `None` si aucun marqueur."""
    text = _normalize(message)
    for category, markers in _HORIZON_MARKERS:
        if _has_any(text, markers):
            return category
    return None


#: #2257.13 — URGENCE : une seule catégorie possible, `"urgent"`. Il n'existe
#: pas de marqueur « normal » à détecter : l'absence de marqueur EST l'absence
#: d'information, jamais une urgence nulle mesurée.
_URGENCY_MARKERS: tuple[str, ...] = (
    "urgent",
    "urgente",
    "en urgence",
    "en urgence absolue",
    "vite",
    "au plus vite",
    "des que possible",
    "sans attendre",
    "ca presse",
    "urgently",
    "asap",
    "as soon as possible",
)


def urgency_from_message(message: str) -> str | None:
    """#2257.13 — l'URGENCE déclarée. `"urgent"` ou `None` — jamais `"normal"`."""
    return "urgent" if _has_any(_normalize(message), _URGENCY_MARKERS) else None


#: #2257.14 — NIVEAU DE DÉTAIL : deux catégories fermées.
_DETAIL_LEVEL_MARKERS: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        "bref",
        ("en bref", "brievement", "un resume", "en resume", "sans rentrer dans le detail", "briefly", "in short", "a quick summary"),
    ),
    (
        "detaille",
        (
            "en detail",
            "en detaille",
            "de maniere detaillee",
            "un rapport complet",
            "exhaustif",
            "in detail",
            "in depth",
            "exhaustive",
        ),
    ),
)


def detail_level_from_message(message: str) -> str | None:
    """#2257.14 — le NIVEAU DE DÉTAIL déclaré. `None` si aucun marqueur."""
    text = _normalize(message)
    for category, markers in _DETAIL_LEVEL_MARKERS:
        if _has_any(text, markers):
            return category
    return None
