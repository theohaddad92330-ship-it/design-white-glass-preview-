"""#2899 (#2278.27) — LA COUVERTURE MINIMALE DU CORPUS CHAT, NOMMÉE.

─────────────────────────────────────────────────────────────────────────────
CE QUE CE MODULE EST, ET CE QU'IL N'EST PAS
─────────────────────────────────────────────────────────────────────────────
LAU-FINAL-020 (#2278.27, épopée #2899) demande une couverture minimale du
corpus chat sur TREIZE axes (vingt secteurs, six tailles d'ESN, quatre rôles,
trois types de contrat, les pays activés, avec/sans connecteur, workspace
vide/riche, mobile, vocal, fichiers, jobs longs). Aucune mesure n'existait —
ni matrice, ni champ dédié.

Même tour que `chat_corpus_sources.py` (#2443.2) et `chat_hard_failures.py`
(#2443.6) : NOMMER les treize axes (ordre GA-08, celui du corps de l'issue),
et pour CHACUN dire soit (a) une mesure RÉELLE contre le corpus canonique
(`tests/test_copilote_scenario_corpus.CORPUS`), soit (b) pourquoi aucune
mesure n'existe — une raison CONCRÈTE, jamais un silence. Doctrine (garde
GA-259) : un TAUX DE COUVERTURE mesure ce qu'on SAIT, jamais ce que le marché
FAIT — inventer une mesure sur un axe sans champ dédié serait la donnée
fictive interdite.

─────────────────────────────────────────────────────────────────────────────
CE QUI RESTE (délibérément hors de cette tranche)
─────────────────────────────────────────────────────────────────────────────
UN SEUL axe est mesurable aujourd'hui : les rôles, via `Meta.personas`
(#1948.13, `Famille`). Les douze autres exigeraient un champ que le corpus ne
porte pas (secteur, taille d'ESN, type de contrat, pays, connecteur,
richesse du workspace, canal) — les ajouter au schéma de `Meta` (17 champs,
lourdement gardé) est un chantier séparé, non entrepris ici pour ne courir
aucun risque sur ce système sensible (même arbitrage que `chat_hard_failures`
et `chat_human_review` avant lui).
"""

from __future__ import annotations

import importlib.util
from collections.abc import Callable
from enum import StrEnum
from pathlib import Path
from typing import Any

#: Racine du service (``apps/ia``) — chargement PAR CHEMIN du corpus, jamais
#: un ``from tests...`` de premier niveau dans ``app/**`` (GA-193, même
#: technique que ``chat_corpus_sources.load_prepared_requests_corpus``).
_IA_ROOT = Path(__file__).resolve().parents[2]


class CoverageAxis(StrEnum):
    """Les TREIZE axes de #2278.27 — ⚠️ ORDRE FIGÉ (GA-08, même discipline que
    `ChatHardFailure`/`ChatCorpusSource`) : celui du corps de l'issue, un
    ajout va en FIN."""

    SECTORS = "sectors"
    ESN_SIZES = "esn_sizes"
    ROLES = "roles"
    CONTRACT_TYPES = "contract_types"
    COUNTRIES = "countries"
    WITHOUT_CONNECTOR = "without_connector"
    WITH_CONNECTOR = "with_connector"
    EMPTY_WORKSPACE = "empty_workspace"
    RICH_WORKSPACE = "rich_workspace"
    MOBILE = "mobile"
    VOICE = "voice"
    FILES = "files"
    LONG_JOBS = "long_jobs"


def _load_scenario_corpus_module() -> Any:
    path = _IA_ROOT / "tests" / "test_copilote_scenario_corpus.py"
    spec = importlib.util.spec_from_file_location("_bellum_chat_coverage_corpus_bridge", path)
    assert spec and spec.loader, f"corpus de scénarios introuvable : {path}"
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _roles_coverage() -> tuple[frozenset[str], int]:
    """Les valeurs de `Famille` réellement portées par le corpus canonique, et
    sa taille — une lecture directe, jamais un chiffre recopié."""
    corpus = list(_load_scenario_corpus_module().CORPUS)
    families: set[str] = set()
    for item in corpus:
        families.update(f.value for f in item.meta.personas)
    return frozenset(families), len(corpus)


#: L'UN des treize axes mesurable aujourd'hui — son chargeur.
MEASURED_AXIS_COVERAGE: dict[CoverageAxis, Callable[[], tuple[frozenset[str], int]]] = {
    CoverageAxis.ROLES: _roles_coverage,
}


#: Les DOUZE axes sans mesure — chacun avec sa raison CONCRÈTE, vérifiée dans
#: le schéma réel (`tests/copilote_scenario_metadata.py`) au moment où ce
#: module a été écrit (28/09/2026).
NOT_MEASURABLE_AXIS_REASONS: dict[CoverageAxis, str] = {
    CoverageAxis.SECTORS: (
        "aucun champ « secteur » dans Meta (17 champs) — un scénario ne nomme aucune industrie cible"
    ),
    CoverageAxis.ESN_SIZES: "aucun champ « taille d'ESN » dans Meta — la taille du client n'est annotée nulle part",
    CoverageAxis.CONTRACT_TYPES: (
        "aucun champ « type de contrat » (CDI/freelance/mixte) — cette dimension n'existe pas dans le schéma"
    ),
    CoverageAxis.COUNTRIES: (
        "aucun champ « pays » — Meta ne porte ni la localisation du scénario ni celle du compte visé"
    ),
    CoverageAxis.WITHOUT_CONNECTOR: (
        "aucun champ structuré ne distingue un scénario avec/sans connecteur — seulement du texte libre "
        "dans certains fragments, non fiable à agréger"
    ),
    CoverageAxis.WITH_CONNECTOR: (
        "même absence que WITHOUT_CONNECTOR — c'est un seul axe binaire sans champ dédié, nommé deux fois "
        "par le corps de l'issue"
    ),
    CoverageAxis.EMPTY_WORKSPACE: (
        "Nature (positif/cas_limite) ne porte pas cette distinction — un cas limite peut viser un connecteur "
        "absent SANS que le workspace lui-même soit vide"
    ),
    CoverageAxis.RICH_WORKSPACE: "même absence qu'EMPTY_WORKSPACE — aucun champ ne mesure la richesse du workspace",
    CoverageAxis.MOBILE: "aucun champ « canal » (mobile/web) dans Meta",
    CoverageAxis.VOICE: "aucun champ « canal » (vocal/texte) dans Meta",
    CoverageAxis.FILES: (
        "Objet.DOCUMENT nomme un TYPE d'objet métier, pas un canal de pièce jointe — les confondre serait "
        "la confusion de capacités que l'audit du 28/09 a nommée ailleurs (#2809, #2876)"
    ),
    CoverageAxis.LONG_JOBS: "aucun champ ne distingue un scénario synchrone d'un job long (3-6 min, BullMQ)",
}


def axis_coverage(axis: CoverageAxis) -> tuple[frozenset[str], int] | None:
    """La couverture RÉELLE d'un axe mesurable, ou ``None`` pour un axe
    honnêtement nommé absent (`NOT_MEASURABLE_AXIS_REASONS`) — jamais un
    zéro qui se confondrait avec « mesuré et vide »."""
    loader = MEASURED_AXIS_COVERAGE.get(axis)
    return loader() if loader else None


__all__ = [
    "MEASURED_AXIS_COVERAGE",
    "NOT_MEASURABLE_AXIS_REASONS",
    "CoverageAxis",
    "axis_coverage",
]
