"""Agrégation de signaux de recrutement — #3204.6/.7 (épopée #3238), partie
AGRÉGATION de LAU-FINAL-210.

> « Plusieurs offres rapprochées peuvent former un signal plus fort :
> expansion d'équipe, création d'un pôle, transformation technologique,
> tension de recrutement. Mais la synthèse doit citer les offres qui la
> soutiennent. »

Zéro LLM : `classify_hiring_signal` (`hiring_signal.py`) classe un signal À LA
FOIS ; ce module lit l'ENSEMBLE des signaux `hiring` déjà classés d'un même
employeur et détecte TEAM_GROWTH_SIGNAL — au moins deux offres de la MÊME
famille métier (`job_family.py`), toutes deux `internal_hiring` ou
`staffing_signal` (jamais `contracting`/`agency_posting`, qui ne disent rien
d'un effectif interne qui grandit), citant les offres qui la soutiennent.

REPLACEMENT_SIGNAL (#3204.7, reste — livré le 30/09) suit une règle DIFFÉRENTE
de TEAM_GROWTH_SIGNAL : une seule offre suffit, à condition qu'elle porte la
preuve la plus stricte possible — un marqueur EXPLICITE de départ/succession
dans son propre texte (`job_context.derive_replacement_signal`), jamais une
récurrence d'offres. Déduire un remplacement d'un simple volume confondrait
croissance et remplacement, ce que la RÈGLE de la spec interdit explicitement
(« plusieurs recrutements peuvent indiquer une croissance, pas un
remplacement sans preuve de départ ») — c'est pour ça que `aggregate_team_growth`
et `aggregate_replacement_signals` ne partagent aucune logique de seuil.
"""

from __future__ import annotations

from typing import TypedDict

# Un signal `hiring` ne compte pour une croissance d'équipe que s'il dit un
# EFFECTIF (interne ou une tension de capacité) — jamais une prestation ou une
# offre d'intermédiaire, qui ne parlent pas de la structure de l'employeur.
_GROWTH_CLASSES = {"internal_hiring", "staffing_signal"}

# En-dessous de ce nombre d'offres de la même famille, ce n'est pas encore un
# ensemble qui « forme un signal plus fort » — juste une offre isolée.
_MIN_SUPPORTING_OFFERS = 2


class SupportingOffer(TypedDict):
    label: str
    date: str


class AggregatedHiringSignal(TypedDict):
    aggregateClass: str
    jobFamily: str
    supportingOffers: list[SupportingOffer]
    reason: str


def aggregate_team_growth(signals: list[dict]) -> list[AggregatedHiringSignal]:
    """Détecte un TEAM_GROWTH_SIGNAL par famille métier, sur les signaux
    `hiring` déjà classés d'un même employeur. Liste vide si aucune famille
    n'atteint le seuil — jamais un signal agrégé deviné sur une seule offre."""
    by_family: dict[str, list[dict]] = {}
    for signal in signals:
        if signal.get("type") != "hiring":
            continue
        if signal.get("hiringSignalClass") not in _GROWTH_CLASSES:
            continue
        family = signal.get("jobFamily")
        if not family:
            continue
        by_family.setdefault(family, []).append(signal)

    aggregated: list[AggregatedHiringSignal] = []
    # Ordre déterministe : les familles triées par nom, jamais l'ordre
    # d'insertion (dépendant de l'ordre de moisson des sources).
    for family in sorted(by_family):
        offers = by_family[family]
        if len(offers) < _MIN_SUPPORTING_OFFERS:
            continue
        supporting = sorted(
            ({"label": str(o.get("label") or ""), "date": str(o.get("date") or "")} for o in offers),
            key=lambda o: o["date"],
            reverse=True,
        )
        aggregated.append(
            {
                "aggregateClass": "team_growth_signal",
                "jobFamily": family,
                "supportingOffers": supporting,
                "reason": f"{len(supporting)} offres {family} rapprochées — expansion probable de cette équipe.",
            }
        )
    return aggregated


def aggregate_replacement_signals(signals: list[dict]) -> list[AggregatedHiringSignal]:
    """Détecte un REPLACEMENT_SIGNAL par offre marquée `replacementSignal`
    (#3204.7, reste). Contrairement à `aggregate_team_growth`, UNE offre
    suffit : la preuve est le marqueur explicite de SON texte, jamais une
    récurrence — chaque offre marquée produit sa PROPRE entrée."""
    aggregated: list[AggregatedHiringSignal] = []
    for signal in signals:
        if signal.get("type") != "hiring":
            continue
        if signal.get("replacementSignal") is not True:
            continue
        label = str(signal.get("label") or "")
        aggregated.append(
            {
                "aggregateClass": "replacement_signal",
                "jobFamily": str(signal.get("jobFamily") or ""),
                "supportingOffers": [{"label": label, "date": str(signal.get("date") or "")}],
                "reason": "Le texte de cette offre nomme explicitement un remplacement ou une succession.",
            }
        )
    return aggregated


__all__ = [
    "AggregatedHiringSignal",
    "SupportingOffer",
    "aggregate_replacement_signals",
    "aggregate_team_growth",
]
