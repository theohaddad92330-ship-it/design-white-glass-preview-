"""#4437 (Louis 21/10/2026, épopée #4433) — un signal DEMANDÉ qui ramène peu s'élargit aux faits VOISINS.

« Un critère n'enferme jamais dans zéro résultat » : quand un recrutement QUALIFIÉ est demandé (« recrutement
React » : la source « hiring » avec un mot-clé) et que la recherche par signal (Découvrir, mode Signaux) rend
moins de ``SIGNAL_WIDEN_BELOW`` comptes, UN palier voisin est tenté, écrit ICI (jamais dans un prompt) :

- le recrutement du DOMAINE du vendeur sans le mot-clé (les offres voisines : front, web…) ;
- les faits voisins du recrutement (``SIGNAL_NEIGHBOURS``) qui n'étaient pas demandés : les appels d'offres
  du domaine, les levées (augmentations de capital).

Une recherche sans qualificatif (sources cochées seules) n'est pas élargie : elle interroge déjà ce qu'on
lui a demandé, et ses sources restent celles cochées.

L'exact reste en tête ; un compte ajouté porte ``widenedFrom`` (pourquoi il est là) et ses signaux sont datés
par leur source. Au-dessus du seuil, ou quand l'appelant demande le strict (``strictSignal``) : rien.
Un voisin est une PROXIMITÉ réelle (un fait publié), jamais une donnée fabriquée.

Le voisinage de COMPÉTENCE (React → JavaScript → développement front) appartient au référentiel de
compétences (``apps/api/src/modules/consultants/skill-referential.ts``, étendu par #4434) : ce palier ne
le devine pas, il lève le mot-clé et laisse le tri métier du vendeur faire le reste.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from app.services.criteria_referential import CRITERIA_WIDEN_MIN_RESULTS

#: En dessous de ce nombre de comptes, un signal demandé s'élargit (seuil de l'épopée #4433, Louis 21/10).
SIGNAL_WIDEN_BELOW = CRITERIA_WIDEN_MIN_RESULTS  # le seuil des critères (GA-26 : un seul endroit)

#: Les faits voisins d'un type de fait demandé, du plus proche au plus lointain.
SIGNAL_NEIGHBOURS: dict[str, tuple[str, ...]] = {"hiring": ("tender", "capital")}


#: Le type de signal que chaque source publie (BODACC B : un fait d'entreprise, « business »).
SOURCE_OF_SIGNAL_TYPE: dict[str, str] = {
    "hiring": "hiring",
    "tender": "tender",
    "award": "award",
    "business": "capital",
}


@dataclass(frozen=True)
class WideningStep:
    """Le palier voisin : les sources à interroger, et si le mot-clé du recrutement est levé."""

    sources: tuple[str, ...]
    drop_keywords: bool


def requested_labels(sources: Sequence[str], keywords: Sequence[str]) -> list[str]:
    """Ce qui a été DEMANDÉ, en jetons machine (``hiring:react``, ``tender``) — l'étiquette du voisin le cite."""
    labels: list[str] = []
    for source in sources:
        if source == "hiring" and keywords:
            labels.extend(f"hiring:{kw}" for kw in keywords)
        else:
            labels.append(source)
    return labels


def qualified_hiring(sources: Sequence[str], keywords: Sequence[str]) -> bool:
    """Un recrutement QUALIFIÉ est-il demandé (la source « hiring » ET un mot-clé) ?"""
    return "hiring" in sources and bool(keywords)


def widening_step(sources: Sequence[str], keywords: Sequence[str]) -> WideningStep | None:
    """Le palier voisin d'un recrutement qualifié, ou ``None`` (rien de voisin à tenter)."""
    if not qualified_hiring(sources, keywords):
        return None
    neighbours = ["hiring", *(n for n in SIGNAL_NEIGHBOURS["hiring"] if n not in sources)]
    return WideningStep(sources=tuple(neighbours), drop_keywords=True)


def should_widen(found: int, *, requested: bool, strict: bool) -> bool:
    """Le garde-fou qui sait dire NON : rien d'élargi au-dessus du seuil, en strict, ou sans signal qualifié."""
    return requested and not strict and found < SIGNAL_WIDEN_BELOW
