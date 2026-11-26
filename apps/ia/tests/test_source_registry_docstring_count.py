"""Garde (B) : le NOMBRE que le module `source_registry.py` s'attribue en toutes
lettres — « les quatre comportements… » — doit être le nombre RÉEL de valeurs
de `FailureBehaviour`.

Le défaut corrigé le 30/08/2026 : le docstring annonçait « les sept
comportements » au-dessus d'une énumération qui n'en portait que quatre — un
lecteur pressé aurait cru les sept couverts (`T-066`,
`agent_docs/iteration-3-trous-2026-08-30.md`). Une correction ponctuelle du
texte n'empêche pas la prochaine dérive (un cinquième comportement ajouté sans
mettre le docstring à jour, ou l'inverse) : cette garde relit le MODULE en
clair — docstring et commentaires compris — cherche chaque mention
« <nombre en toutes lettres> comportement(s) » et la compare au nombre réel de
valeurs portées par `FailureBehaviour`.

Une mention du compte HISTORIQUE du tome 2 (« sept codes de panne ») est
délibérément exclue de la détection : le mot qui suit n'est jamais
« comportement(s) » (c'est « codes »), pour ne pas confondre le nombre que le
tome proposait avec le nombre que ce registre déclare RÉELLEMENT tenir.
"""

from __future__ import annotations

import pathlib
import re
from typing import get_args

from app.services import source_registry
from app.services.source_registry import FailureBehaviour

_FRENCH_NUMBER_WORDS = {
    "un": 1,
    "deux": 2,
    "trois": 3,
    "quatre": 4,
    "cinq": 5,
    "six": 6,
    "sept": 7,
    "huit": 8,
    "neuf": 9,
    "dix": 10,
}

# « <nombre en toutes lettres> comportements » (PLURIEL uniquement — « un
# comportement » au singulier est l'article indéfini, pas un compte : le texte
# l'emploie ainsi ailleurs dans ce module, « inventerait UN comportement », et
# ce n'est pas une affirmation sur la taille de l'énumération).
_COUNT_PHRASE_RE = re.compile(
    r"\b(" + "|".join(_FRENCH_NUMBER_WORDS) + r")\b\s+comportements\b",
    re.IGNORECASE,
)

_SOURCE_PATH = pathlib.Path(source_registry.__file__)


def _stated_counts() -> set[int]:
    text = _SOURCE_PATH.read_text(encoding="utf-8")
    words = _COUNT_PHRASE_RE.findall(text)
    return {_FRENCH_NUMBER_WORDS[w.lower()] for w in words}


def test_the_guard_reads_a_non_empty_module_with_real_mentions() -> None:
    """Preuve que la garde LIT quelque chose : le module existe, au moins une
    mention « N comportement(s) » y est trouvée, et `FailureBehaviour` porte
    au moins une valeur (un corpus vide des deux côtés rendrait la garde
    vraie par vacuité, ce qui ne prouverait rien)."""
    assert _SOURCE_PATH.is_file()
    assert _stated_counts(), "aucune mention « N comportement(s) » trouvée dans le module"
    assert len(get_args(FailureBehaviour)) > 0


def test_docstring_and_comments_state_the_same_count_as_the_enum() -> None:
    actual = len(get_args(FailureBehaviour))
    stated = _stated_counts()
    assert stated == {actual}, (
        f"le module annonce {sorted(stated)} comportement(s) en toutes lettres "
        f"alors que FailureBehaviour en porte réellement {actual} — corriger "
        "le texte ou l'énumération, ils doivent s'accorder."
    )
