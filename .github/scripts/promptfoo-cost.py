#!/usr/bin/env python3
"""Plafond de coût d'un run promptfoo : jetons lus dans les résultats x prix, échec au-delà.

promptfoo n'expose pas le coût en dollars de façon fiable : on l'estime (jetons x prix par million).
Les prix par défaut SURESTIMENT (tarif d'un modèle plus cher) : le plafond se déclenche trop tôt, jamais trop tard.

Usage : promptfoo-cost.py results-chat.json results-analysis.json ...
Env   : PROMPTFOO_MAX_COST_USD (défaut 2), PROMPTFOO_PRICE_IN_USD_PER_MTOK (3), PROMPTFOO_PRICE_OUT_USD_PER_MTOK (15).
Sortie : une ligne de résumé ; code 1 si le coût estimé dépasse le plafond.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

DEFAULT_MAX_COST_USD = 2.0
DEFAULT_PRICE_IN = 3.0
DEFAULT_PRICE_OUT = 15.0


def _float_env(name: str, default: float) -> float:
    try:
        value = float((os.environ.get(name) or "").strip())
    except ValueError:
        return default
    return value if value > 0 else default


def tokens_of(payload: dict) -> tuple[int, int] | None:
    """(jetons entrée, jetons sortie) d'un fichier de résultats, ou None si non mesurable."""
    stats = ((payload.get("results") or {}).get("stats") or {}).get("tokenUsage") or {}
    prompt = int(stats.get("prompt") or 0)
    completion = int(stats.get("completion") or 0)
    if prompt or completion:
        return prompt, completion
    prompt = completion = 0
    for row in (payload.get("results") or {}).get("results") or []:
        usage = (row.get("response") or {}).get("tokenUsage") or {}
        prompt += int(usage.get("prompt") or 0)
        completion += int(usage.get("completion") or 0)
    return (prompt, completion) if (prompt or completion) else None


def estimate_usd(files: list[Path], price_in: float, price_out: float) -> tuple[float, list[str]]:
    total = 0.0
    unmeasured: list[str] = []
    for path in files:
        if not path.is_file():
            unmeasured.append(path.name)
            continue
        tokens = tokens_of(json.loads(path.read_text(encoding="utf-8")))
        if tokens is None:
            unmeasured.append(path.name)
            continue
        total += tokens[0] / 1e6 * price_in + tokens[1] / 1e6 * price_out
    return total, unmeasured


def main(argv: list[str]) -> int:
    cap = _float_env("PROMPTFOO_MAX_COST_USD", DEFAULT_MAX_COST_USD)
    cost, unmeasured = estimate_usd(
        [Path(a) for a in argv],
        _float_env("PROMPTFOO_PRICE_IN_USD_PER_MTOK", DEFAULT_PRICE_IN),
        _float_env("PROMPTFOO_PRICE_OUT_USD_PER_MTOK", DEFAULT_PRICE_OUT),
    )
    note = f" (coût non mesuré pour : {', '.join(unmeasured)})" if unmeasured else ""
    print(f"promptfoo : coût estimé {cost:.4f} $ pour un plafond de {cap:.2f} $ (PROMPTFOO_MAX_COST_USD){note}")
    return 1 if cost > cap else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
