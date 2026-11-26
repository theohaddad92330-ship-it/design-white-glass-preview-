"""#2899 / #3223 — la variable d'opérateur ne gouverne plus QUE le juge de production.

L'échantillonnage de conversations est un opt-in PAR ESPACE (côté API). Une garde qui sait dire NON :
elle LIT le code de ``app/`` et échoue si un autre lecteur que le juge ressuscite la variable
(un second endroit pour le réglage d'échantillonnage, GA-26).
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.eval.chat_prod_sampling import ENV_VAR, is_prod_sampling_enabled

APP = Path(__file__).resolve().parents[1] / "app"
#: Les seuls modules autorisés à LIRE la variable : le juge et sa route.
JUDGE_READERS = {"routers/reasoning_judge.py"}


def test_disabled_by_default_when_the_variable_is_absent(monkeypatch):
    monkeypatch.delenv(ENV_VAR, raising=False)
    assert is_prod_sampling_enabled() is False


@pytest.mark.parametrize("value", ["true", "TRUE", "  true  ", "1"])
def test_enabled_only_on_true_or_one(monkeypatch, value):
    monkeypatch.setenv(ENV_VAR, value)
    assert is_prod_sampling_enabled() is True


@pytest.mark.parametrize("value", ["false", "0", "yes", "on", "", "   ", "TRUE_ISH"])
def test_disabled_on_anything_else_never_by_accident(monkeypatch, value):
    monkeypatch.setenv(ENV_VAR, value)
    assert is_prod_sampling_enabled() is False


def test_seul_le_juge_lit_le_reglage():
    files = [p for p in APP.rglob("*.py") if p.name != "chat_prod_sampling.py"]
    assert len(files) > 100, "la garde doit lire un vrai corpus, sinon elle est aveugle"
    readers = {
        str(p.relative_to(APP))
        for p in files
        if re.search(r"^from app\.eval\.chat_prod_sampling import", p.read_text(encoding="utf-8"), re.M)
    }
    assert readers == JUDGE_READERS


def test_l_ancienne_fonction_de_versement_a_disparu():
    import app.eval.chat_prod_sampling as module

    assert not hasattr(module, "sample_production_conversation")
