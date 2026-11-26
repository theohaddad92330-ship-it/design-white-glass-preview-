"""#2310.10 (épopée #2919) — Market Memory ne crée jamais une personne ni un
lien hiérarchique de l'OrgGraph.

Mesuré le 26/09/2026 : ``org_graph_assembler.py`` (le SEUL producteur de
``people[]``/``hierarchyEdges[]``, voir son docblock) n'importe rien du tout
sous ``market_memory`` — la contrainte tient aujourd'hui par ABSENCE de
couplage, pas par un test qui la protège. Une garde qui ne lit rien et ne sait
pas dire NON ne protège rien (doctrine « une garde doit prouver trois
choses ») : ce fichier lit les imports RÉELS de l'assembleur (AST, jamais une
recherche de texte qui confondrait un commentaire et un import), prouve qu'il
lit quelque chose (l'assembleur importe bien son propre résolveur), et prouve
qu'il sait dire NON sur un cas synthétique — sans muter le vrai fichier.

Si un futur lot fait un jour lire ``market_memory_*`` à
``org_graph_assembler.py`` (pour peupler ``relationalEdges[]``, scope
``market_memory`` — voir ``org-graph.ts``), CE test échoue et le dit : Market
Memory doit alors alimenter ``relationalEdges[]`` exclusivement, jamais
``people[]``/``hierarchyEdges[]``.
"""

from __future__ import annotations

import ast
from pathlib import Path

_ASSEMBLER = Path(__file__).resolve().parent.parent / "app" / "services" / "org_graph_assembler.py"


def _imported_modules(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            modules.add(node.module)
    return modules


def test_la_garde_lit_reellement_le_fichier() -> None:
    # Témoin : si ce test passait sur un fichier vide, il ne prouverait rien.
    modules = _imported_modules(_ASSEMBLER)
    assert "app.services.org_resolver" in modules


def test_lassembleur_n_importe_jamais_market_memory() -> None:
    modules = _imported_modules(_ASSEMBLER)
    offending = {m for m in modules if "market_memory" in m}
    assert not offending, f"org_graph_assembler.py importe Market Memory : {offending}"


def test_la_garde_sait_dire_non_sur_un_cas_synthetique() -> None:
    # Preuve que la détection fonctionne, sans muter le vrai fichier assembleur.
    synthetic_modules = {"app.services.market_memory_angle", "app.services.org_resolver"}
    offending = {m for m in synthetic_modules if "market_memory" in m}
    assert offending == {"app.services.market_memory_angle"}
