#!/usr/bin/env python3
"""CI-3 — inventaire des specs de migration « miroir SQL » (mock de QueryRunner.query + chaînes SQL).

Écrit docs/tests-inventory/migrations-miroirs.md. Aucune spec n'est supprimée : la liste sert à la validation
de Louis (Phase 4). Une spec est « miroir » si elle mocke `query` ; sinon elle est listée à part.
Usage : python3 tools/ci/migrations-mirrors-inventory.py
"""
import re
import subprocess
from pathlib import Path

root = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
files = subprocess.check_output(["git", "ls-files", "apps/api/src/migrations"], text=True, cwd=root).split()
specs = sorted(f for f in files if f.endswith(".spec.ts"))

mock = re.compile(r"query\s*[:=]\s*jest\.fn|jest\.fn\([^)]*\)[^;]*query|\bquery\b[^\n]*(mock|jest\.fn)|queries?\.(push|some|join)|\.query\)\.toHaveBeenCalled")
mirrors, others = [], []
for f in specs:
    text = (root / f).read_text(encoding="utf-8", errors="replace")
    (mirrors if mock.search(text) else others).append(f)

out = [
    "# Specs de migration « miroir SQL » (CI-3)",
    "",
    "Specs de `apps/api/src/migrations/**` qui mockent `QueryRunner.query` et comparent des chaînes SQL : elles prouvent que le",
    "texte n'a pas bougé, pas que Postgres l'accepte. Leur rôle de preuve passe à `apps/api/src/database/migrations-roundtrip.db.spec.ts`",
    "(up → schéma ↔ entités → down → vide → up, sur vrai Postgres, job « Démo (semis sur vraie base) »).",
    "",
    "**Aucune n'est supprimée.** Cette liste attend la validation de Louis (Phase 4) ; régénérée par",
    "`python3 tools/ci/migrations-mirrors-inventory.py`.",
    "",
    f"- Specs de migration au total : {len(specs)}",
    f"- Miroirs SQL (mock de `query`) : {len(mirrors)}",
    f"- Autres (pas de mock de `query` détecté) : {len(others)}",
    "",
    "## Miroirs SQL",
    "",
    *[f"- `{f.removeprefix('apps/api/src/migrations/')}`" for f in mirrors],
    "",
    "## Autres specs",
    "",
    *[f"- `{f.removeprefix('apps/api/src/migrations/')}`" for f in others],
    "",
]
dest = root / "docs" / "tests-inventory" / "migrations-miroirs.md"
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text("\n".join(out), encoding="utf-8")
print(f"{len(specs)} specs, {len(mirrors)} miroirs, {len(others)} autres -> {dest}")
