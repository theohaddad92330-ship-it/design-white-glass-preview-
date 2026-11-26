"""Les évals appellent l'API comme le code servi : jamais ``temperature`` en dur.

Mesuré le 31/10/2026 : ``evals/promptfoo/provider.py`` passait ``temperature=0`` à
``messages.create`` pour ``claude-sonnet-5``. L'API rend alors
``400 'temperature' is deprecated for this model`` (voir test_llm_determinism.py) :
35/35 cas de promptfoo en erreur, ``CI Status`` rouge sur toutes les PR qui touchent
Laura. Le code servi, lui, passe par ``claude_service._sampling_kwargs`` (#4417).
"""

from __future__ import annotations

import ast
from pathlib import Path

EVALS = Path(__file__).resolve().parents[1] / "evals"


def _hardcoded_temperature_calls(source: str) -> list[int]:
    lines: list[int] = []
    for node in ast.walk(ast.parse(source)):
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == "create"
            and any(kw.arg == "temperature" for kw in node.keywords)
        ):
            lines.append(node.lineno)
    return lines


def test_detector_says_no_on_a_hardcoded_temperature() -> None:
    assert _hardcoded_temperature_calls("c.messages.create(model=m, temperature=0)") == [1]
    assert _hardcoded_temperature_calls("c.messages.create(model=m, **_sampling(m))") == []


def test_no_eval_passes_temperature_directly() -> None:
    files = sorted(EVALS.rglob("*.py"))
    assert files, f"aucun fichier lu sous {EVALS}"
    offenders = {
        str(f.relative_to(EVALS)): hits
        for f in files
        if (hits := _hardcoded_temperature_calls(f.read_text(encoding="utf-8")))
    }
    assert offenders == {}, f"temperature en dur (400 sur Sonnet 5) : {offenders}"
