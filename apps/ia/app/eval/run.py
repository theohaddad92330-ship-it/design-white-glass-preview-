"""CLI runner for the IA v2 eval harness — the multi-account quality bench.

Scores analysis outputs against the eight deterministic metrics and prints a
per-metric + aggregate report plus a summary score table. HERMETIC by default:
it reads bundled golden fixtures (or a ``--source`` JSON) and never touches the
network. ``--live "Company"`` opts in to a REAL analysis via the LangGraph
engine (needs API keys) — off in tests.

The default (all-goldens) run also scores the bundled BAD counter-example
(``hallucinated.analysis.json``) and requires it to keep FAILING — a detector
that starts passing the bad dossier is itself a regression.

Baseline regression: ``baseline.json`` (committed next to this module) freezes
the expected scores. The default run prints the Δ against it; ``--check-baseline``
turns any score drop (> 0.005) or pass→fail flip into exit 1 (CI gate);
``--update-baseline`` rewrites it after an intentional metric change.

Usage (from ``apps/ia``)::

    python -m app.eval.run                          # bench: all goldens + counter-example + Δ baseline
    python -m app.eval.run --company doctolib       # one golden
    python -m app.eval.run --source out.json        # score a produced dossier
    python -m app.eval.run --source out.json --company societe-generale  # + golden expectations
    python -m app.eval.run --require faithfulness,coherence   # exit 1 only if these fail
    python -m app.eval.run --check-baseline         # enforce no regression vs baseline.json
    python -m app.eval.run --update-baseline        # freeze current scores as the new baseline
    python -m app.eval.run --json                   # machine-readable report
    python -m app.eval.run --live "Doctolib"        # REAL run (API keys, not hermetic)

Exit code is ``1`` if any evaluated report fails the required metrics (all by
default), if the counter-example guard breaks, or (with ``--check-baseline``)
on a regression — else ``0``.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from .golden import Golden, list_goldens, load_fixture, load_golden, load_json, resolve_analysis
from .metrics import evaluate
from .report import EvalReport
from .head_recall import check_head_recall, format_head_recall
from .role_floor import check_role_floor, format_role_floor

_MARK = {True: "✓", False: "✗"}

# Committed expected scores — the regression reference for the bench.
BASELINE_PATH = Path(__file__).resolve().parent / "baseline.json"

# A score may not drop by more than this vs the baseline (metrics are
# deterministic, so any real drop is a change — the epsilon only absorbs
# rounding).
BASELINE_TOLERANCE = 0.005

# The bundled BAD dossier the detectors must keep rejecting.
_COUNTEREXAMPLE_FIXTURE = "hallucinated.analysis"
_COUNTEREXAMPLE_KEY = "hallucinated"


def _print_report(report: EvalReport, *, require: list[str] | None) -> bool:
    ok = report.passed(only=require)
    print(f"\n═══ {report.company} ═══  aggregate={report.aggregate():.2f}  {'PASS' if ok else 'FAIL'}")
    for m in report.metrics:
        gate = "" if require is None or m.name in require else " (informational)"
        print(f"  {_MARK[m.passed]} {m.name:<18} {m.score:.2f}  — {m.detail}{gate}")
    return ok


def _print_score_table(rows: list[tuple[str, EvalReport, dict[str, Any] | None]]) -> None:
    """Compact bench table: one row per account, one column per metric, with the
    Δ aggregate vs the committed baseline when available."""
    if not rows:
        return
    metric_names = [m.name for m in rows[0][1].metrics]
    short = {n: n[:12] for n in metric_names}
    header = f"{'account':<18} " + " ".join(f"{short[n]:>12}" for n in metric_names) + f" {'aggregate':>9} {'Δbase':>7}"
    print("\n── Bench ──")
    print(header)
    print("─" * len(header))
    for key, report, base in rows:
        cells = " ".join(f"{m.score:>11.2f}{_MARK[m.passed]}" for m in report.metrics)
        agg = report.aggregate()
        delta = ""
        if base is not None:
            delta = f"{agg - float(base.get('aggregate', 0.0)):+.3f}"
        print(f"{key:<18} {cells} {agg:>9.2f} {delta:>7}")


# ── baseline ──────────────────────────────────────────────────────────────────


def load_baseline(path: Path | None = None) -> dict[str, Any] | None:
    p = path or BASELINE_PATH
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def _baseline_entry(report: EvalReport) -> dict[str, Any]:
    return {
        "aggregate": report.aggregate(),
        "passed": report.passed(),
        "metrics": {m.name: round(m.score, 4) for m in report.metrics},
    }


def write_baseline(
    golden_reports: dict[str, EvalReport],
    counterexample: EvalReport | None,
    path: Path | None = None,
) -> None:
    payload: dict[str, Any] = {
        "_comment": (
            "Committed expected scores for the eval bench (app.eval.run). Regenerate "
            "with `python -m app.eval.run --update-baseline` after an INTENTIONAL "
            "metric/fixture change — never to paper over a regression."
        ),
        "goldens": {slug: _baseline_entry(r) for slug, r in sorted(golden_reports.items())},
    }
    if counterexample is not None:
        payload["counterexample"] = {_COUNTEREXAMPLE_KEY: _baseline_entry(counterexample)}
    (path or BASELINE_PATH).write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def compare_to_baseline(
    golden_reports: dict[str, EvalReport],
    baseline: dict[str, Any],
    *,
    tolerance: float = BASELINE_TOLERANCE,
) -> list[str]:
    """Regressions of the current run vs the committed baseline (empty = none).

    A regression is: a golden disappearing, its aggregate or any per-metric
    score dropping by more than ``tolerance``, or its overall pass flipping to
    False. Improvements are never regressions.

    LOT C-5b — un golden que la baseline NE CONNAÎT PAS est un problème, lui
    aussi. Cette boucle ne parcourait que la baseline : un compte ajouté au jeu
    de référence sans son entrée n'était comparé à RIEN, tout en s'affichant
    « ✓ » dans le rapport. « Cinq comptes nommés gatés » devenait une promesse
    que le fichier ne pouvait pas tenir — le cas exact d'une garde qui ne LIT
    pas ce qu'elle prétend garder. Le rattrapage est celui que la doc nomme
    déjà : ``--update-baseline`` dans la MÊME PR que le nouveau golden.
    """
    problems: list[str] = []
    unknown = sorted(set(golden_reports) - set(baseline.get("goldens") or {}))
    problems += [
        f"{slug}: golden absent de la baseline — il n'est comparé à rien "
        "(lancer `python -m app.eval.run --update-baseline`)"
        for slug in unknown
    ]
    for slug, expected in (baseline.get("goldens") or {}).items():
        report = golden_reports.get(slug)
        if report is None:
            problems.append(f"{slug}: golden absent du run (présent dans la baseline)")
            continue
        agg = report.aggregate()
        if agg < float(expected.get("aggregate", 0.0)) - tolerance:
            problems.append(f"{slug}: aggregate {agg:.4f} < baseline {expected['aggregate']:.4f}")
        if bool(expected.get("passed")) and not report.passed():
            problems.append(f"{slug}: passait dans la baseline, échoue maintenant")
        current = {m.name: m.score for m in report.metrics}
        for name, score in (expected.get("metrics") or {}).items():
            if name in current and current[name] < float(score) - tolerance:
                problems.append(f"{slug}.{name}: {current[name]:.4f} < baseline {float(score):.4f}")
    return problems


# ── report assembly ───────────────────────────────────────────────────────────


# Le dossier SCORÉ voyage avec son rapport : le plancher de rôles (#2631.1) le
# relit pour dire quel siège du comité d'achat a disparu SUR CE COMPTE. Le
# recharger plus bas donnerait un second chemin de lecture, donc deux vérités
# possibles pour un même run — c'est exactement ce qu'un plancher ne peut pas se
# permettre.
Scored = tuple[EvalReport, Golden | None, dict[str, Any]]


def _reports_from_goldens(company: str | None, source: str | None) -> list[Scored]:
    goldens = [load_golden(company)] if company else list_goldens()
    out: list[Scored] = []
    for golden in goldens:
        analysis = load_json(source) if source else resolve_analysis(golden)
        out.append((evaluate(analysis, golden.as_expectations()), golden, analysis))
    return out


def _reports_from_source(source: str) -> list[Scored]:
    analysis = load_json(source)
    return [(evaluate(analysis, None), None, analysis)]


def _live_reports(company: str, source_out: str | None) -> list[Scored]:
    """Run the REAL analysis engine and score its final state. Not hermetic —
    imported lazily so the default (hermetic) path never pulls the engine."""
    import asyncio
    import uuid

    from app.graph.builder import run_analysis_graph  # lazy: heavy + engine-bound

    async def _run() -> dict[str, Any]:
        return await run_analysis_graph({"company_name": company}, thread_id=f"eval-{uuid.uuid4().hex[:8]}")

    state = asyncio.run(_run())
    if source_out:
        Path(source_out).write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    return [(evaluate(state, None), None, state)]


def run(
    *,
    source: str | None = None,
    company: str | None = None,
    require: list[str] | None = None,
    as_json: bool = False,
    live: str | None = None,
    save: str | None = None,
    check_baseline: bool = False,
    update_baseline: bool = False,
    baseline_path: Path | None = None,
) -> int:
    is_bench = not (live or source or company)
    if live:
        reports = _live_reports(live, save)
    elif source and not company:
        reports = _reports_from_source(source)
    else:
        reports = _reports_from_goldens(company, source)

    # Counter-example guard — only on the full bench run (hermetic + cheap): the
    # detectors must keep REJECTING the bundled bad dossier.
    counter_report: EvalReport | None = None
    if is_bench:
        counter_report = evaluate(load_fixture(_COUNTEREXAMPLE_FIXTURE), None)

    baseline = load_baseline(baseline_path)

    if as_json:
        payload = [r.as_dict() | ({"golden": g.slug} if g else {}) for r, g, _a in reports]
        if counter_report is not None:
            payload.append(counter_report.as_dict() | {"counterexample": True})
        print(json.dumps(payload, ensure_ascii=False, indent=2))

    all_ok = True
    for report, _golden, _analysis in reports:
        ok = _print_report(report, require=require) if not as_json else report.passed(only=require)
        all_ok = all_ok and ok

    golden_reports = {g.slug: r for r, g, _a in reports if g is not None}

    if not as_json:
        base_goldens = (baseline or {}).get("goldens") or {}
        rows: list[tuple[str, EvalReport, dict[str, Any] | None]] = [
            (slug, r, base_goldens.get(slug)) for slug, r in sorted(golden_reports.items())
        ]
        if counter_report is not None:
            rows.append((f"{_COUNTEREXAMPLE_KEY} (bad)", counter_report, None))
        _print_score_table(rows)

    if counter_report is not None:
        if counter_report.passed():
            print("\n✗ GUARD: le contre-exemple (dossier halluciné) PASSE le banc — détecteurs cassés.")
            all_ok = False
        elif not as_json:
            print(f"\n✓ guard: le contre-exemple échoue comme attendu (aggregate {counter_report.aggregate():.2f})")

    # #2631.1 — le gate voit CE compte-là, pas la moyenne.
    # Le plancher tourne AVANT et INDÉPENDAMMENT de `--check-baseline` : la
    # baseline compare des moyennes et des scores de métrique, et c'est
    # précisément ce qu'une moyenne en hausse peut masquer. Un siège du comité
    # d'achat qui disparaît sur un compte NOMMÉ fait échouer le banc, même quand
    # tout le reste progresse.
    golden_pairs = [(g, a) for _r, g, a in reports if g is not None]
    if is_bench or golden_pairs:
        floor = check_role_floor(golden_pairs, require_corpus=True)
        if not as_json:
            for line in format_role_floor(floor):
                print(line)
        if floor.problems:
            print("\n✗ PLANCHER DE RÔLES (#2631.1) — le comité d'achat d'un compte nommé a bougé:")
            for problem in floor.problems:
                print(f"  - {problem}")
            all_ok = False
        elif not as_json:
            print(
                f"✓ plancher de rôles: {floor.roles_checked} siège(s) tenus sur "
                f"{floor.accounts_read} compte(s) de référence"
            )
        # #4923.14 — le rappel des rôles de TÊTE (Head of Data, Achats, DSI). Le plancher
        # bloque ; le seuil de rappel est rapporté, pas bloquant, tant que les fixtures
        # n'ont pas été rafraîchies par le rattrapage (#4923.15) — voir head_recall.py.
        heads = check_head_recall(golden_pairs, require_corpus=is_bench)
        if not as_json:
            for line in format_head_recall(heads):
                print(line)
        if heads.problems:
            print("\n✗ RAPPEL DES TÊTES (#4923.14) — une tête de famille cible a disparu d'un compte nommé:")
            for problem in heads.problems:
                print(f"  - {problem}")
            all_ok = False
    elif not as_json:
        print("\nplancher de rôles (#2631.1): non applicable — aucun compte de référence dans ce run")

    if update_baseline:
        write_baseline(golden_reports, counter_report, baseline_path)
        print(f"baseline écrite → {(baseline_path or BASELINE_PATH)}")
        return 0

    if check_baseline:
        if baseline is None:
            print("✗ --check-baseline: aucune baseline committée (lancer --update-baseline d'abord)")
            return 1
        problems = compare_to_baseline(golden_reports, baseline)
        if problems:
            print("\n✗ RÉGRESSION vs baseline:")
            for p in problems:
                print(f"  - {p}")
            return 1
        if not as_json:
            print("✓ pas de régression vs baseline")

    return 0 if all_ok else 1


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        description="IA v2 eval bench — deterministic quality metrics over analysis outputs."
    )
    p.add_argument("--source", help="Analysis output JSON to score (defaults to the bundled golden fixtures).")
    p.add_argument("--company", help="Only this golden slug (e.g. doctolib, societe-generale).")
    p.add_argument("--require", help="Comma-separated metrics that must pass for exit 0 (default: all).")
    p.add_argument("--json", dest="as_json", action="store_true", help="Emit a machine-readable JSON report.")
    p.add_argument(
        "--check-baseline",
        action="store_true",
        help="Exit 1 if any golden's score regressed vs the committed baseline.json.",
    )
    p.add_argument(
        "--update-baseline",
        action="store_true",
        help="Freeze the current scores as the new committed baseline.json.",
    )
    p.add_argument(
        "--live", metavar="COMPANY", help="Run a REAL analysis via the engine (needs API keys; not hermetic)."
    )
    p.add_argument("--save", help="With --live: write the produced dossier JSON to this path.")
    args = p.parse_args(argv)
    require = [g.strip() for g in args.require.split(",")] if args.require else None
    return run(
        source=args.source,
        company=args.company,
        require=require,
        as_json=args.as_json,
        live=args.live,
        save=args.save,
        check_baseline=args.check_baseline,
        update_baseline=args.update_baseline,
    )


if __name__ == "__main__":
    raise SystemExit(main())
