"""#2899 (#2278.13) — LES DIX-SEPT DIMENSIONS DE SCORE DU CHAT, NOMMÉES.

─────────────────────────────────────────────────────────────────────────────
CE QUE CE MODULE EST, ET CE QU'IL N'EST PAS
─────────────────────────────────────────────────────────────────────────────
LAU-FINAL-020 (#2278.13, épopée #2899) demande une rubrique de score
conversationnel à DIX-SEPT dimensions (compréhension, personnalisation,
exactitude, provenance, fraîcheur, utilité commerciale, profondeur,
concision, posture, continuité, bon usage des outils, exécution réelle,
sécurité, permissions, absence de boucle, qualité sectorielle, qualité du
prochain mouvement). Le rapport déterministe du banc DOSSIER
(`app/eval/report.py`) note sur HUIT métriques différentes (faithfulness,
coherence…) — pour l'analyse, pas la conversation. Aucun scoreur n'existe
pour le chat sur CES dix-sept dimensions.

Même tour que `chat_hard_failures.py` (#2443.6) et `chat_corpus_sources.py`
(#2443.2) : NOMMER le vocabulaire avant de pouvoir le calculer. Ce module ne
prétend calculer AUCUN score — construire dix-sept scoreurs, ou même un seul,
sans dimension nommée reviendrait à improviser un critère à chaque usage.

─────────────────────────────────────────────────────────────────────────────
OÙ SONT LES SCOREURS
─────────────────────────────────────────────────────────────────────────────
Les dix-sept scoreurs déterministes vivent dans `chat_score_scorers.py` (#2899, #2278.13/.27) et sont lus par le
rejeu nocturne (`chat_samples_replay.py`). Ce module garde le VOCABULAIRE seul : un score n'est jamais nu, et
aucune moyenne ne compense un hard failure (`chat_hard_failures.py`).
"""

from __future__ import annotations

from enum import StrEnum
from typing import NamedTuple


class ChatScoreDimension(StrEnum):
    """Les DIX-SEPT dimensions de #2278.13 — ⚠️ ORDRE FIGÉ (GA-08, même
    discipline que `ChatHardFailure`/`ChatCorpusSource`/`CoverageAxis`) :
    celui du corps de l'issue, un ajout va en FIN."""

    COMPREHENSION = "comprehension"
    PERSONALIZATION = "personalization"
    ACCURACY = "accuracy"
    PROVENANCE = "provenance"
    FRESHNESS = "freshness"
    COMMERCIAL_USEFULNESS = "commercial_usefulness"
    DEPTH = "depth"
    CONCISENESS = "conciseness"
    POSTURE = "posture"
    CONTINUITY = "continuity"
    TOOL_USE_QUALITY = "tool_use_quality"
    REAL_EXECUTION = "real_execution"
    SECURITY = "security"
    PERMISSIONS = "permissions"
    NO_LOOP = "no_loop"
    SECTOR_QUALITY = "sector_quality"
    NEXT_MOVE_QUALITY = "next_move_quality"


class DimensionLabel(NamedTuple):
    fr: str
    en: str


#: Le libellé de chaque dimension — celui du corps de l'issue #2278, jamais
#: reformulé.
DIMENSION_LABELS: dict[ChatScoreDimension, DimensionLabel] = {
    ChatScoreDimension.COMPREHENSION: DimensionLabel("compréhension", "comprehension"),
    ChatScoreDimension.PERSONALIZATION: DimensionLabel("personnalisation", "personalization"),
    ChatScoreDimension.ACCURACY: DimensionLabel("exactitude", "accuracy"),
    ChatScoreDimension.PROVENANCE: DimensionLabel("provenance", "provenance"),
    ChatScoreDimension.FRESHNESS: DimensionLabel("fraîcheur", "freshness"),
    ChatScoreDimension.COMMERCIAL_USEFULNESS: DimensionLabel("utilité commerciale", "commercial usefulness"),
    ChatScoreDimension.DEPTH: DimensionLabel("profondeur", "depth"),
    ChatScoreDimension.CONCISENESS: DimensionLabel("concision", "conciseness"),
    ChatScoreDimension.POSTURE: DimensionLabel("posture", "posture"),
    ChatScoreDimension.CONTINUITY: DimensionLabel("continuité", "continuity"),
    ChatScoreDimension.TOOL_USE_QUALITY: DimensionLabel("bon usage des outils", "tool use quality"),
    ChatScoreDimension.REAL_EXECUTION: DimensionLabel("exécution réelle", "real execution"),
    ChatScoreDimension.SECURITY: DimensionLabel("sécurité", "security"),
    ChatScoreDimension.PERMISSIONS: DimensionLabel("permissions", "permissions"),
    ChatScoreDimension.NO_LOOP: DimensionLabel("absence de boucle", "no loop"),
    ChatScoreDimension.SECTOR_QUALITY: DimensionLabel("qualité sectorielle", "sector quality"),
    ChatScoreDimension.NEXT_MOVE_QUALITY: DimensionLabel("qualité du prochain mouvement", "next move quality"),
}


__all__ = ["DIMENSION_LABELS", "ChatScoreDimension", "DimensionLabel"]
