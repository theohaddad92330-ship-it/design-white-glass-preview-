"""Golden set for the Claude prompts (Théo restitution p.15).

Pins every registered prompt against a committed baseline under
``tests/golden/system/<name>.txt``. Any change to a prompt (or its input
injection) fails here as a reviewable diff — no prompt drifts into prod silently.

Two families are covered:

* ``SYSTEM_PROMPTS`` — the uniform ``build_system_prompt(profile)`` builders,
  rendered with the canonical ``SAMPLE_PROFILE``.
* ``EXTRA_PROMPTS`` — the non-uniform prompts (advisor/chat, profiler, outreach,
  vocabulary, the split Phase-4 plan builders), rendered with their canonical,
  value-free inputs (the prompt skeleton).

Regenerate after an INTENTIONAL prompt edit:

    UPDATE_PROMPT_GOLDEN=1 pytest tests/test_prompt_golden.py -q

then review the diff and commit the updated .txt files alongside the change.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from app.prompts.registry import EXTRA_PROMPTS, SYSTEM_PROMPTS, registry_names
from tests.test_prompts_new import SAMPLE_PROFILE

_GOLDEN_DIR = Path(__file__).parent / "golden" / "system"
_UPDATE = os.getenv("UPDATE_PROMPT_GOLDEN") == "1"


def _golden_path(name: str) -> Path:
    return _GOLDEN_DIR / f"{name}.txt"


def _assert_matches_golden(name: str, phase: str, rendered: str) -> None:
    path = _golden_path(name)

    if _UPDATE:
        _GOLDEN_DIR.mkdir(parents=True, exist_ok=True)
        path.write_text(rendered, encoding="utf-8")
        return

    assert path.exists(), (
        f"Missing golden file for prompt '{name}'. "
        f"Run `UPDATE_PROMPT_GOLDEN=1 pytest {Path(__file__).name}` to create it."
    )
    expected = path.read_text(encoding="utf-8")
    assert rendered == expected, (
        f"Prompt '{name}' ({phase}) changed vs its golden baseline. "
        f"If intentional, regenerate with `UPDATE_PROMPT_GOLDEN=1 pytest {Path(__file__).name}` "
        f"and commit the updated golden file with your change."
    )


@pytest.mark.parametrize("spec", SYSTEM_PROMPTS, ids=[s.name for s in SYSTEM_PROMPTS])
def test_system_prompt_matches_golden(spec):
    _assert_matches_golden(spec.name, spec.phase, spec.build(SAMPLE_PROFILE))


@pytest.mark.parametrize("spec", EXTRA_PROMPTS, ids=[s.name for s in EXTRA_PROMPTS])
def test_extra_prompt_matches_golden(spec):
    """Non-uniform prompts (advisor/profiler/outreach/vocabulary/Phase-4 plan) —
    pinned via their canonical, value-free render (the skeleton)."""
    _assert_matches_golden(spec.name, spec.phase, spec.render())


def test_every_golden_file_has_a_registry_entry():
    """No orphan golden files — a deleted/renamed prompt must drop its baseline."""
    if not _GOLDEN_DIR.exists():
        pytest.skip("golden dir not generated yet")
    on_disk = {p.stem for p in _GOLDEN_DIR.glob("*.txt")}
    registered = set(registry_names())
    orphans = on_disk - registered
    assert not orphans, f"Orphan golden files (no registry entry): {sorted(orphans)}"


def test_every_registered_prompt_has_a_golden_file():
    """Every registered prompt (uniform + non-uniform) must be pinned."""
    if _UPDATE:
        pytest.skip("regenerating goldens")
    missing = [name for name in registry_names() if not _golden_path(name).exists()]
    assert not missing, (
        f"Registered prompts with no golden baseline: {missing}. "
        f"Run `UPDATE_PROMPT_GOLDEN=1 pytest {Path(__file__).name}` to create them."
    )
