"""Golden-set eval runner (#275).

Loads each golden expectation file, resolves the matching research output,
normalises it exactly as the pipeline does (re-applies the deterministic
priority/zone enrichment so a stale snapshot is judged against current code),
scores it with ``golden_eval.evaluate`` and prints a grouped report.

Usage (from ``apps/ia``):

    python -m evals.run_eval                      # all goldens vs frozen fixtures
    python -m evals.run_eval --company societe-generale
    python -m evals.run_eval --source /path/to/output.json --company doctolib
    python -m evals.run_eval --judge              # + semantic LLM-judge (needs ANTHROPIC_API_KEY)

The ``what_to_sell`` group is expected RED until that #275 increment lands —
that red is the spec. Exit code is non-zero if any *enabled* check fails, so a
future CI job can gate on ``--require entities,zones`` once those are stable.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Mapping
from pathlib import Path

from app.services.prioritization import assign_priority_tiers, tier_counts, zone_matrix

from .golden_eval import Report, evaluate

_HERE = Path(__file__).resolve().parent
_GOLDEN_DIR = _HERE / "golden"
# Frozen cross-lang contract fixtures — the default output source.
# _HERE = apps/ia/evals → parents[2] = repo root.
_FIXTURES_DIR = _HERE.parents[2] / "packages" / "contracts" / "src" / "fixtures"


def normalize_output(output: Mapping[str, object]) -> dict:
    """Re-apply the pipeline's deterministic enrichment so a stored snapshot is
    scored against the *current* prioritization code (tiers + zones + bands).

    Mirrors ``phase1_research.py``: tier the entity org map, then recompute the
    tier / zone summaries. LLM-produced fields (whatToSell, stack) pass through
    untouched — the harness can't invent them, which is exactly why the
    what_to_sell checks stay red until the prompt produces them."""
    out = dict(output)
    entities = out.get("entitiesExhaustive") or out.get("entities_exhaustive")
    if isinstance(entities, list) and entities:
        tiered = assign_priority_tiers(entities)
        out["entitiesExhaustive"] = tiered
        out["entityTierCounts"] = tier_counts(tiered)
        out["entityZones"] = zone_matrix(tiered)
    return out


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _resolve_output(slug: str, source: str | None) -> dict:
    if source:
        return _load_json(Path(source))
    fixture = _FIXTURES_DIR / f"research.{slug}.json"
    if not fixture.exists():
        raise FileNotFoundError(f"No fixture for {slug!r} at {fixture} — pass --source <output.json>.")
    return _load_json(fixture)


def _print_report(report: Report) -> None:
    by_group: dict[str, list] = {}
    for c in report.checks:
        by_group.setdefault(c.group, []).append(c)
    print(f"\n═══ {report.company} ═══")
    for group, checks in by_group.items():
        ok, total = sum(1 for c in checks if c.passed), len(checks)
        print(f"  [{group}] {ok}/{total}")
        for c in checks:
            mark = "✓" if c.passed else "✗"
            print(f"    {mark} {c.name} — {c.detail}")


def run(*, source: str | None, company: str | None, judge: bool, require: list[str] | None) -> int:
    goldens = sorted(_GOLDEN_DIR.glob("*.json"))
    if company:
        goldens = [g for g in goldens if g.stem == company]
        if not goldens:
            print(f"No golden named {company!r} in {_GOLDEN_DIR}", file=sys.stderr)
            return 2

    any_required_failed = False
    for golden_path in goldens:
        golden = _load_json(golden_path)
        slug = str(golden.get("slug") or golden_path.stem)
        try:
            output = normalize_output(_resolve_output(slug, source if company else None))
        except FileNotFoundError as exc:
            print(f"⚠ {slug}: {exc}", file=sys.stderr)
            continue

        report = evaluate(output, golden)
        _print_report(report)

        if judge:
            from .judge import judge_what_to_sell  # lazy — only import SDK path when asked

            verdicts = judge_what_to_sell(output, golden)
            print("  [judge]")
            for v in verdicts:
                mark = "✓" if v.get("accurate") else "✗"
                print(f"    {mark} {v.get('entity')} — {v.get('reason')}")

        groups = require if require else sorted(report.groups())
        ok = report.passed(only=groups)
        got, total = report.score(only=groups)
        print(f"  → {got}/{total} on [{', '.join(groups)}] {'PASS' if ok else 'FAIL'}")
        if require and not ok:
            any_required_failed = True

    return 1 if any_required_failed else 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Golden-set eval for Phase-1 research output (#275).")
    p.add_argument("--source", help="Path to a research output JSON (defaults to the frozen fixture).")
    p.add_argument("--company", help="Only evaluate this golden slug (e.g. societe-generale).")
    p.add_argument("--judge", action="store_true", help="Also run the semantic LLM-judge (needs ANTHROPIC_API_KEY).")
    p.add_argument(
        "--require",
        help="Comma-separated groups that must pass for exit 0 (e.g. entities,zones). Others are informational.",
    )
    args = p.parse_args(argv)
    require = [g.strip() for g in args.require.split(",")] if args.require else None
    return run(source=args.source, company=args.company, judge=args.judge, require=require)


if __name__ == "__main__":
    raise SystemExit(main())
