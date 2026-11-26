"""#3922.2 — chaque collecteur de signaux Découvrir STOCKE un `url`, même `None`.

Le besoin (#3922) : « un signal sans lien source vérifiable n'est pas présenté
comme fait établi » — un commercial qui s'appuie sur un signal pour appeler
doit savoir si ce signal est cliquable. `CandidateSignals.tsx` rend déjà
`signal.url` quand il existe et rien sinon (jamais un lien deviné) ; ce que ce
test couvre est l'AUTRE moitié, côté collecte : que la clé `url` soit bien
posée par CHAQUE source, jamais omise du dict `signal` — car une clé omise
disparaît en silence au lieu de se lire comme un `None` explicite.

Une vraie liste de « sans lien explicite » dans l'écran (#2166.33/#2613,
Louis 20/09/2026) a été délibérément RETIRÉE de `NeedResultRow` — une absence
ne fait pas une ligne dans une liste (GA-18/19). Ce test ne rouvre pas ce
désaccord ; il vérifie seulement ce qui ne contredit personne : la source
porte le fait, qu'on l'affiche ou non.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

_SOURCES_DIR = Path(__file__).resolve().parents[1] / "app" / "services" / "data_sources"

# Les cinq collecteurs qui alimentent `discover_signals.py` avec un dict
# `{"signal": {...}}` (voir le grep qui a servi à les trouver : chacun
# construit CE dict littéralement, à un seul endroit par fichier).
_SIGNAL_SOURCE_FILES = (
    "job_search.py",
    "apec.py",
    "public_tenders.py",
    "wttj.py",
    "france_travail.py",
)


def _signal_dict_literals(path: Path) -> list[ast.Dict]:
    """Les littéraux `{"type": ..., "label": ..., ...}` du fichier — trouvés
    par leur clé `"type"`, pas par une regex sur le texte source (une chaîne
    qui ressemble à du code ne doit jamais compter)."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    out: list[ast.Dict] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Dict):
            keys = [k.value for k in node.keys if isinstance(k, ast.Constant)]
            if "type" in keys and "label" in keys and "date" in keys:
                out.append(node)
    return out


@pytest.mark.parametrize("filename", _SIGNAL_SOURCE_FILES)
def test_signal_literal_always_carries_a_url_key(filename: str) -> None:
    path = _SOURCES_DIR / filename
    literals = _signal_dict_literals(path)
    assert literals, f"aucun littéral de signal trouvé dans {filename} — le repérage AST a besoin d'être ajusté"
    for literal in literals:
        keys = [k.value for k in literal.keys if isinstance(k, ast.Constant)]
        assert "url" in keys, f"{filename} construit un signal sans clé `url` (ligne {literal.lineno})"
