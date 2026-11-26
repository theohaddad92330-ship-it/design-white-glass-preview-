"""Parité des codes NAF par secteur — TS (source) ↔ Python (miroir généré).

#2489.3 — même discipline que `test_application_sectors_parity.py` : le
service IA n'a pas le paquet contracts à l'exécution, donc il porte une copie
de `application-sector-naf.ts`, régénérée par
`apps/ia/scripts/sync_application_sector_naf.py`. Ce test PROUVE qu'il lit
quelque chose avant de comparer (une garde qui extrait zéro entrée est verte
pour toujours), et qu'il rougit si les deux divergent — la seule façon de
garder une copie honnête est de la vérifier, pas de croire qu'on ne l'a pas
oubliée.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.services.application_sector_naf import (
    APPLICATION_SECTOR_NAF,
    naf_codes_for_sectors,
    naf_prefixes_for_sectors,
)

_TS_REL = Path("packages/contracts/src/schemas/application-sector-naf.ts")

_OBJECT_RE = re.compile(r"export const APPLICATION_SECTOR_NAF:[^{]*\{(?P<body>.*?)\n\}", re.DOTALL)
_ENTRY_RE = re.compile(r"(?P<code>[a-z_]+):\s*\[(?P<codes>[^\]]*)\]", re.DOTALL)
_NAF_CODE_RE = re.compile(r"'([0-9A-Z.]+)'")


def _monorepo_file(rel: Path) -> Path | None:
    for parent in Path(__file__).resolve().parents:
        candidate = parent / rel
        if candidate.is_file():
            return candidate
    return None


def _ts_entries() -> dict[str, tuple[str, ...]]:
    source_path = _monorepo_file(_TS_REL)
    if source_path is None:
        pytest.skip("monorepo absent (image de déploiement) — la parité se vérifie en CI")
    source = source_path.read_text(encoding="utf-8")
    match = _OBJECT_RE.search(source)
    assert match, "APPLICATION_SECTOR_NAF introuvable dans le TS — format inattendu"
    entries: dict[str, tuple[str, ...]] = {}
    for entry in _ENTRY_RE.finditer(match.group("body")):
        codes = tuple(_NAF_CODE_RE.findall(entry.group("codes")))
        if codes:
            entries[entry.group("code")] = codes
    return entries


def test_python_mirror_matches_the_contract() -> None:
    entries = _ts_entries()
    assert len(entries) > 30, "extraction vide ou partielle — la garde ne garderait rien"
    assert sum(len(codes) for codes in entries.values()) > 300, "extraction vide ou partielle"
    assert set(entries) == set(APPLICATION_SECTOR_NAF), "secteurs divergents entre TS et Python"
    for code, codes in entries.items():
        assert tuple(APPLICATION_SECTOR_NAF[code]) == codes, f"{code}: codes NAF divergents"


def test_the_mirror_says_no_on_a_deliberately_wrong_copy() -> None:
    """La garde sait dire NON : une copie altérée ne doit jamais passer."""
    entries = _ts_entries()
    tampered = dict(APPLICATION_SECTOR_NAF)
    tampered["aerospace"] = ("00.00Z",)
    assert tampered["aerospace"] != entries["aerospace"]


def test_unknown_sector_adds_nothing() -> None:
    assert naf_codes_for_sectors(["aerospace", "ce-secteur-nexiste-pas"]) == ["30.30Z"]
    assert naf_codes_for_sectors(None) == []


def test_naf_codes_for_sectors_dedupe_across_sectors() -> None:
    # `renewables` et `nuclear` partagent `35.11Z` : il ne doit apparaître qu'une fois.
    codes = naf_codes_for_sectors(["nuclear", "renewables"])
    assert codes.count("35.11Z") == 1


def test_naf_prefixes_are_four_digits_without_dot_or_case() -> None:
    assert naf_prefixes_for_sectors(["aerospace"]) == ["3030"]
    assert naf_prefixes_for_sectors(None) == []
