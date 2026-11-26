"""Point d'entrée CLI du tableau de pilotage du raisonnement commercial
(#3198, épopée #3223) — même forme que `chat_dashboard_report.py` (#2443.11).

Vit sous `tests/` par la même convention que son jumeau (même si ce rapport-ci
ne lit aucun `CORPUS` : rien à ponter, `render_markdown` ne prend aucun
argument) — pour qu'un opérateur trouve les deux rapports au même endroit.

Usage (depuis ``apps/ia``)::

    python -m tests.chat_reasoning_dashboard_report                # Markdown sur stdout
    python -m tests.chat_reasoning_dashboard_report --out rapport.md
"""

from __future__ import annotations

import argparse
from pathlib import Path

from app.eval.chat_reasoning_dashboard import render_markdown


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Tableau de pilotage du raisonnement commercial (#3198) — nomme les douze métriques et "
            "les huit alertes non mesurées aujourd'hui, avec leur raison."
        )
    )
    parser.add_argument("--out", type=Path, default=None, help="Fichier de sortie (défaut : stdout).")
    args = parser.parse_args(argv)

    report = render_markdown()
    if args.out is not None:
        args.out.write_text(report, encoding="utf-8")
        print(f"Rapport écrit dans {args.out}")
    else:
        print(report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
