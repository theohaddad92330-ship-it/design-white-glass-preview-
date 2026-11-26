"""Parité des motifs de masquage — TS (source de vérité) ↔ Python.

``packages/contracts/src/schemas/memory-redaction.ts`` masque une mémoire
`workspace` lue par qui n'en est pas l'auteur (décision de Louis du
15/09/2026, `MemoryService.toWireFact`, apps/api). Ce n'est pas le même sujet
que la garde de sortie de Laura (ce module, `secret_redaction.py`, masque ce
que le MODÈLE écrit) — mais les deux masques partagent la FORME de ce qu'est
un secret machine : plutôt que de recopier les motifs Python à l'œil dans le
fichier TS (deux dérivations qui divergeraient, interdit par GA-26), le
fichier TS porte des extraits de regex BYTE-IDENTIQUES à ceux de ce module, et
ce test le PROUVE en lisant le fichier TS par chemin — même discipline que
`test_consulting_domains_parity.py` pour `OFFER_DOMAINS`.

Il tourne en CI (monorepo présent) et se saute proprement dans une image
Railway (fichier absent, le service IA n'a pas le paquet contracts à
l'exécution).

Leçon « garde borgne » appliquée : le test PROUVE qu'il lit quelque chose (au
moins 4 familles extraites, pas zéro) avant de comparer.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.services.secret_redaction import _PATTERNS, _URL_CREDENTIALS  # noqa: PLC2701 (parité volontaire)

_TS_REL = Path("packages/contracts/src/schemas/memory-redaction.ts")


def _monorepo_file(rel: Path) -> Path | None:
    for parent in Path(__file__).resolve().parents:
        candidate = parent / rel
        if candidate.is_file():
            return candidate
    return None


def _ts_families() -> dict[str, str]:
    """name → source de regex, extraits du fichier TS (guillemets `String.raw\\``)."""
    source_path = _monorepo_file(_TS_REL)
    if source_path is None:
        pytest.skip("monorepo absent (image de déploiement) — la parité se vérifie en CI")
    source = source_path.read_text(encoding="utf-8")
    # `[\s\S]*?` non-gourmand : un commentaire (raison du motif) sépare souvent
    # `name:` de `pattern:` dans le fichier TS — un `\s*` seul ne le traverse pas.
    pattern = re.compile(r"name:\s*'([a-z_]+)',[\s\S]*?pattern:\s*String\.raw`([^`]*)`")
    return dict(pattern.findall(source))


def _find_pattern(patterns: tuple[re.Pattern[str], ...], marker: str) -> str:
    """La regex de `_PATTERNS` dont la source contient `marker` — par CONTENU,
    jamais par position (un motif inséré demain ne doit pas décaler un indice
    et faire comparer deux familles sans rapport)."""
    matches = [p.pattern for p in patterns if marker in p.pattern]
    assert len(matches) == 1, f"marqueur « {marker} » attendu UNE fois dans _PATTERNS, trouvé {len(matches)}"
    return matches[0]


#: Chaque famille TS ↔ la regex Python source qui doit la CONTENIR telle
#: quelle (byte-identique) — la référence, jamais une copie.
_PYTHON_SOURCE_BY_FAMILY: dict[str, str] = {
    "jwt": _find_pattern(_PATTERNS, "eyJ"),  # secret_redaction.py:49
    "internal_host": _find_pattern(_PATTERNS, "railway"),  # secret_redaction.py:56
    "iban": _find_pattern(_PATTERNS, r"[A-Z]{2}\d{2}"),  # secret_redaction.py:89
    "url_credentials": _URL_CREDENTIALS.pattern,  # secret_redaction.py:190
}


def test_ts_families_are_byte_identical_to_their_python_reference() -> None:
    families = _ts_families()
    # La garde LIT quelque chose : 4 familles, pas un fichier mal parsé.
    assert len(families) == 4, f"extraction TS: {len(families)} familles au lieu de 4"
    assert set(families) == set(_PYTHON_SOURCE_BY_FAMILY)
    for name, ts_pattern in families.items():
        assert ts_pattern == _PYTHON_SOURCE_BY_FAMILY[name], (
            f"{name}: le motif TS a divergé de sa référence Python — "
            f"TS={ts_pattern!r} / Python={_PYTHON_SOURCE_BY_FAMILY[name]!r}"
        )


def test_the_four_families_are_exactly_the_ones_proven_in_recette() -> None:
    """Portée volontairement PARTIELLE — voir la doc de `memory-redaction.ts`."""
    assert set(_ts_families()) == {"jwt", "internal_host", "iban", "url_credentials"}
