"""Refresh the vendored copy of the shared JSON Schemas (#273).

``packages/shared/schemas`` is the source of truth, but it is NOT in the IA
deployment's build context (Railway root = ``apps/ia``; see the module docstring
of :mod:`app.contracts.shared_schemas`). So a copy ships next to the code, at
``app/contracts/schemas/``, and this script is the ONLY sanctioned way to produce
it — never hand-edit the copy.

    python -m app.contracts.sync_schemas            # rewrite the vendored copy
    python -m app.contracts.sync_schemas --check    # exit 1 if it is stale

``--check`` is what CI runs (via ``tests/test_shared_schemas.py::TestVendoredCopy``),
so a schema edited in ``packages/shared`` without re-running this fails the build
instead of silently shipping a stale contract.
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

from app.contracts.shared_schemas import _MONOREPO_REL, STEPS, VENDORED_DIR

#: Only the per-step contracts + the input contract travel into the image. The
#: fixtures (`__fixtures__/`) stay behind: they are test data, several hundred KB,
#: and nothing at runtime reads them.
VENDORED_GLOB = "*.schema.json"


def canonical_dir() -> Path:
    """``packages/shared/schemas`` in the monorepo, or exit with a clear message.

    Deliberately NOT ``shared_schemas.schemas_dir()``: that one falls back to the
    vendored copy, which would make this script compare the copy with itself.
    """
    for parent in Path(__file__).resolve().parents:
        candidate = parent / _MONOREPO_REL
        if all((candidate / f"{step}.schema.json").is_file() for step in STEPS):
            return candidate
    sys.exit(
        "packages/shared/schemas introuvable — ce script doit tourner DANS le "
        "monorepo (il synchronise la copie embarquée depuis la source de vérité)."
    )


def diff(canonical: Path, vendored: Path) -> tuple[list[str], list[str], list[str]]:
    """(missing, extra, different) file names between the two directories.

    Compare les OCTETS, directement.

    ⚠️ La version précédente utilisait ``filecmp.cmp(..., shallow=False)``, et le
    commentaire disait « compare CONTENT, not just size+mtime ». C'était faux :
    ``filecmp`` garde un CACHE indexé sur ``(chemins, type, taille, mtime)``, et
    il le consulte AVANT de lire quoi que ce soit — y compris en ``shallow=False``.
    Deux fichiers de même taille et de même mtime rendent donc le verdict
    précédent, quel que soit leur contenu.

    Ce n'est pas théorique : c'est exactement ce que produit une édition de MÊME
    LONGUEUR (« decideur » → « decideuR ») sur un système de fichiers dont la
    granularité de mtime est plus grossière que l'écart entre les deux écritures.
    Le test qui prouve que cette garde a des dents (« detects a tampered copy »)
    tombait dessus par intermittence en CI — et le jour où il tombe, la garde
    aurait laissé passer une copie embarquée divergente sans rien dire.

    Les schémas font quelques kilo-octets : les lire est moins cher que le cache
    qu'on vient de retirer, et le résultat ne dépend plus de l'horloge.
    """
    expected = {p.name for p in canonical.glob(VENDORED_GLOB)}
    present = {p.name for p in vendored.glob(VENDORED_GLOB)} if vendored.is_dir() else set()
    missing = sorted(expected - present)
    extra = sorted(present - expected)
    different = sorted(
        name for name in expected & present if (canonical / name).read_bytes() != (vendored / name).read_bytes()
    )
    return missing, extra, different


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="report staleness instead of fixing it")
    args = parser.parse_args(argv)

    canonical = canonical_dir()
    missing, extra, different = diff(canonical, VENDORED_DIR)

    if args.check:
        if not (missing or extra or different):
            print(f"vendored schemas up to date ({VENDORED_DIR})")
            return 0
        print("Copie embarquée OBSOLÈTE — lancer `python -m app.contracts.sync_schemas`.", file=sys.stderr)
        for label, names in (("manquant", missing), ("en trop", extra), ("différent", different)):
            for name in names:
                print(f"  {label}: {name}", file=sys.stderr)
        return 1

    VENDORED_DIR.mkdir(parents=True, exist_ok=True)
    for path in sorted(canonical.glob(VENDORED_GLOB)):
        shutil.copyfile(path, VENDORED_DIR / path.name)
    for name in extra:
        (VENDORED_DIR / name).unlink()
    print(f"synced {len(list(canonical.glob(VENDORED_GLOB)))} schema(s) → {VENDORED_DIR}")
    if extra:
        print(f"removed {len(extra)} stale file(s): {', '.join(extra)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
