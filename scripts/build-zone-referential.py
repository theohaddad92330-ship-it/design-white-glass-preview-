#!/usr/bin/env python3
"""#4303 — régénère `apps/web/src/lib/zones/zone-referential.data.ts` (référentiel STATIQUE des zones).

Source : INSEE, Code officiel géographique (COG) 2025 + populations légales 2023 (millésime publié le 10/12/2025).
Aucune API externe à l'exécution : le fichier est versionné ; ce script ne sert qu'à le mettre à jour, à la main.

    python3 scripts/build-zone-referential.py <dossier avec v_region_2025.csv v_departement_2025.csv v_commune_2025.csv donnees_communes.csv>
"""

import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

MIN_POPULATION = 5000  # décision Louis 19/10/2026 : communes de plus de 5 000 habitants
src = Path(sys.argv[1])


def rows(name, delimiter=","):
    with open(src / name, encoding="utf-8-sig") as f:
        return list(csv.DictReader(f, delimiter=delimiter))


regions = sorted((r["REG"], r["LIBELLE"]) for r in rows("v_region_2025.csv"))
departments = sorted((d["DEP"], d["LIBELLE"], d["REG"]) for d in rows("v_departement_2025.csv"))
cog = {c["COM"]: c for c in rows("v_commune_2025.csv")}
parent = {c["COM"]: c["COMPARENT"] for c in cog.values() if c["TYPECOM"] == "ARM" and c["COMPARENT"]}

population = defaultdict(int)
for row in rows("donnees_communes.csv", ";"):
    # Paris, Lyon, Marseille : les arrondissements se somment dans leur commune.
    code = parent.get(row["COM"], row["COM"])
    population[code] += int(row["PMUN"])

communes = sorted(
    (code, cog[code]["LIBELLE"], cog[code]["DEP"])
    for code, pop in population.items()
    if pop >= MIN_POPULATION and code in cog and cog[code]["TYPECOM"] == "COM"
)
dep_codes = {d[0] for d in departments}
assert all(c[2] in dep_codes for c in communes), "commune sans département connu"

out = Path(__file__).resolve().parents[1] / "apps/web/src/lib/zones/zone-referential.data.ts"
out.parent.mkdir(parents=True, exist_ok=True)
dump = lambda v: json.dumps(v, ensure_ascii=False, separators=(",", ":"))
out.write_text(
    f"""// GÉNÉRÉ par scripts/build-zone-referential.py — ne pas éditer à la main.
// #4303 — référentiel STATIQUE des zones, versionné dans le dépôt (décision Louis 19/10/2026) : aucune API externe.
// Source : INSEE, Code officiel géographique (COG) 2025 + populations légales 2023, millésime publié le 10/12/2025.
// Communes retenues : population municipale ≥ {MIN_POPULATION} habitants (Paris, Lyon, Marseille : arrondissements sommés).
// Mise à jour : relancer le script avec les fichiers INSEE du nouveau millésime ; le test de forme garde le format.

/** [code région, libellé] */
export const ZONE_REGIONS: readonly (readonly [string, string])[] = {dump(regions)}

/** [code département, libellé, code région] */
export const ZONE_DEPARTMENTS: readonly (readonly [string, string, string])[] = {dump(departments)}

/** [code INSEE, libellé, code département] */
export const ZONE_COMMUNES: readonly (readonly [string, string, string])[] = {dump(communes)}
""",
    encoding="utf-8",
)
print(len(regions), len(departments), len(communes))
