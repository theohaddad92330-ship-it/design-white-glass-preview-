"""R25 (15/10) — « Apollo » s'affichait dans la Synthèse : un texte qu'on écrit nous-mêmes
(avertissement, consigne que le modèle recopie) nommait NOTRE fournisseur. Doctrine : jamais."""

import re
from pathlib import Path

from app.graph.judge import _NAMED_SOURCE_RE

APP = Path(__file__).resolve().parent.parent / "app"
#: Les fichiers dont le texte finit à l'écran ou dans une sortie du modèle.
FILES = ("agents/classifier.py", "services/zero_layer.py")


def _string_literals(path: Path) -> list[str]:
    src = path.read_text(encoding="utf-8")
    src = re.sub(r"(?m)^\s*#.*$", "", src)  # commentaires
    src = re.sub(r'"""[\s\S]*?"""', "", src)  # docstrings
    return re.findall(r'"((?:[^"\\\n]|\\.)*)"', src)


def test_user_facing_texts_do_not_name_a_supplier() -> None:
    offenders = [
        (f, s)
        for f in FILES
        for s in _string_literals(APP / f)
        if _NAMED_SOURCE_RE.search(s) and not s.startswith(("Apollo ", "apollo"))
    ]
    assert offenders == []
