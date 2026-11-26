"""#4386 — éval LIVE de la recherche de personne par nom (cascade base → registre → web).

HORS CI : chaque cas part sur les VRAIES sources (base de contacts, registre des
dirigeants, recherche web) et consomme du crédit de recherche. À lancer à la main,
clés posées, pour vérifier que la cascade trouve ce qu'un commercial cherche.

    cd apps/ia
    set -a && . ./.env && set +a          # APOLLO_API_KEY, BRAVE_API_KEY, SERPER_API_KEY…
    PYTHONPATH=. .venv/bin/python scripts/eval_recherche_nom.py
    PYTHONPATH=. .venv/bin/python scripts/eval_recherche_nom.py --case theo   # un sous-ensemble

Imprime, par cas : TROUVÉ / PAS TROUVÉ, l'attendu, les familles interrogées et leur
issue, le premier résultat (nom, entreprise, indice). Code de sortie 1 si un cas
s'écarte de l'attendu. Aucun e-mail ni téléphone n'est demandé ni imprimé : la
cascade ne fait jamais de reveal payant.

Sans AUCUNE clé (base de contacts ni recherche web), le script refuse de tourner :
le registre seul ne dirait rien de la cascade.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from dataclasses import dataclass

from app.services.person_name_search import search_person_by_name


@dataclass(frozen=True)
class Case:
    key: str
    full_name: str
    organization: str | None
    #: True : la personne doit sortir (nom ET entreprise quand une entreprise est donnée).
    expect_found: bool
    why: str


CASES: tuple[Case, ...] = (
    Case("theo", "Theo Haddad", "Bellum", True, "le symptôme prod : CEO absent de la base"),
    Case("theo-accent", "Théo Haddad", "Bellum AI", True, "accent + raison sociale complète"),
    Case("theo-inverse", "Haddad Theo", "Bellum", True, "nom et prénom inversés"),
    Case("theo-casse", "THEO HADDAD", "bellumai", True, "capitales + marque collée"),
    Case("theo-domaine", "theo haddad", "bellum.com", True, "entreprise donnée par son domaine"),
    Case("theo-seul", "Theo Haddad", None, True, "nom seul, homonymes possibles"),
    Case("compose", "Jean-Pierre Farandou", "SNCF", True, "prénom composé, marque ≠ raison sociale"),
    Case("compose-espace", "Jean Pierre Farandou", "SNCF", True, "prénom composé sans tiret"),
    Case("capgemini", "Aiman Ezzat", "Capgemini", True, "dirigeant d'un grand groupe"),
    Case("thales", "Patrice Caine", "Thales", True, "dirigeant d'un grand groupe"),
    Case("orange", "Christel Heydemann", "Orange", True, "dirigeante d'un grand groupe"),
    Case("orange-sa", "Christel Heydemann", "Orange SA", True, "suffixe juridique"),
    Case("homonymes", "Marie Martin", None, True, "homonymes nombreux sans entreprise"),
    Case("mauvaise-entreprise", "Theo Haddad", "Société Générale", False, "entreprise qui ne correspond pas"),
    Case("inconnu", "Zyx Qwerty", "Nulle Part", False, "personne nulle part : vide honnête"),
)

_KEYS = ("APOLLO_API_KEY", "BRAVE_API_KEY", "SERPER_API_KEY")


def _found(outcome, case: Case) -> bool:
    if case.organization:
        return any(h.match in ("name_and_company", "partial_name_and_company") for h in outcome.hits)
    return bool(outcome.hits)


async def _run(cases: list[Case]) -> int:
    failures = 0
    for case in cases:
        outcome = await search_person_by_name(full_name=case.full_name, organization_name=case.organization)
        found = _found(outcome, case)
        ok = found == case.expect_found
        failures += 0 if ok else 1
        queried = ", ".join(f"{s.family}={s.outcome}:{s.count}" for s in outcome.sources_queried) or "aucune"
        first = outcome.hits[0] if outcome.hits else None
        top = (
            f"{first.first_name} {first.last_name or first.last_name_obfuscated} — "
            f"{first.organization_name or '?'} — {first.match} — {'+'.join(first.sources)}"
            if first
            else "—"
        )
        print(
            f"[{'OK ' if ok else 'KO '}] {case.key:<20} {'TROUVÉ' if found else 'PAS TROUVÉ':<11} "
            f"(attendu {'trouvé' if case.expect_found else 'pas trouvé'}) · {case.full_name!r} @ {case.organization!r}"
        )
        print(f"       {case.why} · sources : {queried} · 1er : {top}")
    print(f"\n{len(cases) - failures}/{len(cases)} cas conformes")
    return 1 if failures else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--case", action="append", help="ne jouer que les cas dont la clé commence par ce préfixe")
    args = parser.parse_args()

    if not any(os.environ.get(k, "").strip() for k in _KEYS):
        print(f"Aucune clé parmi {', '.join(_KEYS)} : éval LIVE non lancée (hors CI, sources réelles).")
        return 2
    cases = [c for c in CASES if not args.case or any(c.key.startswith(p) for p in args.case)]
    return asyncio.run(_run(cases))


if __name__ == "__main__":
    sys.exit(main())
