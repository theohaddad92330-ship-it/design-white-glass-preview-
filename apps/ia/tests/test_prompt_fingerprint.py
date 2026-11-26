"""Per-run prompt fingerprint (Théo restitution p.15 — prompt registry versionné).

A dossier must be reproducible: we stamp WHICH prompt versions produced a run.
These tests pin the contract of ``prompt_registry_fingerprint`` /
``prompt_registry_canonical_fingerprint`` / ``prompt_registry_version`` /
``prompt_version_for`` — the content hashes written into
``raw_analysis._api_metrics.prompt_versions`` for every analysis, exposed in the
chat reply (advisor) and the profiler agent meta.

The committed baseline ``tests/golden/prompt_fingerprint.json`` is the anti-drift
guard at the hash level: it fails if any registered prompt's canonical content
changes without a baseline update (regenerate with UPDATE_PROMPT_GOLDEN=1).
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

from app.prompts.registry import (
    EXTRA_PROMPTS,
    SYSTEM_PROMPTS,
    prompt_registry_canonical_fingerprint,
    prompt_registry_fingerprint,
    prompt_registry_version,
    prompt_version_for,
    registry_names,
)
from tests.test_prompts_new import SAMPLE_PROFILE

_HEX12 = re.compile(r"^[0-9a-f]{12}$")

_BASELINE_PATH = Path(__file__).parent / "golden" / "prompt_fingerprint.json"
_UPDATE = os.getenv("UPDATE_PROMPT_GOLDEN") == "1"

# The prompts this registry-coverage work newly versioned (advisor/chat, the
# onboarding profiler, on-demand outreach, the account-vocabulary builder and the
# split Phase-4 plan builders). Guards that they stay covered.
_NEWLY_COVERED = {
    "weekly",
    "advisor",
    "profiler",
    "outreach",
    "vocabulary",
    "plan_action_plan_meta",
    "plan_action_plan_phase",
    "plan_subsection",
}


def test_fingerprint_has_one_entry_per_registered_prompt():
    fp = prompt_registry_fingerprint(SAMPLE_PROFILE)
    assert set(fp.keys()) == set(registry_names())
    assert len(fp) == len(SYSTEM_PROMPTS) + len(EXTRA_PROMPTS)


def test_fingerprint_covers_advisor_profiler_and_phases():
    """The newly-covered prompts (advisor/profiler/phase2-4 splits) are stamped."""
    names = set(registry_names())
    assert names >= _NEWLY_COVERED, f"missing from registry: {_NEWLY_COVERED - names}"
    fp = prompt_registry_fingerprint(SAMPLE_PROFILE)
    assert set(fp.keys()) >= _NEWLY_COVERED


def test_fingerprint_values_are_short_hex_hashes():
    fp = prompt_registry_fingerprint(SAMPLE_PROFILE)
    for name, digest in fp.items():
        assert _HEX12.match(digest), f"{name} -> {digest!r} is not a 12-hex hash"


def test_fingerprint_is_deterministic():
    """Same profile in → byte-identical hashes out (reproducibility)."""
    first = prompt_registry_fingerprint(SAMPLE_PROFILE)
    second = prompt_registry_fingerprint(dict(SAMPLE_PROFILE))
    assert first == second


def test_extra_prompt_hashes_ignore_run_profile():
    """Non-uniform prompts are versioned by their canonical skeleton, so a run
    profile never shifts their hash (only the template can)."""
    with_profile = prompt_registry_fingerprint(SAMPLE_PROFILE)
    empty = prompt_registry_fingerprint()
    for spec in EXTRA_PROMPTS:
        assert with_profile[spec.name] == empty[spec.name]


def test_fingerprint_defaults_to_empty_profile():
    """Callable with no profile (used by the version stamp) and still complete."""
    fp = prompt_registry_fingerprint()
    assert set(fp.keys()) == set(registry_names())
    assert prompt_registry_fingerprint() == prompt_registry_fingerprint(None)


def test_fingerprint_tracks_prompt_content_changes():
    """Editing a uniform prompt's rendered content changes only that prompt's hash."""
    baseline = prompt_registry_fingerprint(SAMPLE_PROFILE)

    spec = SYSTEM_PROMPTS[0]
    original_build = spec.build
    try:
        spec.build = lambda profile: original_build(profile) + "\n<!-- edited -->"
        mutated = prompt_registry_fingerprint(SAMPLE_PROFILE)
    finally:
        spec.build = original_build

    # The edited prompt's hash moved…
    assert mutated[spec.name] != baseline[spec.name]
    # …and every other prompt is untouched.
    for name in registry_names():
        if name != spec.name:
            assert mutated[name] == baseline[name]


def test_fingerprint_tracks_extra_prompt_changes():
    """Editing a non-uniform prompt's render changes only that prompt's hash."""
    baseline = prompt_registry_fingerprint(SAMPLE_PROFILE)

    spec = EXTRA_PROMPTS[0]
    original_render = spec.render
    try:
        spec.render = lambda: original_render() + "\n<!-- edited -->"
        mutated = prompt_registry_fingerprint(SAMPLE_PROFILE)
    finally:
        spec.render = original_render

    assert mutated[spec.name] != baseline[spec.name]
    for name in registry_names():
        if name != spec.name:
            assert mutated[name] == baseline[name]


# ── Canonical fingerprint + single-prompt version ────────────────────────────


def test_canonical_fingerprint_is_deterministic_and_complete():
    first = prompt_registry_canonical_fingerprint()
    second = prompt_registry_canonical_fingerprint()
    assert first == second
    assert set(first.keys()) == set(registry_names())
    for name, digest in first.items():
        assert _HEX12.match(digest), f"{name} -> {digest!r} is not a 12-hex hash"


def test_prompt_version_for_matches_canonical_fingerprint():
    cfp = prompt_registry_canonical_fingerprint()
    for name in ("advisor", "profiler", "plan_action_plan_phase"):
        assert prompt_version_for(name) == cfp[name]
    assert prompt_version_for("does-not-exist") is None


# ── Version stamp ────────────────────────────────────────────────────────────


def test_registry_version_is_non_empty_hex():
    version = prompt_registry_version()
    assert isinstance(version, str)
    assert _HEX12.match(version), f"{version!r} is not a 12-hex version stamp"


def test_registry_version_is_deterministic():
    assert prompt_registry_version() == prompt_registry_version()


def test_registry_version_ignores_run_profile():
    """A version identifies the template set, not the injected data."""
    assert prompt_registry_version(SAMPLE_PROFILE) == prompt_registry_version()


def test_registry_version_changes_when_a_prompt_changes():
    baseline = prompt_registry_version()

    spec = SYSTEM_PROMPTS[0]
    original_build = spec.build
    try:
        spec.build = lambda profile: original_build(profile) + "\nDRIFT"
        mutated = prompt_registry_version()
    finally:
        spec.build = original_build

    assert mutated != baseline


# ── Committed hash baseline (anti-drift guard) ───────────────────────────────


def test_canonical_fingerprint_matches_committed_baseline():
    """Fails if any registered prompt's canonical content changes without a
    baseline update — the compact, hash-level companion to the .txt goldens."""
    current = prompt_registry_canonical_fingerprint()

    if _UPDATE:
        _BASELINE_PATH.parent.mkdir(parents=True, exist_ok=True)
        _BASELINE_PATH.write_text(
            json.dumps(current, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        return

    assert _BASELINE_PATH.exists(), (
        "Missing prompt fingerprint baseline. "
        "Run `UPDATE_PROMPT_GOLDEN=1 pytest tests/test_prompt_fingerprint.py` to create it."
    )
    expected = json.loads(_BASELINE_PATH.read_text(encoding="utf-8"))
    assert current == expected, (
        "Prompt fingerprint drifted vs its committed baseline. If intentional, "
        "regenerate with `UPDATE_PROMPT_GOLDEN=1 pytest tests/test_prompt_fingerprint.py` "
        "and commit tests/golden/prompt_fingerprint.json with your change."
    )
