"""Campaign engine for #274: capture a baseline, then A/B a variant against it.

Two jobs, both crash-safe:

**Capture** (:func:`capture`) walks the golden set for one variant, runs the
pipeline, and appends one JSONL record per account **as each finishes**. A run
costs real money, so the loop is *idempotent and resumable*: an account already
recorded ``ok`` is skipped, and an interrupted campaign resumes where it stopped
instead of re-billing the accounts it already paid for. Failures are recorded
too (``status: "error"``) so a resume retries only what broke.

**Compare** (:func:`compare`) pairs the two variants account-by-account and
answers the only question the DoD asks: *did tokens drop without quality
dropping?* Unpaired accounts are excluded rather than averaged in — comparing a
15-account baseline mean to an 11-account variant mean would silently reward
whichever arm happened to fail on the verbose accounts.

Nothing here calls Claude by itself: the runner is injected
(:data:`RunFn`), which is what makes the whole harness unit-testable with mocked
runs and zero network.
"""

from __future__ import annotations

import json
import logging
import statistics
import time
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .catalog import CampaignCompany, list_companies
from .rubric import MAX_SCORE, score_strategy
from .variants import Variant, applied

logger = logging.getLogger(__name__)

STATUS_OK = "ok"
STATUS_ERROR = "error"

# A variant's mean rubric score may sit at most this many points (/100) below the
# baseline's and still count as "quality >= baseline". Small on purpose: the
# rubric is deterministic, so a real drop is a real regression, and the epsilon
# only absorbs the ±1 element jitter of a generative model.
RUBRIC_MEAN_TOLERANCE = 1.0

# No single account may lose more than this many points, even if the mean holds.
# Guards the "great on 12 accounts, catastrophic on 3" failure mode an average
# hides — and those 3 are somebody's real prospect.
RUBRIC_PER_ACCOUNT_MAX_DROP = 5.0

# ``run`` signature: (company, variant) → the analysis dossier / final state.
RunFn = Callable[[CampaignCompany, Variant], Mapping[str, Any]]


# ── token extraction ──────────────────────────────────────────────────────────


def _walk_metrics(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Find ``_api_metrics.token_usage`` wherever the envelope keeps it.

    ``phase1_research`` writes it at the root of the research payload; a
    LangGraph final state nests that under ``research``; a stored dossier may
    nest it again. Checked in order, first hit wins.
    """
    candidates: list[Mapping[str, Any]] = [payload]
    for key in ("research", "raw_analysis", "state"):
        inner = payload.get(key)
        if isinstance(inner, Mapping):
            candidates.append(inner)
            deeper = inner.get("research")
            if isinstance(deeper, Mapping):
                candidates.append(deeper)
    for c in candidates:
        metrics = c.get("_api_metrics")
        if isinstance(metrics, Mapping):
            usage = metrics.get("token_usage")
            if isinstance(usage, Mapping):
                return dict(usage)
    return {}


def extract_tokens(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Strategy-phase and run-total token/cost figures for one run.

    Reads the ``by_phase`` breakdown shipped by ``phase_token_usage`` — the
    instrument #274 exists to consume. Missing telemetry yields zeros plus a
    logged error rather than an exception: one un-instrumented run must not kill
    a 15-account campaign.
    """
    usage = _walk_metrics(payload)
    if not usage:
        logger.error("no _api_metrics.token_usage found in run payload — token figures will be 0")
    by_phase = usage.get("by_phase")
    strategy = by_phase.get("strategy") if isinstance(by_phase, Mapping) else None
    if not isinstance(strategy, Mapping):
        if usage:
            logger.error(
                "token_usage present but has no by_phase.strategy breakdown — "
                "is phase_token_usage() wired? strategy figures will be 0",
            )
        strategy = {}
    return {
        "strategy_output_tokens": int(strategy.get("output_tokens") or 0),
        "strategy_input_tokens": int(strategy.get("input_tokens") or 0),
        "strategy_cost_usd": float(strategy.get("cost_usd") or 0.0),
        "total_output_tokens": int(usage.get("output_tokens") or 0),
        "total_input_tokens": int(usage.get("input_tokens") or 0),
        "total_cost_usd": float(usage.get("cost_usd") or 0.0),
    }


# ── records + store ───────────────────────────────────────────────────────────


@dataclass
class Record:
    """One (variant, account) measurement."""

    variant: str
    slug: str
    company: str
    status: str
    segment: str = ""
    strategy_output_tokens: int = 0
    strategy_input_tokens: int = 0
    strategy_cost_usd: float = 0.0
    total_output_tokens: int = 0
    total_input_tokens: int = 0
    total_cost_usd: float = 0.0
    rubric_total: float = 0.0
    rubric_bands: dict[str, float] = field(default_factory=dict)
    duration_s: float = 0.0
    captured_at: str = ""
    error: str = ""

    @property
    def ok(self) -> bool:
        return self.status == STATUS_OK

    def as_dict(self) -> dict[str, Any]:
        return {k: v for k, v in self.__dict__.items()}

    @classmethod
    def from_dict(cls, raw: Mapping[str, Any]) -> Record:
        known = {k: v for k, v in raw.items() if k in cls.__dataclass_fields__}
        return cls(**known)  # type: ignore[arg-type]


def load_records(path: Path) -> list[Record]:
    """Read a JSONL store. A truncated final line (killed mid-write) is dropped."""
    if not path.exists():
        return []
    records: list[Record] = []
    for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = line.strip()
        if not line:
            continue
        try:
            records.append(Record.from_dict(json.loads(line)))
        except (json.JSONDecodeError, TypeError) as exc:
            logger.error("skipping malformed record at %s:%d — %s", path, i, exc)
    return records


def append_record(path: Path, record: Record) -> None:
    """Append one record and flush — the crash-safety of the whole campaign."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record.as_dict(), ensure_ascii=False) + "\n")
        fh.flush()


def done_slugs(records: Iterable[Record], variant: str) -> set[str]:
    """Accounts already captured OK for this variant — the resume key."""
    return {r.slug for r in records if r.variant == variant and r.ok}


# ── capture ───────────────────────────────────────────────────────────────────


def capture(
    variant: Variant,
    store: Path,
    run: RunFn,
    *,
    companies: Sequence[CampaignCompany] | None = None,
    retry_errors: bool = True,
    limit: int | None = None,
) -> list[Record]:
    """Run the golden set under ``variant``, appending each result to ``store``.

    Resumable and idempotent: accounts already recorded ``ok`` are skipped, so
    re-invoking after a crash costs only the runs that never completed. Returns
    the records produced by *this* invocation (skipped ones are not re-emitted).
    """
    accounts = list(companies) if companies is not None else list_companies()
    existing = load_records(store)
    already = done_slugs(existing, variant.name)
    if not retry_errors:
        already |= {r.slug for r in existing if r.variant == variant.name}

    todo = [c for c in accounts if c.slug not in already]
    if limit is not None:
        todo = todo[:limit]

    logger.info(
        "campaign %s: %d account(s) to run, %d already captured",
        variant.name, len(todo), len(already),
    )

    produced: list[Record] = []
    for company in todo:
        started = time.monotonic()
        try:
            with applied(variant):
                payload = run(company, variant)
        except Exception as exc:  # noqa: BLE001 — one bad account must not sink the campaign
            logger.error(
                "campaign %s: run failed for %s — %s",
                variant.name, company.slug, exc,
                extra={"tags": {"variant": variant.name, "slug": company.slug}},
            )
            record = Record(
                variant=variant.name, slug=company.slug, company=company.company,
                segment=company.segment, status=STATUS_ERROR, error=str(exc),
                duration_s=round(time.monotonic() - started, 2),
                captured_at=time.strftime("%Y-%m-%dT%H:%M:%S"),
            )
        else:
            tokens = extract_tokens(payload)
            rubric = score_strategy(payload)
            record = Record(
                variant=variant.name, slug=company.slug, company=company.company,
                segment=company.segment, status=STATUS_OK,
                rubric_total=rubric.total,
                rubric_bands={b.name: b.points for b in rubric.bands},
                duration_s=round(time.monotonic() - started, 2),
                captured_at=time.strftime("%Y-%m-%dT%H:%M:%S"),
                **tokens,
            )
        append_record(store, record)
        produced.append(record)
    return produced


# ── aggregation ───────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Summary:
    """Aggregates for one variant over the accounts it captured successfully."""

    variant: str
    n_ok: int
    n_error: int
    mean_strategy_output_tokens: float
    median_strategy_output_tokens: float
    mean_total_output_tokens: float
    mean_rubric: float
    mean_strategy_cost_usd: float
    mean_total_cost_usd: float
    total_cost_usd: float

    def as_dict(self) -> dict[str, Any]:
        return dict(self.__dict__)


def _mean(values: Sequence[float]) -> float:
    return round(statistics.fmean(values), 2) if values else 0.0


def summarize(records: Iterable[Record], variant: str) -> Summary:
    rows = [r for r in records if r.variant == variant]
    ok = [r for r in rows if r.ok]
    strat = [float(r.strategy_output_tokens) for r in ok]
    return Summary(
        variant=variant,
        n_ok=len(ok),
        n_error=len(rows) - len(ok),
        mean_strategy_output_tokens=_mean(strat),
        median_strategy_output_tokens=round(statistics.median(strat), 2) if strat else 0.0,
        mean_total_output_tokens=_mean([float(r.total_output_tokens) for r in ok]),
        mean_rubric=_mean([r.rubric_total for r in ok]),
        mean_strategy_cost_usd=round(_mean([r.strategy_cost_usd for r in ok]), 4),
        mean_total_cost_usd=round(_mean([r.total_cost_usd for r in ok]), 4),
        total_cost_usd=round(sum(r.total_cost_usd for r in rows), 4),
    )


# ── A/B verdict ───────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Verdict:
    """The answer to "can this variant ship?"."""

    baseline: str
    variant: str
    paired_slugs: list[str]
    baseline_mean_tokens: float
    variant_mean_tokens: float
    token_delta_pct: float
    baseline_mean_rubric: float
    variant_mean_rubric: float
    rubric_delta: float
    worst_account: str
    worst_account_delta: float
    quality_ok: bool
    tokens_reduced: bool
    passed: bool
    reasons: list[str]
    per_account: list[dict[str, Any]] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return dict(self.__dict__)


def compare(
    records: Iterable[Record],
    baseline_name: str,
    variant_name: str,
    *,
    rubric_mean_tolerance: float = RUBRIC_MEAN_TOLERANCE,
    per_account_max_drop: float = RUBRIC_PER_ACCOUNT_MAX_DROP,
) -> Verdict:
    """Pair the two arms account-by-account and decide whether the variant ships.

    ``passed`` requires BOTH: tokens actually went down, AND quality held — where
    "held" means the mean rubric did not drop beyond tolerance *and* no single
    account fell off a cliff *and* the variant did not fail more runs than the
    baseline (a cap low enough to truncate the output would otherwise look like
    a fantastic token saving).
    """
    rows = list(records)
    base_by_slug = {r.slug: r for r in rows if r.variant == baseline_name and r.ok}
    var_by_slug = {r.slug: r for r in rows if r.variant == variant_name and r.ok}
    paired = sorted(set(base_by_slug) & set(var_by_slug))

    reasons: list[str] = []
    if not paired:
        return Verdict(
            baseline=baseline_name, variant=variant_name, paired_slugs=[],
            baseline_mean_tokens=0.0, variant_mean_tokens=0.0, token_delta_pct=0.0,
            baseline_mean_rubric=0.0, variant_mean_rubric=0.0, rubric_delta=0.0,
            worst_account="", worst_account_delta=0.0,
            quality_ok=False, tokens_reduced=False, passed=False,
            reasons=["aucun compte capturé dans les DEUX bras — rien à comparer"],
        )

    per_account: list[dict[str, Any]] = []
    for slug in paired:
        b, v = base_by_slug[slug], var_by_slug[slug]
        per_account.append({
            "slug": slug,
            "baseline_tokens": b.strategy_output_tokens,
            "variant_tokens": v.strategy_output_tokens,
            "token_delta": v.strategy_output_tokens - b.strategy_output_tokens,
            "baseline_rubric": b.rubric_total,
            "variant_rubric": v.rubric_total,
            "rubric_delta": round(v.rubric_total - b.rubric_total, 2),
        })

    b_tokens = _mean([float(base_by_slug[s].strategy_output_tokens) for s in paired])
    v_tokens = _mean([float(var_by_slug[s].strategy_output_tokens) for s in paired])
    b_rubric = _mean([base_by_slug[s].rubric_total for s in paired])
    v_rubric = _mean([var_by_slug[s].rubric_total for s in paired])

    token_delta_pct = round(((v_tokens - b_tokens) / b_tokens * 100.0), 2) if b_tokens else 0.0
    rubric_delta = round(v_rubric - b_rubric, 2)

    worst = min(per_account, key=lambda a: a["rubric_delta"])
    worst_slug, worst_delta = str(worst["slug"]), float(worst["rubric_delta"])

    quality_ok = True
    if rubric_delta < -rubric_mean_tolerance:
        quality_ok = False
        reasons.append(
            f"qualité moyenne en baisse : {v_rubric:.2f}/{MAX_SCORE:.0f} vs "
            f"{b_rubric:.2f} (Δ {rubric_delta:+.2f}, toléré ≥ -{rubric_mean_tolerance})"
        )
    if worst_delta < -per_account_max_drop:
        quality_ok = False
        reasons.append(
            f"décrochage sur un compte : {worst_slug} Δ {worst_delta:+.2f} points "
            f"(max toléré -{per_account_max_drop})"
        )

    n_base_err = sum(1 for r in rows if r.variant == baseline_name and not r.ok)
    n_var_err = sum(1 for r in rows if r.variant == variant_name and not r.ok)
    if n_var_err > n_base_err:
        quality_ok = False
        reasons.append(
            f"la variante échoue plus souvent : {n_var_err} erreur(s) vs {n_base_err} "
            "(sortie tronquée ? plafond trop bas)"
        )

    tokens_reduced = v_tokens < b_tokens
    if not tokens_reduced:
        reasons.append(
            f"aucune économie : {v_tokens:.0f} tokens vs {b_tokens:.0f} ({token_delta_pct:+.2f} %)"
        )

    if quality_ok and tokens_reduced:
        reasons.append(
            f"−{abs(token_delta_pct):.2f} % de tokens output strategy à qualité tenue "
            f"(Δ rubric {rubric_delta:+.2f})"
        )

    return Verdict(
        baseline=baseline_name, variant=variant_name, paired_slugs=paired,
        baseline_mean_tokens=b_tokens, variant_mean_tokens=v_tokens,
        token_delta_pct=token_delta_pct,
        baseline_mean_rubric=b_rubric, variant_mean_rubric=v_rubric,
        rubric_delta=rubric_delta,
        worst_account=worst_slug, worst_account_delta=worst_delta,
        quality_ok=quality_ok, tokens_reduced=tokens_reduced,
        passed=bool(quality_ok and tokens_reduced),
        reasons=reasons, per_account=per_account,
    )


# ── cost projection ───────────────────────────────────────────────────────────


def estimate_campaign_cost(
    records: Iterable[Record],
    *,
    n_accounts: int,
    n_variants: int,
) -> dict[str, Any]:
    """Project the cost of a full campaign from whatever has been measured.

    Uses the observed mean run cost when any run has been captured (the honest
    number, straight from ``_api_metrics``). With nothing captured yet it returns
    ``measured: False`` and no invented figure — the caller shows the a-priori
    estimate from the docs instead.
    """
    ok = [r for r in records if r.ok and r.total_cost_usd > 0]
    runs = n_accounts * n_variants
    if not ok:
        return {"measured": False, "runs": runs, "mean_run_cost_usd": None,
                "projected_cost_usd": None,
                "note": "aucun run capturé — lancer une baseline pour obtenir un coût réel"}
    mean_run = statistics.fmean([r.total_cost_usd for r in ok])
    return {
        "measured": True,
        "runs": runs,
        "sample_size": len(ok),
        "mean_run_cost_usd": round(mean_run, 4),
        "mean_strategy_cost_usd": round(statistics.fmean([r.strategy_cost_usd for r in ok]), 4),
        "projected_cost_usd": round(mean_run * runs, 2),
    }
