"""Les colonnes du banc — et le refus explicite d'un score unique.

Quatre grandeurs, quatre colonnes, jamais fondues
--------------------------------------------------
1. **Qualité** — un barème /100 **par prompt** (``app/eval/bench/rubrics/``),
   chacun composé de critères qui existaient déjà dans le dépôt et qu'on a
   rebranchés sur la sortie d'un prompt. Elle est **décomposée** : ``quality_axes``
   dit POURQUOI, ``quality_by_prompt`` dit SUR QUEL POSTE. Un axe qu'on n'a pas pu
   évaluer est NOMMÉ dans ``quality_axes_unmeasured`` et sort du dénominateur ;
   sous trois axes mesurés, il n'y a pas d'agrégat du tout.
2. **Coût** — mesuré, jamais estimé, depuis la ``TokenUsage`` de l'appel.
3. **Latence** — moyenne et p95. Le p95 parce qu'une moyenne cache la queue, et
   c'est la queue qui fait dépasser le budget d'un tour de copilote.
4. **Conformité de schéma** — combien d'appels ont produit une sortie qui
   VALIDE son ``response_model``. Cinq sites du chemin payant l'exigent ; rien
   ne le mesurait avant ce banc. C'est le risque n°1 d'un changement de
   fournisseur, et il ne se lit sur aucune des trois autres colonnes.

Il n'y a **pas** de score global, et il n'y en aura pas : un modèle cinq fois
moins cher qui rate un organigramme sur trois n'est pas « moins bon de 12 % »,
il est inutilisable sur ce poste-là. Le payload ne contient donc ni ``score``,
ni ``winner``, ni ``overall`` — ``tests/test_model_bench.py`` le vérifie.

Appariement
-----------
Comme la campagne apparie compte par compte, le banc apparie **entrée par
entrée** : seuls les ``record_id`` présents dans TOUS les bras comparés entrent
dans les moyennes. Un bras qui a planté sur les trois plus gros comptes ne doit
pas gagner la colonne « coût » par forfait.

L'enveloppe
-----------
Un résultat porte le commit du dépôt, la date, le corpus, la liste des cas, les
modèles comparés ET le juge. Deux comparaisons jugées différemment ne se
comparent pas entre elles ; sans ces champs on ne peut même pas s'en apercevoir.
"""

from __future__ import annotations

import logging
import statistics
import subprocess
import time
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.eval.bench.corpus import (
    STATUS_OK,
    STATUS_SCHEMA_ERROR,
    STATUS_TRUNCATED,
    CallRecord,
)
from app.eval.bench.judge import JudgeScore
from app.eval.bench.quality import score_call
from app.eval.strategy.variants import ModelSpec

logger = logging.getLogger(__name__)


def repo_commit() -> str | None:
    """Le SHA du dépôt, ou ``None``. Jamais une valeur inventée."""
    try:
        out = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=Path(__file__).resolve().parent,
            capture_output=True, text=True, timeout=5, check=False,
        )
    except (OSError, subprocess.SubprocessError):  # pragma: no cover - pas de git
        return None
    sha = out.stdout.strip()
    return sha if out.returncode == 0 and len(sha) == 40 else None


def _mean(values: Sequence[float]) -> float:
    return round(statistics.fmean(values), 4) if values else 0.0


def _p95(values: Sequence[float]) -> float:
    """p95 par index — ``statistics.quantiles`` exige n ≥ 2 et n'aide pas ici."""
    if not values:
        return 0.0
    ordered = sorted(values)
    idx = min(len(ordered) - 1, int(round(0.95 * (len(ordered) - 1))))
    return round(ordered[idx], 3)


def _mean_by_key(pairs: Iterable[tuple[str, float]]) -> dict[str, float]:
    """Moyenne par clé — la seule agrégation autorisée sur des axes : chaque axe
    garde son nom, aucun ne se fond dans un autre."""
    buckets: dict[str, list[float]] = {}
    for key, value in pairs:
        buckets.setdefault(key, []).append(value)
    return {k: _mean(v) for k, v in sorted(buckets.items())}


@dataclass(frozen=True)
class ArmColumns:
    """Un bras, ses quatre colonnes — plus la colonne CONSULTATIVE du juge."""

    arm: str
    model_label: str
    n_records: int
    # 1. qualité — ``None`` = non mesurée, jamais 0
    #
    # ⚠️ ``quality_mean`` mélange les prompts : depuis que chaque prompt du chemin
    # payant a son barème, une moyenne globale additionne un organigramme et un
    # lot de contacts, qui ne se notent pas sur les mêmes axes. Elle reste
    # publiée parce qu'elle répond à « globalement, mieux ou moins bien ? » sur un
    # corpus apparié — mais la lecture qui DÉCIDE est ``quality_by_prompt``, et
    # celle qui explique est ``quality_axes``.
    quality_mean: float | None
    quality_scored: int
    quality_unmeasured: int
    # 2. coût
    cost_usd_total: float
    cost_usd_mean: float
    input_tokens: int
    output_tokens: int
    # 3. latence
    latency_mean_s: float
    latency_p95_s: float
    # 4. conformité de schéma
    schema_attempted: int
    schema_ok: int
    schema_failures: int
    truncations: int
    other_errors: int
    # 1bis. la qualité, DÉCOMPOSÉE (déterministe — elle entre dans le verdict)
    #: prompt → note /100 moyenne. C'est ici qu'on lit « meilleur organigramme ».
    quality_by_prompt: dict[str, float] = field(default_factory=dict)
    #: axe → ratio 0..1 moyen. Un score n'est jamais nu.
    quality_axes: dict[str, float] = field(default_factory=dict)
    #: axe → combien de fois il n'a PAS pu être mesuré. Jamais compté comme 0.
    quality_axes_unmeasured: dict[str, int] = field(default_factory=dict)
    # consultatif — hors verdict, par doctrine
    judge_mean: float | None = None
    judge_scored: int = 0

    @property
    def schema_rate(self) -> float | None:
        return round(self.schema_ok / self.schema_attempted, 4) if self.schema_attempted else None

    def deterministic_dict(self) -> dict[str, Any]:
        """Tout sauf le juge — c'est cette forme-là qui fonde une décision."""
        return {k: v for k, v in self.__dict__.items() if not k.startswith("judge_")}

    def as_dict(self) -> dict[str, Any]:
        return {**self.__dict__, "schema_rate": self.schema_rate}


def summarise_arm(
    records: Iterable[CallRecord],
    arm: str,
    *,
    paired_ids: set[str] | None = None,
    model_label: str = "",
    judge_scores: Sequence[JudgeScore] = (),
) -> ArmColumns:
    rows = [r for r in records if r.arm == arm]
    if paired_ids is not None:
        rows = [r for r in rows if r.record_id in paired_ids]
    ok = [r for r in rows if r.status == STATUS_OK]

    qualities = [score_call(r) for r in ok]
    scored = [q.total for q in qualities if q.measured and q.total is not None]

    # Décomposition : par prompt (ce qui décide) et par axe (ce qui explique). Les
    # axes NON mesurés sont comptés à part — jamais moyennés à 0, sinon le barème
    # mesurerait la complétude de nos sorties au lieu de mesurer le modèle.
    by_prompt = _mean_by_key(
        (r.prompt_name, q.total)
        for r, q in zip(ok, qualities, strict=True)
        if q.measured and q.total is not None
    )
    axes_mean = _mean_by_key((n, v) for q in qualities for n, v in q.axes.items())
    axes_unmeasured: dict[str, int] = {}
    for q in qualities:
        for name in q.unmeasured_axes:
            axes_unmeasured[name] = axes_unmeasured.get(name, 0) + 1

    judged = [
        j.score for j in judge_scores
        if j.arm == arm and j.measured and j.score is not None
        and (paired_ids is None or j.record_id in paired_ids)
    ]

    labels = {f"{r.provider}:{r.model}" if r.provider else r.model for r in rows if r.model}
    return ArmColumns(
        arm=arm,
        model_label=model_label or (sorted(labels)[0] if len(labels) == 1 else ", ".join(sorted(labels))),
        n_records=len(rows),
        quality_mean=_mean(scored) if scored else None,
        quality_scored=len(scored),
        quality_unmeasured=len(qualities) - len(scored),
        cost_usd_total=round(sum(r.cost_usd for r in rows), 4),
        cost_usd_mean=_mean([r.cost_usd for r in rows]),
        input_tokens=sum(r.input_tokens for r in rows),
        output_tokens=sum(r.output_tokens for r in rows),
        latency_mean_s=_mean([r.latency_s for r in rows]),
        latency_p95_s=_p95([r.latency_s for r in rows]),
        schema_attempted=len(rows),
        schema_ok=len(ok),
        schema_failures=sum(1 for r in rows if r.status == STATUS_SCHEMA_ERROR),
        truncations=sum(1 for r in rows if r.status == STATUS_TRUNCATED),
        other_errors=sum(1 for r in rows if r.status not in (STATUS_OK, STATUS_SCHEMA_ERROR, STATUS_TRUNCATED)),
        quality_by_prompt=by_prompt,
        quality_axes=axes_mean,
        quality_axes_unmeasured=dict(sorted(axes_unmeasured.items())),
        judge_mean=_mean(judged) if judged else None,
        judge_scored=len(judged),
    )


@dataclass(frozen=True)
class Comparison:
    """Le résultat, avec de quoi savoir de QUOI il parle six mois plus tard."""

    generated_at: str
    repo_commit: str | None
    corpus: str
    cases: list[str]
    record_ids: list[str]
    arms: list[str]
    models: dict[str, str]
    judge: str | None
    columns: list[ArmColumns]
    per_record: list[dict[str, Any]] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def deterministic_dict(self) -> dict[str, Any]:
        """La partie du résultat qu'un juge NE PEUT PAS bouger.

        La doctrine de ``rubric.py`` rendue exécutable : deux comparaisons dont
        seules les notes de juge diffèrent rendent ici exactement la même chose.
        """
        return {
            "corpus": self.corpus,
            "cases": list(self.cases),
            "record_ids": list(self.record_ids),
            "arms": list(self.arms),
            "models": dict(self.models),
            "columns": [c.deterministic_dict() for c in self.columns],
            "per_record": [
                {k: v for k, v in row.items() if not k.startswith("judge")}
                for row in self.per_record
            ],
        }

    def as_dict(self) -> dict[str, Any]:
        return {
            "generated_at": self.generated_at,
            "repo_commit": self.repo_commit,
            "corpus": self.corpus,
            "cases": list(self.cases),
            "record_ids": list(self.record_ids),
            "arms": list(self.arms),
            "models": dict(self.models),
            "judge": self.judge,
            "judge_is_advisory": True,
            "columns": [c.as_dict() for c in self.columns],
            "per_record": list(self.per_record),
            "notes": list(self.notes),
        }


def compare_arms(
    records: Iterable[CallRecord],
    arms: Sequence[str],
    *,
    corpus: str = "",
    judge: ModelSpec | None = None,
    judge_scores: Sequence[JudgeScore] = (),
    models: dict[str, str] | None = None,
) -> Comparison:
    """Apparie les bras entrée par entrée et rend les quatre colonnes."""
    rows = list(records)
    by_arm = {arm: {r.record_id for r in rows if r.arm == arm} for arm in arms}
    paired: set[str] = set.intersection(*by_arm.values()) if by_arm and all(by_arm.values()) else set()

    notes: list[str] = []
    if not paired:
        notes.append(
            "aucun enregistrement présent dans TOUS les bras — rien à comparer "
            "(un bras n'a-t-il pas été rejoué ?)"
        )
    else:
        excluded = sorted(set().union(*by_arm.values()) - paired)
        if excluded:
            notes.append(
                f"{len(excluded)} enregistrement(s) présent(s) dans un seul bras, exclus de "
                "l'appariement — jamais moyennés, sinon le bras qui a planté gagne par forfait"
            )

    ids = sorted(paired)
    paired_rows = [r for r in rows if r.record_id in paired]
    columns = [
        summarise_arm(rows, arm, paired_ids=paired, judge_scores=judge_scores,
                      model_label=(models or {}).get(arm, ""))
        for arm in arms
    ]

    if any(c.schema_failures or c.truncations for c in columns):
        notes.append(
            "conformité de schéma : au moins un bras a produit une sortie qui ne valide pas "
            "son response_model (ou tronquée) — cette colonne prime sur les trois autres"
        )
    if any(c.quality_unmeasured for c in columns):
        notes.append(
            "qualité : certaines sorties n'ont AUCUN agrégat — soit leur prompt n'a pas de barème "
            "dans app/eval/bench/rubrics/, soit moins de trois axes étaient mesurables sur cette "
            "sortie-là. Elles comptent « non mesuré », jamais 0."
        )
    unmeasured_axes = sorted({n for c in columns for n in c.quality_axes_unmeasured})
    if unmeasured_axes:
        notes.append(
            "axes non mesurables sur au moins une sortie (hors dénominateur, NOMMÉS) : "
            + ", ".join(unmeasured_axes)
        )
    if len({p for c in columns for p in c.quality_by_prompt}) > 1:
        notes.append(
            "quality_by_prompt : la moyenne globale mélange des barèmes différents — pour décider "
            "d'un poste (organigramme, contacts…), lire la ligne de CE prompt, pas la moyenne."
        )
    if judge is not None:
        notes.append(
            f"juge {judge.label} : sa note est une colonne CONSULTATIVE, à côté des mesures "
            "déterministes. Elle n'entre dans aucun verdict — elle n'est pas reproductible."
        )

    per_record: list[dict[str, Any]] = []
    for rid in ids:
        row: dict[str, Any] = {"record_id": rid}
        for arm in arms:
            hit = next((r for r in paired_rows if r.record_id == rid and r.arm == arm), None)
            if hit is None:  # pragma: no cover - impossible par construction
                continue
            q = score_call(hit)
            row["case"] = hit.case
            row["prompt_name"] = hit.prompt_name
            row[f"{arm}.status"] = hit.status
            row[f"{arm}.quality"] = q.total
            row[f"{arm}.quality_axes"] = q.axes
            row[f"{arm}.quality_unmeasured_axes"] = q.unmeasured_axes
            row[f"{arm}.cost_usd"] = hit.cost_usd
            row[f"{arm}.latency_s"] = hit.latency_s
            j = next((s for s in judge_scores if s.record_id == rid and s.arm == arm and s.measured), None)
            if j is not None:
                row[f"judge.{arm}"] = j.score
        per_record.append(row)

    return Comparison(
        generated_at=time.strftime("%Y-%m-%dT%H:%M:%S"),
        repo_commit=repo_commit(),
        corpus=corpus or (paired_rows[0].corpus if paired_rows else ""),
        cases=sorted({r.case for r in paired_rows if r.case}),
        record_ids=ids,
        arms=list(arms),
        models={c.arm: c.model_label for c in columns},
        judge=judge.label if judge is not None else None,
        columns=columns,
        per_record=per_record,
        notes=notes,
    )
