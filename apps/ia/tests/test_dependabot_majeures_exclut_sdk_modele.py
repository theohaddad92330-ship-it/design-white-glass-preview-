"""#4729 — une majeure de SDK modèle est une panne AVANT le réseau (25/10/2026).

anthropic 2.x retire `temperature` ; openai 3.x ne se résout pas avec instructor 1.17.
Ces deux paquets ne doivent donc pas revenir dans le groupe `majeures` de Dependabot.
"""
from pathlib import Path

import pytest

DEPENDABOT = Path(__file__).resolve().parents[3] / ".github" / "dependabot.yml"


def _bloc_pip_ia() -> str:
    texte = DEPENDABOT.read_text(encoding="utf-8")
    debut = texte.index("directory: /apps/ia\n")
    fin = texte.index("package-ecosystem", debut)
    return texte[debut:fin]


@pytest.mark.parametrize("paquet", ["anthropic", "openai"])
def test_sdk_modele_hors_du_groupe_majeures(paquet: str) -> None:
    bloc = _bloc_pip_ia()
    ligne = next(
        (l for l in bloc.splitlines() if l.strip().startswith("exclude-patterns:")), ""
    )
    assert paquet in ligne, f"{paquet} doit rester exclu du groupe `majeures` (#4729)"
