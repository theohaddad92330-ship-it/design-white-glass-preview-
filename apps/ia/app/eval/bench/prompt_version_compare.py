"""#2445.7 (#2766) — COMPARER UN CORPUS D'ÉVAL ENTRE DEUX VERSIONS DE PROMPT.

─────────────────────────────────────────────────────────────────────────────
CE QUE CE MODULE EST, ET CE QU'IL N'EST PAS
─────────────────────────────────────────────────────────────────────────────
Le banc (`app/eval/bench/compare.py::compare_arms`) compare déjà un corpus
entre deux BRAS, appariés entrée par entrée, sur quatre colonnes déterministes
(qualité, coût, latence, conformité de schéma) — jusqu'ici toujours deux
MODÈLES (`app/eval/bench/run.py`, `strategy/variants.py`). Rien dans
``compare_arms`` ne force un bras à être un modèle : c'est un label et un
ensemble d'enregistrements. Les tris précédents (#2445.7) avaient cherché un
« corpus d'éval de PROMPT » séparé et n'en avaient trouvé aucun — parce que la
bonne réponse n'était pas un second corpus, mais une SECONDE ÉTIQUETTE sur le
même mécanisme.

Ce module pose cette étiquette : le nom d'un bras devient la VERSION du
registre de prompts (`app/prompts/registry.py::prompt_version_for`, #2445.1)
qui a produit ces enregistrements — DÉRIVÉE, jamais recopiée.

─────────────────────────────────────────────────────────────────────────────
CE QUI RESTE HORS DE CETTE TRANCHE
─────────────────────────────────────────────────────────────────────────────
Ce module ne REJOUE rien lui-même : produire ``records_before``/
``records_after`` suppose de faire tourner le même corpus sous deux ÉTATS du
dépôt (avant/après un changement de prompt), donc deux checkouts ou deux
process — un geste d'OPÉRATEUR (`git worktree`, ou deux exécutions du banc à
des commits différents), pas une fonction Python pure. `compare_prompt_versions`
prend ces deux ensembles déjà produits et rend la comparaison ; il ne les
fabrique pas.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import replace

from app.eval.bench.compare import Comparison, compare_arms
from app.eval.bench.corpus import CallRecord
from app.eval.bench.judge import JudgeScore
from app.prompts.registry import prompt_version_for


def label_for_prompt_version(prompt_name: str, version: str | None = None) -> str:
    """L'étiquette de bras d'une version de prompt — ``<nom>@<empreinte>``,
    DÉRIVÉE du registre (#2445.1) quand ``version`` n'est pas fournie. Un
    ``prompt_name`` absent du registre rend ``inconnue`` plutôt qu'une
    empreinte devinée."""
    resolved = version if version is not None else prompt_version_for(prompt_name)
    return f"{prompt_name}@{resolved or 'inconnue'}"


def _retagged(records: Iterable[CallRecord], arm: str) -> list[CallRecord]:
    """Les mêmes enregistrements, réétiquetés sous ``arm`` — jamais un champ
    d'origine modifié à part `arm` lui-même (`dataclasses.replace`)."""
    return [replace(r, arm=arm) for r in records]


def compare_prompt_versions(
    records_before: Iterable[CallRecord],
    records_after: Iterable[CallRecord],
    *,
    prompt_name: str,
    version_before: str | None = None,
    version_after: str | None = None,
    corpus: str = "",
    judge_scores: Sequence[JudgeScore] = (),
) -> Comparison:
    """Compare le MÊME corpus rejoué sous deux versions d'UN prompt — deux
    bras, étiquetés par leur empreinte de version plutôt que par un nom de
    modèle. Réutilise ``compare_arms`` tel quel (les quatre colonnes,
    appariées entrée par entrée, le juge consultatif) : rien n'est
    réinventé, seule l'étiquette change."""
    arm_before = label_for_prompt_version(prompt_name, version_before)
    arm_after = label_for_prompt_version(prompt_name, version_after)
    if arm_before == arm_after:
        raise ValueError(
            f"« before » et « after » portent la MÊME version de prompt ({arm_before}) — "
            "rien à comparer. Vérifier version_before/version_after."
        )

    tagged = [*_retagged(records_before, arm_before), *_retagged(records_after, arm_after)]
    return compare_arms(
        tagged,
        [arm_before, arm_after],
        corpus=corpus or prompt_name,
        judge_scores=judge_scores,
        models={arm_before: arm_before, arm_after: arm_after},
    )
