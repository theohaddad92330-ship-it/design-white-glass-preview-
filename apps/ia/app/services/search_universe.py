"""#3208/#214 (épopée #3229) — SEARCH UNIVERSE, COVERAGE ET RÉPONSE À UNE
DEMANDE TROP LARGE (LAU-FINAL-214).

Ce qui n'existait pas
---------------------
Vérifié le 28/09/2026 sur ``origin/main`` : ``git grep`` de ``SearchUniverse``,
``coverage_basis``, ``estimated_coverage`` ne rend AUCUN résultat repo-wide.
Le seul précédent partiel est la discipline de dénominateur de l'agrégat de
couverture du PORTEFEUILLE (``MarketMemoryService.portfolioFor``, quatre
paniers ``covered/insufficientObservations/ambiguous/unresolved``, doctrine
GA-259) — scopée à un écran, jamais généralisée à une réponse de chat
arbitraire (« toutes les filiales », « tous les décideurs »…).

Ce que ce module fait, et ce qu'il ne fait pas
------------------------------------------------
* #214.1 — ``SearchUniverse`` : les DIX champs du ticket, déclarés AVANT de
  répondre à une demande large. Une donnée que l'appelant ne connaît pas
  reste un tuple/``None`` vide — jamais devinée (doctrine « jamais de donnée
  fictive »).
* #214.2/.3 — ``CoverageReport`` : les DIX paliers du ticket, chacun un champ
  À PART. Ils ne se fusionnent JAMAIS dans un total : ``to_wire()`` les rend
  un par un, et ``coverage_report_lines`` les ÉCRIT un par ligne (l'exemple
  contacts du ticket : 214 → 81 → 18 → 9 → 6, jamais « six décideurs »).
* #214.5 — les cinq seuils qualité, chacun ``None`` (« non mesuré », jamais 0
  — GA-18/19) tant que l'appelant n'a pas mesuré l'entrée qui le nourrit.
* #214.6 — ``broad_request_response`` : les meilleurs VÉRIFIÉS (bornés), le
  reste en job, la couverture actuelle, ce qui exige un approfondissement —
  câblée sur la branche LAUNCH_JOB déjà réelle de ``laura_router``/
  ``chat_orchestrator`` (#2146.9), jamais un second système de job.
* ``exhaustiveness_claim_allowed`` — LE CONTRAT que le ticket réclame avant
  qu'un mot absolu (« tous », « exhaustif », « complet ») soit permis. Câblé
  ce lot sur le guard ``unjustified_absolute_claims`` (#214.4/.7,
  ``chat_turn_plan.py``, épopée #3229).
* ``build_search_universe`` — le ``SearchUniverse`` n'était pas encore
  construit à partir d'une demande RÉELLE (aucun ``build_search_universe``
  déterministe sur cette branche). ``population`` reste la demande VERBATIM
  (jamais devinée) ; ``geographies``/``roles`` sont des MARQUEURS détectés
  (même méthode que ``source_plan.py`` pour INTERNAL_ONLY/CURRENT_PUBLIC) —
  les rôles réutilisent ``buying_committee.ROLE_LABELS`` (GA-26 : un
  vocabulaire de rôles vit à un seul endroit, jamais un second ici) plutôt que
  d'en inventer un nouveau. ``periods``/``sources``/``limits``/``pagination``/
  ``relevance_criteria`` restent vides : leur forme n'est écrite nulle part
  dans le ticket au-delà de l'exemple contacts, et un contrat non vérifiable
  ne se devine pas.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.knowledge.buying_committee import ROLE_LABELS


@dataclass(frozen=True)
class SearchUniverse:
    """#214.1 — les dix champs du ticket, ni plus ni moins."""

    population: str
    entities_covered: tuple[str, ...] = ()
    geographies: tuple[str, ...] = ()
    roles: tuple[str, ...] = ()
    periods: tuple[str, ...] = ()
    sources: tuple[str, ...] = ()
    exclusions: tuple[str, ...] = ()
    limits: tuple[str, ...] = ()
    pagination: str | None = None
    relevance_criteria: tuple[str, ...] = ()

    def to_wire(self) -> dict[str, object]:
        return {
            "population": self.population,
            "entities_covered": list(self.entities_covered),
            "geographies": list(self.geographies),
            "roles": list(self.roles),
            "periods": list(self.periods),
            "sources": list(self.sources),
            "exclusions": list(self.exclusions),
            "limits": list(self.limits),
            "pagination": self.pagination,
            "relevance_criteria": list(self.relevance_criteria),
        }


# ── #214.1 (réel) — construire un SearchUniverse à partir d'une demande, sans
# rien deviner : ``population`` reste le texte VERBATIM ; ``geographies`` et
# ``roles`` sont des MARQUEURS trouvés dans ce texte, jamais des champs
# complétés par défaut.

#: Le marqueur d'une demande de POPULATION LARGE, dans les mots mêmes des
#: QUESTIONS CONCERNÉES du ticket (« toutes les… », « tous les… », « les
#: cinquante… »). Une nouvelle famille de nombres épelés s'ajoute ICI, jamais
#: en dupliquant ce détecteur ailleurs (GA-26).
_BROAD_POPULATION_MARKERS = re.compile(
    r"\b(?:tous les|toutes les|l['’]ensemble des|l['’]ensemble de|"
    r"les (?:cinquante|cent|trente|quarante|soixante|vingt)|"
    r"all the|every|the (?:fifty|hundred|thirty|forty|sixty|twenty))\b",
    re.IGNORECASE,
)


def detect_broad_population_marker(text: str) -> bool:
    """#214.1 — la demande porte-t-elle sur une population LARGE ? Déterministe,
    sans appel de modèle, même famille que ``source_plan.detect_search_mode``."""
    return bool(_BROAD_POPULATION_MARKERS.search(text or ""))


#: Quelques géographies canoniques déjà vues dans ce produit (profil ESN
#: Paris/Grand Est, demandes « France entière ») — une liste MINIMALE,
#: extensible, jamais une géographie devinée hors de ces marqueurs.
_GEOGRAPHY_MARKERS: tuple[tuple[str, str], ...] = (
    ("france entière", "France entière"),
    ("france-wide", "France entière"),
    ("nationwide", "France entière"),
    ("île-de-france", "Île-de-France"),
    ("ile-de-france", "Île-de-France"),
    ("grand est", "Grand Est"),
    ("paris", "Paris"),
    ("france", "France"),
)


def _detect_geographies(text: str) -> tuple[str, ...]:
    # Le marqueur reconnu est EFFACÉ du reste à comparer (pas seulement de
    # ``found``) : « France » est une sous-chaîne de « France entière » et
    # d'« Île-de-France » — sans ce retrait, un seul mot compterait deux fois.
    remaining = text.lower()
    found: list[str] = []
    for marker, label in _GEOGRAPHY_MARKERS:
        if marker in remaining:
            if label not in found:
                found.append(label)
            remaining = remaining.replace(marker, " ")
    return tuple(found)


#: « décideur »/« décideurs » (générique, mot du ticket lui-même : « tous les
#: décideurs ») n'est PAS un rôle de ``ROLE_LABELS`` — c'est le terme commercial
#: courant pour les DEUX rôles qui décident réellement (tranché sans Louis).
_GENERIC_DECISION_MAKER_RE = re.compile(r"\bd[ée]cideurs?\b|\bdecision[- ]makers?\b", re.IGNORECASE)
_GENERIC_DECISION_MAKER_ROLES: tuple[str, ...] = (ROLE_LABELS["economic_buyer"], ROLE_LABELS["technical_buyer"])


def _detect_roles(text: str) -> tuple[str, ...]:
    lowered = text.lower()
    found: list[str] = []
    if _GENERIC_DECISION_MAKER_RE.search(text or ""):
        found.extend(_GENERIC_DECISION_MAKER_ROLES)
    for label in ROLE_LABELS.values():
        if label.lower() in lowered and label not in found:
            found.append(label)
    return tuple(found)


#: Une exclusion se DÉCLARE (« sauf », « hors », « à l'exclusion de », EN
#: « except »/« excluding ») : le reste de la clause est capturé verbatim,
#: jamais reformulé.
_EXCLUSION_RE = re.compile(
    r"(?:\bsauf\b|\bhors\b|\b[àa] l['’]exclusion de\b|\bexcept\b|\bexcluding\b)\s+([^.;\n]+)",
    re.IGNORECASE,
)


def _detect_exclusions(text: str) -> tuple[str, ...]:
    return tuple(match.strip(" ,") for match in _EXCLUSION_RE.findall(text or "") if match.strip(" ,"))


def build_search_universe(message: str) -> SearchUniverse:
    """#214.1 (réel) — un ``SearchUniverse`` construit à partir d'un message.

    ``population`` = le message VERBATIM : c'est littéralement la population
    demandée, jamais une invention. ``geographies``/``roles``/``exclusions``
    sont des marqueurs déterministes ; les champs que le ticket ne donne pas
    les moyens de repérer dans un message (``periods``, ``sources``,
    ``limits``, ``pagination``, ``relevance_criteria``) restent à leur défaut
    vide — non renseigné, jamais deviné.
    """
    text = message or ""
    return SearchUniverse(
        population=text.strip(),
        geographies=_detect_geographies(text),
        roles=_detect_roles(text),
        exclusions=_detect_exclusions(text),
    )


@dataclass(frozen=True)
class CoverageReport:
    """#214.2/.3 — les dix paliers du ticket. JAMAIS fusionnés (le test
    ``test_to_wire_ne_fusionne_jamais_les_paliers`` le vérifie).

    ``estimated_coverage`` : ``None`` = non mesuré (GA-18/19), jamais ``0.0``
    par défaut — un appelant qui ne sait pas encore l'estimer ne doit pas
    laisser croire à une couverture nulle.
    """

    detected: int
    # #3229 — ``None`` = palier NON MESURÉ (la sortie d'outil ne permet pas de
    # le calculer), jamais ``0`` : « 0 vérifiés » dit une mesure, l'absence de
    # mesure ne se dit pas en chiffre (GA-18/19). Une absence ne fait aucune
    # ligne dans ``coverage_report_lines``.
    resolved: int | None = None
    verified: int | None = None
    relevant: int | None = None
    enriched: int | None = None
    excluded: int = 0
    unresolved: int = 0
    sources_unavailable: tuple[str, ...] = ()
    estimated_coverage: float | None = None
    coverage_basis: str = ""

    def to_wire(self) -> dict[str, object]:
        return {
            "detected": self.detected,
            "resolved": self.resolved,
            "verified": self.verified,
            "relevant": self.relevant,
            "enriched": self.enriched,
            "excluded": self.excluded,
            "unresolved": self.unresolved,
            "sources_unavailable": list(self.sources_unavailable),
            "estimated_coverage": self.estimated_coverage,
            "coverage_basis": self.coverage_basis,
        }


# ── #214.2/.3 — la sortie en texte, un palier par ligne, jamais fusionnés
# (même forme que l'exemple contacts du ticket).

_COVERAGE_LABELS: dict[str, dict[str, str]] = {
    "fr": {
        "detected": "détecté(s)",
        "resolved": "classé(s)",
        "relevant": "correspondent aux rôles recherchés",
        "verified": "vérifié(s) récemment",
        "enriched": "disposent d'une coordonnée exploitable",
    },
    "en": {
        "detected": "detected",
        "resolved": "resolved",
        "relevant": "match the roles you're looking for",
        "verified": "verified recently",
        "enriched": "have a usable contact detail",
    },
}


def coverage_report_lines(report: CoverageReport, language: str) -> list[str]:
    """Une ligne PAR PALIER, dans l'ordre du ticket. Un palier à zéro reste
    écrit (« 0 vérifiés récemment » informe ; le taire ferait croire à une
    mesure absente — distinct de ``estimated_coverage=None``, qui LUI est
    tu — voir ``coverage_report_block``)."""
    lang = "en" if language == "en" else "fr"
    labels = _COVERAGE_LABELS[lang]
    tiers: list[tuple[str, int | None]] = [
        ("detected", report.detected),
        ("resolved", report.resolved),
        ("relevant", report.relevant),
        ("verified", report.verified),
        ("enriched", report.enriched),
    ]
    return [f"{count} {labels[key]}." for key, count in tiers if count is not None]


#: #3229 — la couverture d'une liste de CONTACTS de l'espace. Elle mesure ce que
#: l'espace SAIT de ces personnes, jamais ce que le marché en fait (GA-259) :
#: c'est pourquoi ``estimated_coverage`` reste ``None`` et que le ban de
#: l'absolu reste inconditionnel.
_CONTACT_LIST_BASIS = {
    "fr": "contacts de l'espace correspondant aux filtres — lecture de l'espace, pas du marché",
    "en": "workspace contacts matching the filters — a reading of the workspace, not of the market",
}


def coverage_report_from_contact_list(output: object, language: str = "fr") -> CoverageReport | None:
    """#3229 — le ``CoverageReport`` d'une sortie réelle de
    ``search_workspace_contacts`` (famille « liste de contacts »).

    Un contact se compte par ce que SA LIGNE dit : rôle d'achat posé (classé),
    coordonnée exploitable (e-mail ou profil). Les paliers sont calculés sur
    la MÊME population que ``detected`` : quand la liste est TRONQUÉE (moins de
    lignes vues que de contacts trouvés), aucun palier n'est extrapolé de
    l'échantillon — ils restent ``None``. ``verified`` reste ``None`` : la
    sortie ne porte aucune donnée de vérification. ``None`` si le total est
    illisible ou si la sortie est une erreur — pas de rapport plutôt qu'un
    rapport deviné.
    """
    if not isinstance(output, dict) or output.get("error"):
        return None
    total = output.get("total")
    contacts = output.get("contacts")
    if isinstance(total, bool) or not isinstance(total, int) or not isinstance(contacts, list):
        return None
    # Zéro trouvé : rien à couvrir, aucun palier à étager — la réponse vide de
    # l'outil (et sa consigne de second passage) dit déjà tout.
    if total == 0:
        return None
    basis = _CONTACT_LIST_BASIS["en" if language == "en" else "fr"]
    complete = not output.get("truncated") and len(contacts) == total
    if not complete:
        return CoverageReport(detected=total, coverage_basis=basis)
    rows = [row for row in contacts if isinstance(row, dict)]
    resolved_rows = [r for r in rows if r.get("decision_role") not in (None, "", "unknown")]
    scope = output.get("scope")
    wanted_role = scope.get("role") if isinstance(scope, dict) else None
    return CoverageReport(
        detected=total,
        resolved=len(resolved_rows),
        relevant=(sum(1 for r in rows if r.get("decision_role") == wanted_role) if wanted_role else None),
        enriched=sum(1 for r in rows if r.get("has_email") or r.get("has_network_profile")),
        unresolved=total - len(resolved_rows),
        coverage_basis=basis,
    )


# ── #214 EXHAUSTIVITÉ — le CONTRAT qui permet « tous »/« exhaustif »/« complet ».
# Rien ne les autorise par défaut : sans un CoverageReport qui le PROUVE
# (rien d'exclu, rien de non résolu, aucune source indisponible, une
# couverture MESURÉE à 100 %), le mot reste interdit.


def exhaustiveness_claim_allowed(report: CoverageReport) -> bool:
    """#214 EXHAUSTIVITÉ — le contrat qui justifierait « tous »/« exhaustif »/
    « complet ». ``estimated_coverage`` non mesuré (``None``) NE JUSTIFIE
    JAMAIS l'absolu — l'absence de mesure n'est pas une preuve de complétude."""
    if report.estimated_coverage is None:
        return False
    if report.excluded or report.unresolved or report.sources_unavailable:
        return False
    return report.estimated_coverage >= 1.0


def partial_wording(language: str) -> str:
    """#214 EXHAUSTIVITÉ — ce que Laura peut TOUJOURS employer sans contrat :
    « voici les éléments retrouvés », « voici les principaux », « couverture
    partielle », « liste non exhaustive »."""
    return (
        "voici les éléments retrouvés, voici les principaux, couverture partielle, liste non exhaustive"
        if language != "en"
        else "here is what was found, here are the main ones, partial coverage, non-exhaustive list"
    )


# ── #214.5 — les cinq seuils qualité. Chacun ``None`` (non mesuré, GA-18/19)
# tant que l'entrée qui le nourrit n'est pas connue — jamais une valeur
# devinée pour remplir un tableau.


def precision_at_k(relevant_in_top_k: int | None, k: int) -> float | None:
    if relevant_in_top_k is None or k <= 0:
        return None
    return round(relevant_in_top_k / k, 4)


def coverage_of_priority_roles(found: int | None, total_priority_roles: int | None) -> float | None:
    if found is None or not total_priority_roles:
        return None
    return round(found / total_priority_roles, 4)


def entity_coverage(covered_entities: int | None, total_entities: int | None) -> float | None:
    if covered_entities is None or not total_entities:
        return None
    return round(covered_entities / total_entities, 4)


def freshness_coverage(fresh_count: int | None, total_count: int | None) -> float | None:
    if fresh_count is None or not total_count:
        return None
    return round(fresh_count / total_count, 4)


def unknown_share(unresolved_count: int | None, detected_count: int | None) -> float | None:
    if unresolved_count is None or not detected_count:
        return None
    return round(unresolved_count / detected_count, 4)


@dataclass(frozen=True)
class QualityThresholds:
    """#214.5 — les cinq mesures du ticket, chacune ``None`` = non mesurée."""

    precision_at_k: float | None
    coverage_of_priority_roles: float | None
    entity_coverage: float | None
    freshness_coverage: float | None
    unknown_share: float | None

    def to_wire(self) -> dict[str, object]:
        return {
            "precision_at_k": self.precision_at_k,
            "coverage_of_priority_roles": self.coverage_of_priority_roles,
            "entity_coverage": self.entity_coverage,
            "freshness_coverage": self.freshness_coverage,
            "unknown_share": self.unknown_share,
        }


# ── #214.6 — réponse à une demande trop large : les meilleurs vérifiés
# (bornés), le reste en job, la couverture actuelle, ce qui exige un
# approfondissement. Câblée dans ``chat_orchestrator.py`` sur la branche
# LAUNCH_JOB déjà réelle (#2146.9) : « plusieurs recherches croisées » EST le
# signal d'une demande trop large pour une seule réponse.

_DEFAULT_MAX_VERIFIED_SHOWN = 10


@dataclass(frozen=True)
class BroadRequestResponse:
    verified_best: tuple[str, ...]
    remainder_as_job: bool
    coverage: CoverageReport
    needs_deepening: tuple[str, ...]


def broad_request_response(
    coverage: CoverageReport,
    verified_item_labels: list[str],
    *,
    needs_deepening: tuple[str, ...] = (),
    max_verified_shown: int = _DEFAULT_MAX_VERIFIED_SHOWN,
) -> BroadRequestResponse:
    """#214.6 — ne fabrique JAMAIS cinquante résultats : les ``max_verified_shown``
    premiers VÉRIFIÉS, le reste envoyé en job dès qu'il en reste, qu'un palier
    est exclu/non résolu, ou qu'une source a manqué."""
    verified_best = tuple(verified_item_labels[:max_verified_shown])
    remainder_as_job = (
        len(verified_item_labels) > max_verified_shown
        or coverage.unresolved > 0
        or coverage.excluded > 0
        or bool(coverage.sources_unavailable)
    )
    return BroadRequestResponse(
        verified_best=verified_best,
        remainder_as_job=remainder_as_job,
        coverage=coverage,
        needs_deepening=tuple(needs_deepening),
    )


# ── Le bloc de prompt VOLATIL, câblé dans la branche LAUNCH_JOB existante
# (``chat_orchestrator.py``, même porte que le reste de ce fichier).

_BROAD_REQUEST_BLOCK = {
    "fr": (
        "\n\nCETTE DEMANDE PORTE SUR UNE POPULATION LARGE (« toutes les… », « tous les… », un chiffre "
        "élevé) : ne fabrique JAMAIS le nombre demandé si tu ne l'as pas vérifié. Rends les MEILLEURS "
        "résultats VÉRIFIÉS, envoie le reste en job de fond, DIS la couverture actuelle (détectés, "
        "classés, pertinents, vérifiés, enrichis — chaque palier À PART, jamais fusionné) et NOMME ce "
        "qui exige un approfondissement. N'emploie « tous », « exhaustif » ou « complet » QUE si la "
        "couverture mesurée le justifie réellement ; sinon dis « voici les principaux » ou « couverture "
        "partielle »."
    ),
    "en": (
        "\n\nTHIS REQUEST TARGETS A LARGE POPULATION (\"all the…\", a high count): NEVER fabricate the "
        "requested number if you have not verified it. Return the BEST VERIFIED results, send the rest "
        "as a background job, STATE the current coverage (detected, resolved, relevant, verified, "
        "enriched — each tier SEPARATE, never merged) and NAME what needs deepening. Only use \"all\", "
        "\"exhaustive\" or \"complete\" when the measured coverage actually justifies it; otherwise say "
        "\"here are the main ones\" or \"partial coverage\"."
    ),
}


def broad_request_instruction_block(language: str) -> str:
    """#214.6 — le bloc VOLATIL ajouté quand la branche LAUNCH_JOB de
    ``laura_router``/``chat_orchestrator`` (#2146.9) se déclenche : « plusieurs
    recherches croisées » est déjà, dans ce dépôt, le signal d'une demande
    trop large pour une seule réponse (même signal, jamais un second système)."""
    lang = "en" if language == "en" else "fr"
    return _BROAD_REQUEST_BLOCK[lang]


__all__ = [
    "BroadRequestResponse",
    "CoverageReport",
    "QualityThresholds",
    "SearchUniverse",
    "broad_request_instruction_block",
    "broad_request_response",
    "build_search_universe",
    "coverage_of_priority_roles",
    "coverage_report_lines",
    "detect_broad_population_marker",
    "entity_coverage",
    "exhaustiveness_claim_allowed",
    "freshness_coverage",
    "partial_wording",
    "precision_at_k",
    "unknown_share",
]
