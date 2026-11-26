"""L'archétype du compte pilote la COLLECTE (annexe méthodo p3/p19, DoD p31 n°3).

Le trou : « compte public vs startup → procurement, SOURCES et temporalité
différents » exige que les sources interrogées dépendent de l'archétype. Or
l'archétype était calculé à la toute fin de la phase 1, APRÈS la collecte — donc
BOAMP (appels d'offres) et DECP (marchés attribués), qui sont des sources de
SECTEUR PUBLIC, tournaient inconditionnellement pour tout compte français, y
compris une startup qui n'a par définition aucun marché public.

Ce module classe un archétype PRÉLIMINAIRE à partir des seuls signaux déjà
résolus quand la collecte démarre — le pays demandé et, quand la désambiguïsation
a un gagnant net, le NAF / la taille de ce candidat de registre. Il décide ensuite
quelles sources sont pertinentes.

Sûreté, non négociable (« JAMAIS de fallback inventé », « ne pas perdre de
signal ») :
  - on ne SKIPPE une source publique française QUE lorsque le compte ne peut PAS
    en avoir : un siège hors de France (les marchés publics FR ne le concernent
    pas) ou une startup avérée (aucun marché public). Tout le reste — y compris
    un archétype inconnu — garde le comportement historique (tout tourne) ;
  - on ne classe jamais public/non-public par supposition : sans NAF ni pays
    tranchant, l'archétype reste `inconnu` et rien n'est retiré.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.services.sales_context import _FR_COUNTRIES, classify_account_archetype


@dataclass(frozen=True)
class CollectionPlan:
    """Ce que l'archétype préliminaire change à la collecte.

    `archetype` est la classification préliminaire (peut rester `inconnu`).
    `run_public_tenders` gate BOAMP + DECP (les deux sources de secteur public
    français). `reason` explique la décision pour la télémétrie."""

    archetype: str
    run_public_tenders: bool
    reason: str


def preliminary_account_archetype(
    *,
    country: str | None = None,
    naf_code: str | None = None,
    sector_text: str | None = None,
    employees: Any = None,
    subsidiary_count: int | None = None,
) -> str:
    """L'archétype dérivable AVANT la collecte, des seuls signaux déjà résolus.

    Réutilise le classifieur canonique `classify_account_archetype` : mêmes
    règles que l'archétype final, mais nourri des seuls faits précoces. Renvoie
    l'un des archétypes du contrat, ou `inconnu` quand rien ne tranche."""
    archetype, _derivation, _confidence, _evidence = classify_account_archetype(
        sector_text,
        employees=employees,
        country=country,
        subsidiary_count=subsidiary_count,
        naf_code=naf_code,
    )
    return archetype


def plan_collection(
    *,
    country: str | None = None,
    naf_code: str | None = None,
    sector_text: str | None = None,
    employees: Any = None,
    subsidiary_count: int | None = None,
) -> CollectionPlan:
    """Décide quelles sources interroger, d'après l'archétype préliminaire.

    Règle de gate (conservatrice par conception) : les sources de secteur public
    français (BOAMP appels d'offres, DECP marchés attribués) sont IGNORÉES
    seulement pour un compte qui ne peut pas en avoir — siège hors France, ou
    startup avérée. Sinon elles tournent, comme aujourd'hui."""
    country_norm = (country or "").strip().lower()
    is_foreign = bool(country_norm) and country_norm not in _FR_COUNTRIES

    archetype = preliminary_account_archetype(
        country=country,
        naf_code=naf_code,
        sector_text=sector_text,
        employees=employees,
        subsidiary_count=subsidiary_count,
    )

    # 1) Siège hors France : les marchés publics FRANÇAIS ne le concernent pas.
    #    (Un pack pays prend le relais des sources locales en amont.)
    if is_foreign or archetype == "international":
        return CollectionPlan(
            archetype="international" if archetype == "inconnu" else archetype,
            run_public_tenders=False,
            reason="siège hors France : BOAMP/DECP (marchés publics FR) non pertinents",
        )

    # 2) Startup avérée : pas de marché public à son nom.
    if archetype == "startup":
        return CollectionPlan(
            archetype="startup",
            run_public_tenders=False,
            reason="startup : aucun marché public attendu, BOAMP/DECP ignorés",
        )

    # 3) Tout le reste — y compris `inconnu` : comportement historique, on ne
    #    retire rien. Un compte public voit ses appels d'offres, un compte dont on
    #    ne sait rien aussi (on ne présume jamais l'absence de signal).
    return CollectionPlan(
        archetype=archetype,
        run_public_tenders=True,
        reason="archétype pouvant porter des marchés publics (ou inconnu) : sources publiques conservées",
    )
