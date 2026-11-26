"""#4118 — la garde de couches d'apps/ia passe sur le code ET sait dire NON.

`.importlinter` est lu tel quel ; le test négatif l'applique à un faux paquet `app`
où un import interdit est ajouté exprès (une feuille qui importe un service).
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

IA_ROOT = Path(__file__).resolve().parent.parent
CONFIG = IA_ROOT / ".importlinter"

LINT = shutil.which("lint-imports", path=str(Path(sys.executable).parent) + os.pathsep + os.environ.get("PATH", ""))
pytestmark = pytest.mark.skipif(LINT is None, reason="import-linter non installé (pip install -e .[dev])")


def _run(cwd: Path, pythonpath: Path) -> subprocess.CompletedProcess[str]:
    env = {**os.environ, "PYTHONPATH": str(pythonpath)}
    return subprocess.run(
        [str(LINT), "--config", str(CONFIG)], cwd=cwd, env=env, capture_output=True, text=True, check=False
    )


def test_real_code_respects_the_layer_contracts() -> None:
    result = _run(IA_ROOT, IA_ROOT)
    assert result.returncode == 0, (
        "lint-imports a échoué (rich incompatible ? voir pin import-linter<2.7 dans pyproject) :\n"
        + result.stdout
        + result.stderr
    )


def test_a_forbidden_import_fails_the_contract(tmp_path: Path) -> None:
    pkg = tmp_path / "app"
    subs = "access agents config contracts eval graph knowledge middleware models prompts routers services"
    for sub in subs.split():
        (pkg / sub).mkdir(parents=True)
        (pkg / sub / "__init__.py").write_text("")
    (pkg / "__init__.py").write_text("")
    (pkg / "main.py").write_text("")
    # Import interdit ajouté exprès : `access` est une feuille.
    (pkg / "access" / "bad.py").write_text("from app.services import nothing  # noqa\n")
    (pkg / "services" / "nothing.py").write_text("")
    # Les deux exceptions nommées du contrat services→routers doivent exister (sinon import-linter les refuse).
    (pkg / "routers" / "compare.py").write_text("")
    (pkg / "routers" / "discover.py").write_text("")
    (pkg / "services" / "chat_tools.py").write_text("from app.routers import compare, discover  # noqa\n")
    result = _run(tmp_path, tmp_path)
    assert result.returncode != 0
    assert "access and contracts are leaves" in result.stdout
    assert "BROKEN" in result.stdout
