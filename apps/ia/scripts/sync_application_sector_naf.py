#!/usr/bin/env python3
"""Régénère le miroir Python de ``APPLICATION_SECTOR_NAF`` depuis le contrat TS.

    python3 apps/ia/scripts/sync_application_sector_naf.py

─────────────────────────────────────────────────────────────────────────────
POURQUOI CE SCRIPT, ET PAS UNE COPIE À LA MAIN
─────────────────────────────────────────────────────────────────────────────
#2489.3 — le service IA n'a pas accès au paquet ``@bellum/contracts`` à
l'exécution (racine Railway = ``apps/ia``, même raison que
``app/services/application_sectors.py``), donc il porte une copie de
``packages/contracts/src/schemas/application-sector-naf.ts``. Une copie que
rien ne RÉGÉNÈRE finit toujours par diverger — c'est exactement ce que
``tests/test_application_sector_naf_parity.py`` détecte, mais détecter ne
corrige pas : ce script est ce qui fait converger les deux côtés. Ne jamais
éditer ``app/services/application_sector_naf.py`` à la main.

Ce script LIT le TS par une expression régulière (le fichier est une table
plate ``code: [...codes]``, sans objet imbriqué) et RÉÉCRIT le module Python en
entier. Il échoue bruyamment si l'extraction est vide ou partielle plutôt que
d'écrire un fichier tronqué en silence.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

_TS_REL = Path("packages/contracts/src/schemas/application-sector-naf.ts")
_PY_REL = Path("apps/ia/app/services/application_sector_naf.py")

_OBJECT_RE = re.compile(r"export const APPLICATION_SECTOR_NAF:[^{]*\{(?P<body>.*?)\n\}", re.DOTALL)
_ENTRY_RE = re.compile(r"(?P<code>[a-z_]+):\s*\[(?P<codes>[^\]]*)\]", re.DOTALL)
_NAF_CODE_RE = re.compile(r"'([0-9A-Z.]+)'")


def _monorepo_root() -> Path:
    for parent in Path(__file__).resolve().parents:
        if (parent / _TS_REL).is_file():
            return parent
    raise SystemExit(f"introuvable depuis {Path(__file__).resolve()} : {_TS_REL}")


def _extract(source: str) -> dict[str, list[str]]:
    match = _OBJECT_RE.search(source)
    if not match:
        raise SystemExit("APPLICATION_SECTOR_NAF introuvable dans le TS — format inattendu")
    entries: dict[str, list[str]] = {}
    for entry in _ENTRY_RE.finditer(match.group("body")):
        codes = _NAF_CODE_RE.findall(entry.group("codes"))
        if codes:
            entries[entry.group("code")] = codes
    return entries


def _render(entries: dict[str, list[str]]) -> str:
    lines = [
        '"""Secteurs d\'application → leurs codes NAF — miroir embarqué du contrat TS.',
        "",
        "GÉNÉRÉ par ``apps/ia/scripts/sync_application_sector_naf.py`` depuis",
        "``packages/contracts/src/schemas/application-sector-naf.ts`` — LA source. Ne pas",
        "éditer à la main : régénérer avec le script, qui échoue si le TS ne se lit plus.",
        "Sa parité est verrouillée par ``tests/test_application_sector_naf_parity.py``.",
        '"""',
        "",
        "from __future__ import annotations",
        "",
        "#: code → codes NAF COMPLETS (pour INTERROGER un registre). Miroir VERBATIM de",
        "#: ``APPLICATION_SECTOR_NAF``.",
        "APPLICATION_SECTOR_NAF: dict[str, tuple[str, ...]] = {",
    ]
    for code, codes in entries.items():
        codes_literal = ", ".join(f'"{c}"' for c in codes)
        lines.append(f'    "{code}": ({codes_literal}{"," if len(codes) == 1 else ""}),')
    lines.append("}")
    lines.append("")
    lines.append("")
    lines.extend(
        [
            "def naf_codes_for_sectors(sectors: list[str] | tuple[str, ...] | None) -> list[str]:",
            '    """Les codes NAF d\'une sélection de secteurs, dédupliqués, dans l\'ordre reçu.',
            "",
            "    Un secteur inconnu n'ajoute RIEN — il ne vide pas la liste (même règle que",
            '    `naf_sections.py`)."""',
            "    seen: set[str] = set()",
            "    out: list[str] = []",
            "    for sector in sectors or ():",
            "        for naf in APPLICATION_SECTOR_NAF.get(str(sector), ()):",
            "            if naf not in seen:",
            "                seen.add(naf)",
            "                out.append(naf)",
            "    return out",
            "",
            "",
            "def naf_prefixes_for_sectors(sectors: list[str] | tuple[str, ...] | None) -> list[str]:",
            '    """Les préfixes à quatre chiffres d\'une sélection — pour CLASSER un code NAF',
            "    déjà connu, jamais pour interroger (même distinction que `esn_naf.py`). Sans",
            "    point ni casse : le registre écrit « 3030 », la table écrit « 30.30Z »,",
            '    une comparaison littérale raterait."""',
            "    seen: set[str] = set()",
            "    for naf in naf_codes_for_sectors(sectors):",
            '        digits = "".join(ch for ch in naf if ch.isdigit())',
            "        if digits:",
            "            seen.add(digits[:4])",
            "    return list(seen)",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    root = _monorepo_root()
    source = (root / _TS_REL).read_text(encoding="utf-8")
    entries = _extract(source)
    if len(entries) < 30:
        raise SystemExit(f"extraction trop courte ({len(entries)} secteurs) — le TS a-t-il changé de forme ?")
    total_codes = sum(len(codes) for codes in entries.values())
    (root / _PY_REL).write_text(_render(entries), encoding="utf-8")
    print(f"écrit {root / _PY_REL} : {len(entries)} secteurs, {total_codes} codes NAF")


if __name__ == "__main__":
    sys.exit(main())
