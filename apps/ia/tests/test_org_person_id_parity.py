"""Le slug personne doit être IDENTIQUE côté IA et côté API.

Un rejet mémorisé par l'API (« ce contact n'est plus là ») ne retrouve la personne
au run suivant que si les deux implémentations produisent le même id — les ids
sont re-synthétisés depuis le NOM à chaque run. Une divergence ne lève aucune
erreur : le contact écarté réapparaît simplement, ce que la Phase 4 existe
précisément pour empêcher. Les cas vivent dans un fichier partagé, asserté ici et
par `org-graph-versioning.spec.ts`.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.services.org_graph_assembler import _slug

CASES = json.loads((Path(__file__).parent / "fixtures" / "org_person_ids.json").read_text(encoding="utf-8"))["cases"]


@pytest.mark.parametrize("case", CASES, ids=[c["id"] for c in CASES])
def test_person_id_matches_the_shared_fixture(case: dict) -> None:
    assert f"p-{_slug(case['name'], 'p')}" == case["id"]
