"""#2899 (#2278.11) — LES SEPT PHÉNOMÈNES D'UNE CONVERSATION COMPLÈTE, NOMMÉS.

─────────────────────────────────────────────────────────────────────────────
CE QUE CE MODULE EST, ET CE QU'IL N'EST PAS
─────────────────────────────────────────────────────────────────────────────
#2278.11 (repris par #2899) demande de ne pas tester que des questions
isolées, mais des « conversations complètes (contestations, changements de
périmètre, fautes de frappe, colère, corrections, pièces jointes, reprises) ».
Neuf lots précédents (25-28/09) ont classé ce point « reste » en cherchant un
CORPUS MULTI-TOUR annoté au même schéma que `copilote_scenario_metadata.py`
(#1948) — un système qui dépend effectivement d'un socle absent.

Aucun n'avait vérifié si les SEPT PHÉNOMÈNES, pris un par un, étaient déjà
couverts ailleurs dans le dépôt, sous un autre nom, par du code et des tests
RÉELS — exactement le tour déjà joué par `chat_hard_failures.py` (nommer
avant de mesurer) et par le lot g11 pour `chat_reply_feedback` (douze points
que huit lots n'avaient pas rapprochés du système existant). C'est le cas
des sept : chacun a une règle déjà écrite ET testée, simplement jamais
nommée sous ce vocabulaire.

Ce module NOMME les sept phénomènes et cite, pour CHACUN, où il vit déjà —
jamais un contenu recopié, une référence au fichier et au test réels.
`test_chat_conversation_phenomena.py` est l'appelant : il vérifie que chaque
citation existe VRAIMENT (texte présent dans le prompt rendu, symbole
importable), jamais une prose non vérifiée.

─────────────────────────────────────────────────────────────────────────────
CE QUE CECI N'EST PAS
─────────────────────────────────────────────────────────────────────────────
Ceci ne fait PAS entrer ces sept phénomènes dans `CORPUS`
(`test_copilote_scenario_corpus.py`) : cette annotation par TOUR reste hors
de cette tranche (#2899.17), et le CONTENU d'un corpus multi-source réel
reste absent (#2899.9/.15 — importer des enchaînements naturels suppose des
conversations réelles, que la doctrine interdit d'inventer). Ce module ferme
une seule question, honnêtement : « ces sept phénomènes sont-ils déjà
éprouvés quelque part ? » — oui, et voici où.
"""

from __future__ import annotations

from enum import StrEnum
from typing import NamedTuple


class ConversationPhenomenon(StrEnum):
    """Les SEPT phénomènes cités par #2278.11 — ⚠️ ORDRE FIGÉ (GA-08, même
    discipline que `ChatHardFailure`/`ChatCorpusSource`) : celui de l'énoncé,
    un ajout va en FIN."""

    CONTESTED_FACT = "contested_fact"
    SCOPE_CHANGE = "scope_change"
    TYPO = "typo"
    FRUSTRATION = "frustration"
    CORRECTION = "correction"
    ATTACHMENT = "attachment"
    RESUMPTION = "resumption"


class PhenomenonCoverage(NamedTuple):
    fr: str
    en: str
    #: Où la règle vit déjà et le test réel qui la tient — jamais une
    #: affirmation non vérifiable.
    already_covered_by: str


#: Les SEPT couvertures, une par valeur de `ConversationPhenomenon` — voir la
#: garde `test_exactly_seven_conversation_phenomena`.
PHENOMENON_COVERAGE: dict[ConversationPhenomenon, PhenomenonCoverage] = {
    ConversationPhenomenon.CONTESTED_FACT: PhenomenonCoverage(
        fr="L'utilisateur conteste un fait que Laura a elle-même cité.",
        en="The user disputes a fact that Laura herself cited.",
        already_covered_by=(
            "#2264.36/.37 — bloc CONTESTATION D'UN FAIT CITÉ, app/prompts/bellum_advisor.py, "
            "testé par tests/test_copilote_prompt_blocks.py::"
            "test_2264_36_37_a_contested_fact_is_retrieved_and_compared_before_a_verdict"
        ),
    ),
    ConversationPhenomenon.SCOPE_CHANGE: PhenomenonCoverage(
        fr="Un tour restreint, exclut ou remplace temporairement le périmètre d'un niveau plus haut.",
        en="A turn narrows, excludes or temporarily overrides a higher level's scope.",
        already_covered_by=(
            "#2258.8/.9 — bloc CONFLIT DE PORTÉE, app/prompts/bellum_advisor.py, testé par "
            "tests/test_copilote_prompt_blocks.py::"
            "test_scope_conflict_is_signaled_in_one_sentence_without_reciting_the_profile"
        ),
    ),
    ConversationPhenomenon.TYPO: PhenomenonCoverage(
        fr="La demande contient des fautes, des mots manquants ou pas de ponctuation.",
        en="The request has typos, missing words, or no punctuation.",
        already_covered_by=(
            "#2257.31 — bloc MISSION (« Tu ne corriges jamais son orthographe »), "
            "app/prompts/bellum_advisor.py, testé par tests/test_copilote_prompt_blocks.py::"
            "test_mission_ne_corrige_jamais_lorthographe_de_lutilisateur"
        ),
    ),
    ConversationPhenomenon.FRUSTRATION: PhenomenonCoverage(
        fr="La personne est irritée : pas de ton défensif, pas de morale, pas de sur-explication.",
        en="The person is irritated: no defensive tone, no moralising, no over-explaining.",
        already_covered_by=(
            "#2270.13/.14/.15/.17 — bloc QUAND ELLE EST IRRITÉE, app/prompts/bellum_advisor.py, "
            "testé par tests/test_copilote_error_protocol.py::"
            "test_2270_frustration_bans_defensive_tone_moralising_and_over_explaining"
        ),
    ),
    ConversationPhenomenon.CORRECTION: PhenomenonCoverage(
        fr="Une correction humaine donnée dans le fil prime, quelle que soit sa date.",
        en="A human correction given in the thread wins, whatever its date.",
        already_covered_by=(
            "#1919.7 — correction_field/correction_value/correction_scope, "
            "apps/api/src/modules/account-feedback/reply-feedback.service.ts, testé par "
            "apps/api/src/modules/account-feedback/reply-feedback-memory.spec.ts "
            "(« #1919.7 — « Donnée fausse » cite la correction et dit qu'elle prime »)"
        ),
    ),
    ConversationPhenomenon.ATTACHMENT: PhenomenonCoverage(
        fr="Un fichier déposé dans la conversation doit arriver jusqu'au modèle, non tronqué en silence.",
        en="A file dropped into the conversation must reach the model, not silently truncated.",
        already_covered_by=(
            "app/services/rag_service.py (ephemeral_attached_documents/format_attached_documents), "
            "testé par tests/test_chat_attached_documents.py::TestFormatAttachedDocuments::"
            "test_rend_le_document_bien_au_dela_de_l_extrait_rag"
        ),
    ),
    ConversationPhenomenon.RESUMPTION: PhenomenonCoverage(
        fr="À la reprise d'un fil dont un travail est resté en cours, Laura dit où il s'est arrêté.",
        en="Resuming a thread with work left in progress, Laura says where it stopped.",
        already_covered_by=(
            "#2268.29/.30 — INTERRUPTED_WORK_BLOCK, app/prompts/thread_state.py, testé par "
            "tests/test_chat_thread_interrupted_work.py::test_the_block_appears_once_a_job_is_in_progress"
        ),
    ),
}


def phenomenon_coverage(phenomenon: ConversationPhenomenon) -> PhenomenonCoverage:
    """La couverture d'un phénomène — lève si `PHENOMENON_COVERAGE` en oublie
    un (un `KeyError` explicite vaut mieux qu'un `.get()` silencieux)."""
    return PHENOMENON_COVERAGE[phenomenon]


__all__ = [
    "PHENOMENON_COVERAGE",
    "ConversationPhenomenon",
    "PhenomenonCoverage",
    "phenomenon_coverage",
]
