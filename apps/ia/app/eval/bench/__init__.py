"""Le banc de comparaison de modèles — générique, et fait pour durer.

Le premier cas d'usage est ``claude-haiku-4-5`` contre ``gpt-5.6-luna``, mais
rien ici ne connaît ces deux-là : un modèle candidat est un argument de ligne de
commande, jamais une entrée de code. Le banc servira au prochain modèle, et à
celui d'après.

Les quatre pièces
-----------------
``corpus``   Le magasin d'entrées REJOUABLES — le manque qui empêchait toute
             comparaison honnête : le dépôt ne gardait que des SORTIES.
``recorder`` L'enregistreur branché sur le goulot (``llm_gateway.complete``),
             **éteint par défaut, et prouvé no-op strict par identité d'objet**.
``replay``   Le rejoueur : la même entrée, un autre modèle, aucune collecte.
``compare``  Quatre colonnes qui ne se mélangent jamais — qualité, coût,
             latence, conformité de schéma — et pas de score unique.
``judge``    Un juge choisissable (``--judge``), enregistré au résultat, qui ne
             peut pas être son propre candidat et dont la note ne décide de rien.

Ce que le banc MESURE, il ne le bascule pas : aucun défaut de production ne
change. Doc : ``agent_docs/banc-modeles.md``.
"""

from app.eval.bench.compare import ArmColumns, Comparison, compare_arms
from app.eval.bench.corpus import CallRecord, corpus_inputs, load_calls
from app.eval.bench.judge import JudgeConflictError, JudgeScore, resolve_judge
from app.eval.bench.quality import QualityScore, score_call
from app.eval.bench.recorder import recording
from app.eval.bench.replay import replay_record

__all__ = [
    "ArmColumns",
    "CallRecord",
    "Comparison",
    "JudgeConflictError",
    "JudgeScore",
    "QualityScore",
    "compare_arms",
    "corpus_inputs",
    "load_calls",
    "recording",
    "replay_record",
    "resolve_judge",
    "score_call",
]
