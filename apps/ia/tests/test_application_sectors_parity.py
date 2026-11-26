"""Parité des secteurs d'application — TS (source) ↔ Python (copie embarquée).

Même discipline que la table des 66 domaines : le service IA n'a pas le paquet
contracts à l'exécution, donc il en porte une copie, et une copie que rien ne
vérifie finit toujours par diverger. Le test PROUVE qu'il lit quelque chose
avant de comparer — une garde qui extrait zéro entrée est verte pour toujours.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.services.application_sectors import APPLICATION_SECTOR_LABELS_FR, application_sector_names_fr

_TS_REL = Path("packages/contracts/src/schemas/application-sectors.ts")


def _monorepo_file(rel: Path) -> Path | None:
    for parent in Path(__file__).resolve().parents:
        candidate = parent / rel
        if candidate.is_file():
            return candidate
    return None


def _ts_entries() -> dict[str, str]:
    source_path = _monorepo_file(_TS_REL)
    if source_path is None:
        pytest.skip("monorepo absent (image de déploiement) — la parité se vérifie en CI")
    source = source_path.read_text(encoding="utf-8")
    body = source.split("export const APPLICATION_SECTORS")[1]
    # Guillemets simples OU doubles : Prettier bascule en doubles dès qu'un
    # libellé contient une apostrophe (« Banque d'investissement »), et une
    # lecture qui ne verrait que les simples raterait exactement ces entrées.
    pattern = re.compile(r"code: '([a-z_]+)',\s*group: '[a-z_]+',\s*labelFr: (?:'((?:[^'\\]|\\.)*)'|\"([^\"]*)\"),")
    return {code: (single or double).replace("\\'", "'") for code, single, double in pattern.findall(body)}


def test_python_mirror_matches_the_contract() -> None:
    entries = _ts_entries()
    assert len(entries) > 30, "extraction vide ou partielle — la garde ne garderait rien"
    assert set(entries) == set(APPLICATION_SECTOR_LABELS_FR), "codes divergents entre TS et Python"
    for code, label_fr in entries.items():
        assert APPLICATION_SECTOR_LABELS_FR[code] == label_fr, f"{code}: libellé FR divergent"


def test_unknown_code_is_dropped_not_echoed() -> None:
    """Un code inconnu ne remonte pas tel quel : le prisme ne nomme jamais au
    modèle un secteur qu'il ne sait pas décrire."""
    assert application_sector_names_fr(["nuclear", "ce-code-nexiste-pas"]) == ["Nucléaire"]
    assert application_sector_names_fr(None) == []
