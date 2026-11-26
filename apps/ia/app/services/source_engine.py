"""Moteur de recherche actualité multi-source — #2769 / LAU-FINAL-030 (#2289).

Composition, pas réécriture : ce module ne recrée ni la taxonomie de fiabilité
(``source_reliability``, #2289.8/.9 déjà livrées) ni le pipeline de collecte
existant (``phase1_research.py``) — il nomme ce que #2289.1/.2/.3/.4/.5/.12
demandaient et qui n'existait dans aucun fichier : les 16 familles de sources,
un plan de recherche structuré à 10 champs, et les fenêtres de fraîcheur par
objet nommé.

#2289.1/.2 (vérificateur du 26/09) : la première version câblait le plan comme
un simple JOURNAL — ``selected_families`` retenait TOUJOURS les 4 familles
connectées, quel que soit l'objet, et ``phase1_research.py`` ne faisait que le
logger. Un plan qui répond toujours pareil ne DÉCIDE rien. ``OBJECT_TO_FAMILIES``
ci-dessous fait dépendre la sélection de l'objet demandé, et
``should_query_family`` est le point que le routeur consulte réellement avant
de créer la tâche réseau — voir ``phase1_research.py`` (BOAMP/DECP gatés sur
l'objet ``"appel d'offre"``).

Ce que ce module NE fait PAS (honnête, pas un chantier caché) :

- Il ne sélectionne PAS dynamiquement les familles par SECTEUR ni par
  GÉOGRAPHIE (#2289.6 non engagé) : aucune taxonomie des « 4 secteurs nommés »
  n'est vérifiable dans le dépôt (seul un indice partiel, des mots-clés épars
  dans ``decision_role.py``/``offer_domains/portfolio.py``, jamais une liste
  de 4 secteurs affirmée) — en inventer une violerait « jamais de donnée
  fictive ». Le plan reste donc piloté par OBJET + FRAÎCHEUR, pas par secteur.
- Il n'ajoute aucun connecteur réseau : les 12 familles sans connecteur restent
  NOMMÉES, jamais interrogées (#2289.3/.4 — aucune source n'est automatiquement
  exhaustive, et une famille absente ne devient jamais silencieuse).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from app.services.source_reliability import TIER_PUBLIC_FIABLE

# ── 16 familles de sources nommées (#2289.3) ─────────────────────────────────
# Les 4 premières ont un connecteur réel dans ce dépôt aujourd'hui (grep fait,
# 25/09) ; les 12 suivantes sont NOMMÉES sans être fabriquées — reformulées
# telles quelles depuis le registre LAU-FINAL-030 (#2289.3), jamais renommées.


@dataclass(frozen=True)
class SourceFamily:
    """Une des 16 familles nommées. ``connector`` est le module/fonction réel
    qui la sert aujourd'hui, ou ``""`` quand aucun connecteur n'existe — jamais
    un nom de fournisseur inventé pour combler le vide."""

    name: str
    has_connector: bool
    connector: str = ""


SOURCE_FAMILIES: tuple[SourceFamily, ...] = (
    SourceFamily("registres officiels", True, "app.services.data_sources.recherche_entreprises, .inpi_rne"),
    SourceFamily("appels d'offres en cours", True, "app.services.data_sources.public_tenders (BOAMP)"),
    SourceFamily("marchés attribués", True, "app.services.data_sources.decp (DECP)"),
    SourceFamily("pages carrières", True, "app.services.data_sources.france_travail, .apec, .wttj, .ats_boards"),
    SourceFamily("communiqués", False),
    SourceFamily("rapports", False),
    SourceFamily("presse", False),
    SourceFamily("publications réglementaires", False),
    SourceFamily("autorités sectorielles", False),
    SourceFamily("collectivités", False),
    SourceFamily("associations", False),
    SourceFamily("programmes", False),
    SourceFamily("équipes", False),
    SourceFamily("partenaires", False),
    SourceFamily("filiales", False),
    # #2289.11 — profil public (LinkedIn…) : ``linkedin_url`` existe comme
    # DONNÉE déjà connue (recopiée depuis Apollo/Pappers), jamais une famille
    # de RECHERCHE active avec sa propre provenance — reste sans connecteur.
    SourceFamily("profils publics", False),
)

assert len(SOURCE_FAMILIES) == 16  # noqa: S101 — invariant du chantier, pas une validation d'entrée utilisateur


# ── Fenêtres de fraîcheur pour 8 objets nommés (#2289.12) ────────────────────
# 4 déjà couvertes PAR SOURCE (apec/ats_boards/wttj, decp, public_tenders,
# github_org) ; 4 manquaient (budget/entité/certification/projet). Réutilise
# les valeurs déjà en vigueur ailleurs quand elles existent — jamais une
# deuxième valeur devinée pour le même objet.
OBJECT_FRESHNESS_DAYS: dict[str, int] = {
    # France Travail / APEC / WTTJ / ATS : une offre non pourvue après ~1 an
    # est probablement pourvue ou abandonnée (même fenêtre que
    # ``signal_freshness`` type "recrutement" = 180j, mais ici l'objet
    # "poste" couvre le POSTE lui-même, pas le signal de recrutement dérivé).
    "poste": 365,
    "recrutement": 180,  # même fenêtre que signal_freshness._ARCHIVE_AFTER_DAYS_BY_TYPE["recrutement"]
    "appel d'offre": 548,  # public_tenders — un AO publié reste ouvert ~18 mois
    "technologie": 730,  # github_org — un stack technique change lentement
    "budget": 365,  # signal_freshness._ARCHIVE_AFTER_DAYS_BY_TYPE["budget"] — un budget voté se dépense sur l'exercice
    "projet": 545,  # signal_freshness._ARCHIVE_AFTER_DAYS_BY_TYPE["projet"]
    # Nouveaux (n'existaient nulle part) :
    "entité": 730,  # une structure juridique (filiale, établissement) change lentement — même défaut que le seuil archive général
    "certification": 1095,  # durée de validité usuelle d'une certification qualité/ISO (3 ans)
}

assert len(OBJECT_FRESHNESS_DAYS) == 8  # noqa: S101


# ── Quelle famille CONNECTÉE sert chaque objet (#2289.1/.2) ──────────────────
# Une famille sans connecteur ne peut jamais être retenue (pas de fabrication) ;
# un objet que rien ne connecte encore retient une sélection VIDE plutôt qu'une
# famille non pertinente — nommer "aucune source connectée pour cet objet"
# plutôt que d'en inventer une.
_CONNECTED_FAMILY_NAMES = frozenset(f.name for f in SOURCE_FAMILIES if f.has_connector)

OBJECT_TO_FAMILIES: dict[str, tuple[str, ...]] = {
    "poste": ("pages carrières",),  # France Travail/APEC/WTTJ/ATS servent l'objet "poste"
    "recrutement": ("pages carrières",),  # même connecteur, objet "signal de recrutement"
    "appel d'offre": ("appels d'offres en cours", "marchés attribués"),  # BOAMP + DECP
    "entité": ("registres officiels",),  # recherche-entreprises / INPI RNE
    # Aucune famille connectée ne sert ces 4 objets aujourd'hui — sélection
    # VIDE assumée (#2289.4 : jamais de connecteur inventé pour combler le vide).
    "technologie": (),
    "budget": (),
    "projet": (),
    "certification": (),
}

assert set(OBJECT_TO_FAMILIES) == set(OBJECT_FRESHNESS_DAYS)  # noqa: S101 — les 8 objets, jamais un de plus/moins
assert all(  # noqa: S101 — jamais une famille sans connecteur au sein d'une sélection
    set(names) <= _CONNECTED_FAMILY_NAMES for names in OBJECT_TO_FAMILIES.values()
)


def freshness_window_days(objet: str) -> int:
    """La fenêtre de fraîcheur (jours) pour l'un des 8 objets nommés.

    Lève ``ValueError`` sur un objet inconnu — jamais une fenêtre devinée pour
    un objet que ce moteur ne nomme pas."""
    key = str(objet or "").strip().lower()
    if key not in OBJECT_FRESHNESS_DAYS:
        raise ValueError(f"objet de recherche inconnu : {objet!r} — attendu l'un de {sorted(OBJECT_FRESHNESS_DAYS)}")
    return OBJECT_FRESHNESS_DAYS[key]


# ── Plan de recherche structuré à 10 champs (#2289.5) ────────────────────────


@dataclass(frozen=True)
class ResearchPlan:
    """10 champs, tel que demandé (#2289.5) — jamais une exécution, une
    DÉCISION nommée de ce qui sera cherché, jusqu'où, et quand s'arrêter."""

    objet: str  # 1
    secteur: str | None  # 2
    geo: str  # 3
    freshness_window_days: int  # 4
    selected_families: tuple[str, ...]  # 5 — familles CONNECTÉES pertinentes pour CET objet
    families_without_connector: tuple[str, ...]  # 6 — nommées, jamais tues
    reliability_floor: str  # 7 — plancher de fiabilité attendu (source_reliability)
    stop_criteria: str  # 8
    validation_criteria: str  # 9
    created_at: datetime  # 10


def build_research_plan(
    objet: str,
    *,
    secteur: str | None = None,
    geo: str = "FR",
    reliability_floor: str = TIER_PUBLIC_FIABLE,
    now: datetime | None = None,
) -> ResearchPlan:
    """Construit le plan pour ``objet`` (un des 8 objets nommés).

    Sélection des familles (#2289.1/.2 — objet + fraîcheur, PAS secteur) : SEULES
    les familles CONNECTÉES que ``OBJECT_TO_FAMILIES`` nomme pour CET objet sont
    retenues — un objet que rien ne connecte encore (technologie/budget/projet/
    certification) retient une sélection vide, jamais une famille non pertinente
    (#2289.4 : aucune n'est automatiquement exhaustive, chacune reste une source
    parmi d'autres) ; les 12 familles sans connecteur restent nommées séparément,
    jamais silencieuses. C'est cette sélection que ``should_query_family``
    consulte pour décider — réellement — quelle source le routeur interroge."""
    window = freshness_window_days(objet)
    key = str(objet or "").strip().lower()
    selected = OBJECT_TO_FAMILIES[key]
    without = tuple(f.name for f in SOURCE_FAMILIES if not f.has_connector)
    return ResearchPlan(
        objet=objet,
        secteur=secteur,
        geo=geo,
        freshness_window_days=window,
        selected_families=selected,
        families_without_connector=without,
        reliability_floor=reliability_floor,
        stop_criteria=(
            f"un résultat de fiabilité ≥ {reliability_floor} trouvé dans la fenêtre de {window} jours pour "
            f"chaque famille RETENUE, ou toutes les familles retenues épuisées"
        ),
        validation_criteria=(
            "au moins une source non faible corrobore l'affirmation avant de la présenter comme établie "
            "(has_sufficient_grounding, #2289.9)"
        ),
        created_at=now or datetime.now(UTC),
    )


def should_query_family(plan: ResearchPlan, family_name: str) -> bool:
    """Le point unique que l'appelant consulte avant de lancer la tâche réseau
    d'une famille (#2289.1/.2) — jamais une décision réécrite en double au
    point d'appel. ``False`` pour une famille que le plan n'a pas retenue,
    qu'elle ait ou non un connecteur."""
    return family_name in plan.selected_families
