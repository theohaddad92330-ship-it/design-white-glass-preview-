"""#2899 (#2443.2) — LE REGISTRE DES NEUF SOURCES DU CORPUS CHAT, NOMMÉES.

─────────────────────────────────────────────────────────────────────────────
CE QUE CE MODULE EST, ET CE QU'IL N'EST PAS
─────────────────────────────────────────────────────────────────────────────
LAU-FINAL-157 (#2443, épopée #2899) demande un corpus versionné de neuf
sources : « les 100 requêtes préparées ; les trois exports conversationnels
réels ; leurs corrections ; les requêtes complémentaires non exécutées mais
projetées ; les retours Antoine ; les cas SalesConnect ; les corpus
historiques ; les conversations support validées ; les erreurs production
anonymisées. » Cinq lots précédents (`feat/nuit-16/17`, `feat/reste-r8`,
`feat/chantier-g17`, `feat/epo-g11`, `feat/lot-n4`, tous le 25-27/09) ont
mesuré, chacun indépendamment, qu'aucun sous-ensemble n'était détachable
d'un « socle » absent — parce qu'ils cherchaient à FAIRE EXISTER le contenu
des neuf sources d'un coup. Aucun n'avait vérifié si le VOCABULAIRE des neuf
sources, séparé de leur contenu, pouvait exister sans inventer ce contenu —
exactement le tour déjà joué par `chat_hard_failures.py` pour les 16 hard
failures (nommer avant de pouvoir mesurer).

Ce module fait ce tour pour le corpus : il NOMME les neuf sources (ordre
GA-08, celui du corps de l'issue), et pour CHACUNE dit soit (a) où elle vit
déjà, réellement, dans le dépôt — jamais un contenu recopié, une lecture
directe du corpus versionné qui la porte — soit (b) pourquoi elle n'a encore
aucun contenu, une raison CONCRÈTE et vérifiée par `git grep`, jamais un
silence. Même discipline que `demo-coverage.ts` (craft rule n°9 de
CLAUDE.md) : « seedée » ou « vide à dessein avec sa raison », jamais une
case tue.

─────────────────────────────────────────────────────────────────────────────
CE QUI RESTE (délibérément hors de cette tranche)
─────────────────────────────────────────────────────────────────────────────
Six des neuf sources restent VIDES : leur contenu réel (des exports de
conversation, des retours nommés, des cas SalesConnect, des transcripts de
support, des erreurs de production) n'existe dans aucun fichier du dépôt —
l'inventer serait la donnée fictive que la doctrine interdit. Trois sont
PEUPLÉES parce qu'un corpus versionné existant les porte déjà sous un autre
nom (`copilote_scenario_metadata`/`test_copilote_scenario_corpus`, corpus
terrain #2796) : ce module ne les recrée pas, il les NOMME comme les
sources qu'elles sont.
"""

from __future__ import annotations

import importlib.util
from collections.abc import Callable
from enum import StrEnum
from pathlib import Path
from typing import Any, NamedTuple

#: Racine du service (``apps/ia``) — utilisée UNIQUEMENT pour charger le
#: corpus de scénarios par CHEMIN (voir `_load_scenario_corpus_module` plus
#: bas), jamais pour un `import tests...` classique.
_IA_ROOT = Path(__file__).resolve().parents[2]


class ChatCorpusSource(StrEnum):
    """Les NEUF sources de #2443.2 — ⚠️ ORDRE FIGÉ (GA-08, même discipline que
    `ChatHardFailure`) : celui du corps de l'issue, un ajout va en FIN."""

    PREPARED_REQUESTS = "prepared_requests"
    REAL_CONVERSATION_EXPORTS = "real_conversation_exports"
    EXPORT_CORRECTIONS = "export_corrections"
    PROJECTED_REQUESTS = "projected_requests"
    ANTOINE_FEEDBACK = "antoine_feedback"
    SALESCONNECT_CASES = "salesconnect_cases"
    HISTORICAL_CORPUS = "historical_corpus"
    VALIDATED_SUPPORT_CONVERSATIONS = "validated_support_conversations"
    ANONYMIZED_PRODUCTION_ERRORS = "anonymized_production_errors"


class SourceLabel(NamedTuple):
    fr: str
    en: str


#: Le libellé de chaque source — celui du corps de l'issue #2443, jamais
#: reformulé.
SOURCE_LABELS: dict[ChatCorpusSource, SourceLabel] = {
    ChatCorpusSource.PREPARED_REQUESTS: SourceLabel("les 100 requêtes préparées", "the 100 prepared requests"),
    ChatCorpusSource.REAL_CONVERSATION_EXPORTS: SourceLabel(
        "les trois exports conversationnels réels", "the three real conversation exports"
    ),
    ChatCorpusSource.EXPORT_CORRECTIONS: SourceLabel("leurs corrections", "their corrections"),
    ChatCorpusSource.PROJECTED_REQUESTS: SourceLabel(
        "les requêtes complémentaires non exécutées mais projetées",
        "the additional requests, not executed but projected",
    ),
    ChatCorpusSource.ANTOINE_FEEDBACK: SourceLabel("les retours Antoine", "Antoine's feedback"),
    ChatCorpusSource.SALESCONNECT_CASES: SourceLabel("les cas SalesConnect", "the SalesConnect cases"),
    ChatCorpusSource.HISTORICAL_CORPUS: SourceLabel("les corpus historiques", "the historical corpora"),
    ChatCorpusSource.VALIDATED_SUPPORT_CONVERSATIONS: SourceLabel(
        "les conversations support validées", "the validated support conversations"
    ),
    ChatCorpusSource.ANONYMIZED_PRODUCTION_ERRORS: SourceLabel(
        "les erreurs production anonymisées", "the anonymized production errors"
    ),
}


def load_prepared_requests_corpus() -> list[Any]:
    """Le corpus canonique (``tests/test_copilote_scenario_corpus.CORPUS``),
    chargé PAR CHEMIN plutôt que par ``from tests.test_copilote_scenario_corpus
    import CORPUS`` : GA-193 refuse à ``app/**`` un import de premier niveau
    de ``tests`` (jamais une dépendance déclarée, et ça ne doit pas le
    devenir — ``tests/`` n'est pas embarqué en production). Le fichier reste
    l'UNIQUE source réelle, exécuté tel quel ; ce chargeur ne recopie ni son
    contenu ni son compte, il le relit à chaque appel — même import tardif
    que l'ancien ``from tests...`` (aucun coût payé tant qu'aucun gate ne
    tourne réellement, même discipline que `gate._run_bench`), partagé avec
    `chat_gate._hard_failure_coverage`."""
    path = _IA_ROOT / "tests" / "test_copilote_scenario_corpus.py"
    spec = importlib.util.spec_from_file_location("_bellum_chat_scenario_corpus_bridge", path)
    assert spec and spec.loader, f"corpus de scénarios introuvable : {path}"
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return list(module.CORPUS)


def _prepared_requests_count() -> int:
    return len(load_prepared_requests_corpus())


def _historical_corpus_count() -> int:
    from app.eval.terrain.loader import load_audit_terrain

    return load_audit_terrain().reponses_questionnaire


def _projected_requests_count() -> int:
    from app.eval.terrain.loader import load_besoins_p2

    return len(load_besoins_p2())


#: Les TROIS sources déjà peuplées — chacune une lecture RÉELLE d'un corpus
#: versionné existant, jamais un chiffre recopié. `PREPARED_REQUESTS` lit les
#: 100+ scénarios canoniques du chat (#1948/#1945) ; `HISTORICAL_CORPUS` lit
#: l'audit terrain #2796 (604 répondants) ; `PROJECTED_REQUESTS` lit les 50
#: besoins PRIO 2 (#1948.3) — des besoins déjà PRIORISÉS mais PAS encore
#: exécutables aujourd'hui, exactement ce que #2443 nomme « projetées ».
POPULATED_SOURCE_LOADERS: dict[ChatCorpusSource, Callable[[], int]] = {
    ChatCorpusSource.PREPARED_REQUESTS: _prepared_requests_count,
    ChatCorpusSource.HISTORICAL_CORPUS: _historical_corpus_count,
    ChatCorpusSource.PROJECTED_REQUESTS: _projected_requests_count,
}


#: Les SIX sources encore VIDES — chacune avec la raison CONCRÈTE de son
#: absence (jamais un silence), vérifiée par une recherche réelle dans le
#: dépôt au moment où ce module a été écrit (28/09/2026).
EMPTY_SOURCE_REASONS: dict[ChatCorpusSource, str] = {
    ChatCorpusSource.REAL_CONVERSATION_EXPORTS: (
        "aucun export conversationnel réel n'est committé sous ce nom : en capter un suppose "
        "l'échantillonnage production anonymisé, opt-in par espace et jamais versionné (voir ANONYMIZED_PRODUCTION_ERRORS)"
    ),
    ChatCorpusSource.EXPORT_CORRECTIONS: (
        "dépend directement de REAL_CONVERSATION_EXPORTS : rien à corriger tant qu'aucun export n'est versé"
    ),
    ChatCorpusSource.ANTOINE_FEEDBACK: (
        "aucun retour d'Antoine sur /chat n'est versé sous ce nom — vérifié (git grep \"Antoine\" : les "
        "seules occurrences du dépôt sont un jeu de données de démo et une note datée sans rapport avec "
        "le copilote, aucune n'est un retour sur /chat)"
    ),
    ChatCorpusSource.SALESCONNECT_CASES: (
        "« SalesConnect » nomme déjà une MÉTHODOLOGIE de vente du produit (complétude d'une recommandation "
        "à 6 champs, `play_completeness.py`, roadmap §14) — aucun cas de CONVERSATION n'a jamais été versé "
        "sous ce nom pour l'évaluation du chat"
    ),
    ChatCorpusSource.VALIDATED_SUPPORT_CONVERSATIONS: (
        "aucune conversation de support n'est journalisée sous une forme exploitable pour ce corpus — "
        "le pipeline support ne produit pas encore de transcript versionnable"
    ),
    ChatCorpusSource.ANONYMIZED_PRODUCTION_ERRORS: (
        "l'échantillonnage production anonymisé (#2443.10 / #2899) est un opt-in par espace côté API "
        "(`chat_eval_samples`, 90 jours) : ses lignes restent en base, jamais versionnées. Elles sont RELUES à la "
        "demande par `chat_prod_samples.load_prod_samples` (rapport de pilotage `--with-prod-samples`), pas "
        "committées — d'où la source vide du corpus versionné"
    ),
}


def populated_sources() -> dict[ChatCorpusSource, int]:
    """Les sources peuplées et leur taille RÉELLE, mesurée en relisant chaque
    corpus versionné — jamais un chiffre figé dans ce module."""
    return {source: loader() for source, loader in POPULATED_SOURCE_LOADERS.items()}


def source_total() -> int:
    """La taille totale du corpus multi-source aujourd'hui — les sources
    encore vides comptent pour zéro PARCE QU'ELLES SONT NOMMÉES vides
    (`EMPTY_SOURCE_REASONS`), jamais parce qu'elles sont tues."""
    return sum(populated_sources().values())


__all__ = [
    "EMPTY_SOURCE_REASONS",
    "POPULATED_SOURCE_LOADERS",
    "SOURCE_LABELS",
    "ChatCorpusSource",
    "SourceLabel",
    "load_prepared_requests_corpus",
    "populated_sources",
    "source_total",
]
