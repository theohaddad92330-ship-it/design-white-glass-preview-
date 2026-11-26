"""``python -m app.eval.recette`` — la recette golden (#2130), hors ligne.

    python -m app.eval.recette                                  # rejoue les 15 dossiers de référence
    python -m app.eval.recette --account <slug> --dossier <f>   # note un dossier produit

Sort en 1 dès qu'un compte échoue — une recommandation générique suffit (#2130.38).
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence

from .grid import list_accounts, load_account, load_dossier, run_account


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.eval.recette", description=__doc__)
    parser.add_argument("--account", help="slug du compte golden à rejouer")
    parser.add_argument("--dossier", help="dossier JSON à noter (défaut : le dossier de référence du compte)")
    args = parser.parse_args(list(argv) if argv is not None else None)
    if args.dossier and not args.account:
        parser.error("--dossier demande --account")

    corpus = list_accounts()
    accounts = [load_account(args.account)] if args.account else corpus
    failed = 0
    for account in accounts:
        dossier = load_dossier(args.dossier) if args.dossier else account.dossier
        report = run_account(account, dossier, corpus)
        print(("OK    " if report.passed else "ECHEC ") + report.summary)
        for check in report.checks:
            if check.verdict == "echoue":
                print(f"      {check.key} : {check.detail}")
        failed += 0 if report.passed else 1
    print(f"recette golden : {len(accounts) - failed}/{len(accounts)} compte(s) passent")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
