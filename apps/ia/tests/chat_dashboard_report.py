"""Les métriques du tableau de pilotage, LUES dans CORPUS (#2443.11, #2899).

Vit sous `tests/` parce que `CORPUS` y vit (décision #1948) ; le RENDU
(`render_markdown`) vit sous `app/eval/chat_dashboard.py`, pur, sans jamais
importer `tests/` (GA-193). Ce module fait le pont, dans le sens autorisé.

Usage (depuis ``apps/ia``)::

    python -m tests.chat_dashboard_report                # Markdown sur stdout
    python -m tests.chat_dashboard_report --out rapport.md
"""

from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from app.access.rights_matrix import Famille
from app.eval.chat_dashboard import render_markdown
from app.eval.chat_prod_samples import load_prod_samples
from app.prompts.registry import prompt_registry_version
from tests.chat_gate_bench import hard_failure_coverage as _hard_failure_coverage
from tests.chat_gate_bench import key_role_coverage
from tests.test_copilote_scenario_corpus import CORPUS


def corpus_metrics() -> dict:
    outil_counts: dict[str, int] = {}
    for item in CORPUS:
        label = item.outil or "(aucun — règle de conduite du prompt)"
        outil_counts[label] = outil_counts.get(label, 0) + 1

    persona_counts: dict[str, int] = {f.value: sum(1 for item in CORPUS if f in item.meta.personas) for f in Famille}

    return {
        "version": prompt_registry_version(),
        "total_cases": len(CORPUS),
        "key_role_coverage": key_role_coverage(),
        "hard_failure_coverage": _hard_failure_coverage(),
        "persona_counts": persona_counts,
        "outil_counts": outil_counts,
    }


def build_report(*, with_prod_samples: bool = False) -> str:
    metrics = corpus_metrics()
    if with_prod_samples:
        # #2899 / #2443.10 — jamais par défaut : le rapport reste hermétique (aucun réseau).
        metrics["prod_samples"] = asyncio.run(load_prod_samples())
    return render_markdown(metrics)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Tableau de pilotage du chat (#2443.11) — rapport Markdown généré depuis le corpus versionné."
    )
    parser.add_argument("--out", type=Path, default=None, help="Fichier de sortie (défaut : stdout).")
    parser.add_argument(
        "--with-prod-samples",
        action="store_true",
        help="Relit aussi les demandes de production anonymisées par le pont interne (réseau ; éteint par défaut).",
    )
    args = parser.parse_args(argv)

    report = build_report(with_prod_samples=args.with_prod_samples)
    if args.out is not None:
        args.out.write_text(report, encoding="utf-8")
        print(f"Rapport écrit dans {args.out}")
    else:
        print(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
