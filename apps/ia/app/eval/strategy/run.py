"""CLI for the #274 strategy-token campaign.

    python -m app.eval.strategy.run companies                    # the golden set
    python -m app.eval.strategy.run variants                     # the A/B levers
    python -m app.eval.strategy.run baseline                     # CAPTURE (live, costs money)
    python -m app.eval.strategy.run capture --variant tight-concise
    python -m app.eval.strategy.run report                       # what's captured so far
    python -m app.eval.strategy.run ab --variant tight-concise   # the verdict
    python -m app.eval.strategy.run cost                         # projected campaign cost

``baseline`` / ``capture`` are the only subcommands that hit the network, and
they refuse to start without ``--yes-run-live`` — a full campaign bills real
Claude/Brave/Firecrawl/Apollo calls, so it may not be triggered by a typo. Every
other subcommand is hermetic and free.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import uuid
from pathlib import Path
from typing import Any

from .campaign import (
    Record,
    Verdict,
    capture,
    compare,
    estimate_campaign_cost,
    load_records,
    summarize,
)
from .catalog import CampaignCompany, list_companies, segment_counts
from .rubric import MAX_SCORE
from .variants import BASELINE, Variant, describe, get_variant, variant_names

logger = logging.getLogger(__name__)

# Campaign results live outside the package: they are measurements, not source.
DEFAULT_STORE = Path("evals-out") / "strategy-campaign.jsonl"


# ── the live runner ───────────────────────────────────────────────────────────


def live_run(company: CampaignCompany, variant: Variant) -> dict[str, Any]:
    """Run the REAL pipeline for one account. Costs money; imported lazily.

    The variant's env overrides are already applied by ``campaign.capture`` when
    this is called, so the engine picks them up through the normal config path —
    no special-casing inside the engine.
    """
    import asyncio

    from app.graph.builder import run_analysis_graph

    async def _go() -> dict[str, Any]:
        return await run_analysis_graph(
            {"company_name": company.company},
            thread_id=f"eval274-{variant.name}-{company.slug}-{uuid.uuid4().hex[:6]}",
        )

    return asyncio.run(_go())


# ── printing ──────────────────────────────────────────────────────────────────


def _print_companies(companies: list[CampaignCompany]) -> None:
    counts = segment_counts(companies)
    print(f"\nGolden set #274 — {len(companies)} comptes "
          f"({', '.join(f'{k}: {v}' for k, v in counts.items())})\n")
    print(f"{'slug':<18} {'segment':<13} {'SIREN':<10} {'capture':<14} secteur")
    print("─" * 96)
    for c in companies:
        print(f"{c.slug:<18} {c.segment:<13} {c.siren:<10} {c.capture_status:<14} {c.sector_hint}")
    missing = [c.slug for c in companies if not c.captured]
    if missing:
        print(f"\n{len(missing)} compte(s) sans sortie de référence — "
              "elle sera produite par `baseline` (jamais écrite à la main).")


def _print_variants() -> None:
    print("\nVariantes A/B (#274) — un levier = une config, jamais un patch\n")
    for name in variant_names():
        v = get_variant(name)
        print(f"  {describe(v)}")
        print(f"      {v.description}")


def _print_summary(records: list[Record]) -> None:
    variants = sorted({r.variant for r in records})
    if not variants:
        print("Aucun run capturé. Lancer `baseline --yes-run-live`.")
        return
    print(f"\n{'variant':<22} {'ok':>3} {'err':>4} {'tok/strat':>10} {'médiane':>8} "
          f"{'rubric':>8} {'$/run':>7} {'$ total':>8}")
    print("─" * 78)
    for name in variants:
        s = summarize(records, name)
        print(f"{name:<22} {s.n_ok:>3} {s.n_error:>4} {s.mean_strategy_output_tokens:>10.0f} "
              f"{s.median_strategy_output_tokens:>8.0f} {s.mean_rubric:>8.2f} "
              f"{s.mean_total_cost_usd:>7.3f} {s.total_cost_usd:>8.2f}")


def _print_verdict(v: Verdict) -> None:
    print(f"\n═══ A/B  {v.variant}  vs  {v.baseline} ═══")
    print(f"  comptes appariés    : {len(v.paired_slugs)}")
    print(f"  tokens output strat : {v.baseline_mean_tokens:.0f} → {v.variant_mean_tokens:.0f} "
          f"({v.token_delta_pct:+.2f} %)")
    print(f"  qualité (/{MAX_SCORE:.0f})     : {v.baseline_mean_rubric:.2f} → "
          f"{v.variant_mean_rubric:.2f} (Δ {v.rubric_delta:+.2f})")
    print(f"  pire compte         : {v.worst_account} (Δ {v.worst_account_delta:+.2f})")
    print()
    print(f"  {'✓' if v.tokens_reduced else '✗'} tokens réduits")
    print(f"  {'✓' if v.quality_ok else '✗'} qualité ≥ baseline")
    print(f"\n  → VERDICT : {'PASS — mergeable' if v.passed else 'FAIL — ne pas merger'}")
    for r in v.reasons:
        print(f"     · {r}")

    if v.per_account:
        print(f"\n  {'compte':<18} {'tok base':>9} {'tok var':>8} {'Δtok':>7} "
              f"{'rub base':>9} {'rub var':>8} {'Δrub':>7}")
        print("  " + "─" * 70)
        for a in v.per_account:
            print(f"  {a['slug']:<18} {a['baseline_tokens']:>9} {a['variant_tokens']:>8} "
                  f"{a['token_delta']:>+7} {a['baseline_rubric']:>9.2f} "
                  f"{a['variant_rubric']:>8.2f} {a['rubric_delta']:>+7.2f}")


# ── subcommands ───────────────────────────────────────────────────────────────


def _cmd_capture(args: argparse.Namespace, variant: Variant) -> int:
    store = Path(args.store)
    companies = list_companies(segment=args.segment) if args.segment else list_companies()
    if args.company:
        companies = [c for c in companies if c.slug == args.company]
        if not companies:
            print(f"Aucun compte {args.company!r} dans le golden set.", file=sys.stderr)
            return 2

    planned = len(companies) if args.limit is None else min(len(companies), args.limit)
    if not args.yes_run_live:
        print(
            f"\n⚠ `{args.command}` lance {planned} analyse(s) RÉELLE(S) sous la variante "
            f"{describe(variant)}.\n"
            "  Cela appelle Claude / Brave / Firecrawl / Apollo et coûte de l'argent réel.\n"
            "  Relancer avec --yes-run-live pour confirmer.\n"
            f"  (Reprise automatique : les comptes déjà capturés dans {store} sont sautés.)",
            file=sys.stderr,
        )
        return 2

    produced = capture(variant, store, live_run, companies=companies, limit=args.limit)
    n_ok = sum(1 for r in produced if r.ok)
    print(f"\n{len(produced)} run(s) — {n_ok} ok, {len(produced) - n_ok} en erreur → {store}")
    _print_summary(load_records(store))
    return 0 if n_ok == len(produced) else 1


def _cmd_ab(args: argparse.Namespace) -> int:
    records = load_records(Path(args.store))
    verdict = compare(records, args.baseline, args.variant)
    if args.as_json:
        print(json.dumps(verdict.as_dict(), ensure_ascii=False, indent=2))
    else:
        _print_verdict(verdict)
    return 0 if verdict.passed else 1


def _cmd_cost(args: argparse.Namespace) -> int:
    records = load_records(Path(args.store))
    companies = list_companies()
    est = estimate_campaign_cost(records, n_accounts=len(companies), n_variants=args.variants)
    if args.as_json:
        print(json.dumps(est, ensure_ascii=False, indent=2))
        return 0
    print(f"\nCampagne : {len(companies)} comptes × {args.variants} variante(s) = {est['runs']} runs")
    if not est["measured"]:
        print(f"  {est['note']}")
        print("  Estimation a priori : voir agent_docs/strategy-token-eval.md (§ coût).")
        return 0
    print(f"  coût moyen observé  : ${est['mean_run_cost_usd']:.4f}/run "
          f"(sur {est['sample_size']} run(s) capturés)")
    print(f"  dont phase strategy : ${est['mean_strategy_cost_usd']:.4f}/run")
    print(f"  → projection        : ${est['projected_cost_usd']:.2f}")
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="python -m app.eval.strategy.run",
        description="Campagne #274 — réduire les tokens output de bellum_strategy sans perte de qualité.",
    )
    p.add_argument("command",
                   choices=("companies", "variants", "baseline", "capture", "report", "ab", "cost"))
    p.add_argument("--variant", default=None, help="Variante à capturer / comparer.")
    p.add_argument("--baseline", default=BASELINE, help="Bras de référence de l'A/B.")
    p.add_argument("--store", default=str(DEFAULT_STORE), help="Fichier JSONL des mesures.")
    p.add_argument("--company", default=None, help="Ne traiter qu'un slug.")
    p.add_argument("--segment", default=None, help="Filtrer : grand-compte | eti | scale-up.")
    p.add_argument("--limit", type=int, default=None, help="Plafonner le nombre de runs.")
    p.add_argument("--variants", type=int, default=2, help="cost: nombre de bras de la campagne.")
    p.add_argument("--json", dest="as_json", action="store_true", help="Sortie machine.")
    p.add_argument("--yes-run-live", action="store_true",
                   help="Confirme des runs RÉELS et payants (baseline / capture).")
    args = p.parse_args(argv)

    if args.command == "companies":
        _print_companies(list_companies(segment=args.segment) if args.segment else list_companies())
        return 0
    if args.command == "variants":
        _print_variants()
        return 0
    if args.command == "report":
        _print_summary(load_records(Path(args.store)))
        return 0
    if args.command == "cost":
        return _cmd_cost(args)
    if args.command == "ab":
        if not args.variant:
            print("`ab` exige --variant.", file=sys.stderr)
            return 2
        return _cmd_ab(args)

    # baseline / capture
    name = BASELINE if args.command == "baseline" else args.variant
    if not name:
        print("`capture` exige --variant (ou utiliser `baseline`).", file=sys.stderr)
        return 2
    try:
        variant = get_variant(name)
    except KeyError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    return _cmd_capture(args, variant)


if __name__ == "__main__":
    raise SystemExit(main())
