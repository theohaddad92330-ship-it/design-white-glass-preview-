"""#2975 / #2440.82 — LE REJEU NOCTURNE DES ÉVALS IA.

Décision Louis (11/10/2026) : les évals IA se rejouent AUTOMATIQUEMENT chaque nuit,
avec un PLAFOND de coût, un arrêt au plafond, et une alerte si un compte régresse contre
la référence (``baseline.json``). Désactivable par une clé.

─────────────────────────────────────────────────────────────────────────────
CE QUE C'EST
─────────────────────────────────────────────────────────────────────────────
Le rejeu LIVE du banc (``python -m app.eval.run --live``, qui coûte de l'argent), compte
de référence par compte de référence (les goldens). Planifié par le planificateur du dépôt
côté CI (``.github/workflows/eval-nightly.yml``) : un rouge nocturne est un rouge, il notifie
— même raison que ``e2e-nightly.yml``.

* **Plafond** : ``EVAL_NIGHTLY_MAX_COST_USD`` (défaut 3 $). Avant CHAQUE compte, si la
  dépense mesurée a atteint le plafond, on s'arrête et on NOMME les comptes non rejoués.
* **Rotation** : le point de départ change chaque jour — un plafond atteint tôt ne prive pas
  toujours les mêmes comptes de leur rejeu.
* **Coût non mesuré ≠ 0** : si le registre de coûts ne tarife pas un run, on s'arrête après
  lui (le plafond ne peut plus être tenu) et on le dit.
* **Régression** : un score sous la référence de plus de ``REGRESSION_TOLERANCE`` (un rejeu
  live varie, contrairement aux fixtures hors-ligne dont la tolérance est 0,005), ou un
  compte qui passait et échoue. Exit 1.
* **Désactivation** : ``EVAL_NIGHTLY_ENABLED=false``. Sans clé d'API du modèle : no-op strict,
  zéro appel réseau.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import asdict, dataclass, field
from datetime import date
from typing import Any

from app.eval.golden import Golden, list_goldens
from app.eval.metrics import evaluate

ENABLED_ENV = "EVAL_NIGHTLY_ENABLED"
MAX_COST_ENV = "EVAL_NIGHTLY_MAX_COST_USD"

#: Plafond prudent : quelques dossiers par nuit, jamais les neuf comptes d'un coup.
DEFAULT_MAX_COST_USD = 3.0

#: Un rejeu live n'est pas déterministe : l'écart toléré contre la référence.
REGRESSION_TOLERANCE = 0.10

RunLive = Callable[[str, str], Awaitable[tuple[dict[str, Any], float | None]]]


def is_enabled() -> bool:
    return (os.environ.get(ENABLED_ENV) or "").strip().lower() not in ("false", "0", "no", "off")


def max_cost_usd() -> float:
    raw = (os.environ.get(MAX_COST_ENV) or "").strip()
    try:
        value = float(raw)
    except ValueError:
        return DEFAULT_MAX_COST_USD
    return value if value > 0 else DEFAULT_MAX_COST_USD


def rotation(goldens: list[Golden], today: date) -> list[Golden]:
    """Les comptes dans l'ordre de la nuit : le départ avance d'un cran par jour."""
    if not goldens:
        return []
    start = today.toordinal() % len(goldens)
    return goldens[start:] + goldens[:start]


@dataclass
class NightlyOutcome:
    status: str  # disabled | not_configured | ok | regression | stopped_at_cap | stopped_cost_unmeasured
    cap_usd: float
    spent_usd: float | None = None
    ran: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    regressions: list[str] = field(default_factory=list)

    @property
    def exit_code(self) -> int:
        return 1 if self.regressions else 0

    def as_dict(self) -> dict[str, Any]:
        return asdict(self) | {"exit_code": self.exit_code}


async def _live(company: str, slug: str) -> tuple[dict[str, Any], float | None]:
    """Le VRAI pipeline pour un compte, avec son coût mesuré (registre de coûts)."""
    from app.graph.builder import run_analysis_graph
    from app.services import cost_ledger

    with cost_ledger.bind_run(f"eval-nightly-{slug}-{uuid.uuid4().hex[:6]}"):
        state = await run_analysis_graph({"company_name": company}, thread_id=f"eval-nightly-{uuid.uuid4().hex[:8]}")
        return state, cost_ledger.total_usd()


def run_nightly(
    *,
    run_live: RunLive | None = None,
    today: date | None = None,
    max_goldens: int | None = None,
    baseline: dict[str, Any] | None = None,
) -> NightlyOutcome:
    from app.eval.run import compare_to_baseline, load_baseline

    cap = max_cost_usd()
    if not is_enabled():
        return NightlyOutcome(status="disabled", cap_usd=cap)
    runner = run_live or _live
    goldens = rotation(list_goldens(), today or date.today())
    if max_goldens is not None:
        goldens = goldens[:max_goldens]
    reference = baseline if baseline is not None else (load_baseline() or {})

    out = NightlyOutcome(status="ok", cap_usd=cap, spent_usd=0.0)
    reports: dict[str, Any] = {}
    for index, golden in enumerate(goldens):
        if out.spent_usd is not None and out.spent_usd >= cap:
            out.status = "stopped_at_cap"
            out.skipped = [g.slug for g in goldens[index:]]
            break
        state, cost = asyncio.run(runner(golden.company, golden.slug))
        out.ran.append(golden.slug)
        reports[golden.slug] = evaluate(state, golden.as_expectations())
        if cost is None:
            out.spent_usd = None
            out.status = "stopped_cost_unmeasured"
            out.skipped = [g.slug for g in goldens[index + 1 :]]
            break
        out.spent_usd += cost

    scoped = {**reference, "goldens": {s: (reference.get("goldens") or {}).get(s) for s in reports}}
    scoped["goldens"] = {s: v for s, v in scoped["goldens"].items() if v is not None}
    out.regressions = compare_to_baseline(reports, scoped, tolerance=REGRESSION_TOLERANCE)
    if out.regressions:
        out.status = "regression"
    return out


def main() -> int:
    if not (os.environ.get("ANTHROPIC_API_KEY") or "").strip():
        # Sans clé du modèle : no-op strict, aucun appel réseau.
        print(json.dumps(NightlyOutcome(status="not_configured", cap_usd=max_cost_usd()).as_dict(), ensure_ascii=False))
        return 0
    outcome = run_nightly()
    print(json.dumps(outcome.as_dict(), ensure_ascii=False, indent=2))
    return outcome.exit_code


if __name__ == "__main__":
    sys.exit(main())
