"""Lanceur du protocole : ``python -m app.eval.employment_freshness.run --truth <fichier local>``.

Sans clé, une source est ``BLOCKED`` (rien d'appelé). Sans fichier de vérité local : le gabarit commité sert de
``--dry-run`` (il n'a aucun identifiant, donc aucun appel). Le rapport ne contient ni nom ni identifiant.
Mesure LOCALE : couper Redis (``REDIS_URL`` vide) sinon un hit en cache (30 j) masque la fraîcheur réelle.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from pathlib import Path
from typing import Any

from app.eval.employment_freshness.protocol import (
    TRUTH_BY_CATEGORY,
    Observation,
    SourceReport,
    TruthCase,
    judge,
    render_markdown,
)
from app.eval.employment_freshness.sources import CANDIDATES, SourceAdapter, build_adapters

TEMPLATE = Path(__file__).with_name("truth_set.example.json")


def load_truth(path: Path) -> list[TruthCase]:
    raw: Any = json.loads(path.read_text(encoding="utf-8"))
    cases: list[TruthCase] = []
    for item in raw.get("cases", []):
        category = item.get("category")
        if category not in TRUTH_BY_CATEGORY:
            raise ValueError(f"catégorie inconnue : {category!r}")
        if not str(item.get("employer_ref", "")).strip():
            raise ValueError(f"cas {item.get('case_id')!r} sans employer_ref")
        handle = {k: str(v) for k, v in (item.get("handle") or {}).items() if str(v).strip()}
        cases.append(TruthCase(str(item["case_id"]), category, str(item["employer_ref"]), handle))
    return cases


def _unit_price(cost_provider: str) -> float | None:
    from app.services.cost_ledger import _unit_price as price

    return price(cost_provider)


async def measure(cases: list[TruthCase], adapters: list[SourceAdapter]) -> list[SourceReport]:
    reports: list[SourceReport] = []
    for adapter in adapters:
        if not adapter.configured():
            reports.append(SourceReport(adapter.name, blocked=f"{adapter.env_key} absente"))
            continue
        report = SourceReport(adapter.name, unit_price_usd=_unit_price(adapter.cost_provider))
        for case in cases:
            try:
                observation = await adapter.observe(case)
            except Exception as exc:  # une panne est un inconnu NOMMÉ, jamais un faux ni un juste
                observation = Observation(state="unknown", note=type(exc).__name__)
            report.add(case, judge(case, observation), observation)
        reports.append(report)
    for candidate in CANDIDATES:
        if not candidate.adapter and candidate.blocked_reason:
            reports.append(SourceReport(candidate.name, blocked=candidate.blocked_reason))
    return reports


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="#4799 — fraîcheur du poste : source × justes/faux/inconnus × coût")
    parser.add_argument("--truth", type=Path, default=None, help="jeu de vérité LOCAL (jamais commité)")
    args = parser.parse_args(argv)
    path = args.truth or TEMPLATE
    cases = load_truth(path)
    if not cases:
        print("jeu de vérité vide")
        return 1
    print(f"# Fraîcheur du poste — {len(cases)} cas ({'local' if args.truth else 'gabarit, dry-run'})\n")
    print(render_markdown(asyncio.run(measure(cases, build_adapters()))))
    if os.environ.get("REDIS_URL", "").strip():
        print("\n⚠️ REDIS_URL posée : un hit en cache peut masquer la fraîcheur réelle — relancer sans.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
