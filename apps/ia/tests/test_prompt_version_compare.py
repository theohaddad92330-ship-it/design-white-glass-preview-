"""Tests de `app/eval/bench/prompt_version_compare.py` — #2445.7 (#2766).

Hermétique : des `CallRecord` construits à la main, aucun appel modèle.
"""

from __future__ import annotations

import pytest

from app.eval.bench.corpus import STATUS_OK, CallRecord
from app.eval.bench.prompt_version_compare import compare_prompt_versions, label_for_prompt_version


def _record(record_id: str, *, prompt_name: str = "advisor", cost_usd: float = 0.01) -> CallRecord:
    return CallRecord(
        record_id=record_id,
        corpus="fixture",
        case="cas-1",
        prompt_name=prompt_name,
        task="chat",
        system="system prompt",
        user="user prompt",
        response_model="",
        max_tokens=1024,
        max_retries=0,
        model_requested="claude",
        status=STATUS_OK,
        cost_usd=cost_usd,
        latency_s=1.2,
    )


def test_label_derives_from_the_registry_when_no_version_is_given():
    label = label_for_prompt_version("advisor")
    assert label.startswith("advisor@")
    assert label != "advisor@inconnue"


def test_label_falls_back_to_inconnue_for_an_unregistered_prompt():
    assert label_for_prompt_version("ce-prompt-n-existe-pas") == "ce-prompt-n-existe-pas@inconnue"


def test_label_uses_an_explicit_version_when_given():
    assert label_for_prompt_version("advisor", "abc123") == "advisor@abc123"


def test_compare_prompt_versions_pairs_records_by_id_across_the_two_versions():
    before = [_record("r1", cost_usd=0.02), _record("r2", cost_usd=0.02)]
    after = [_record("r1", cost_usd=0.01), _record("r2", cost_usd=0.01)]

    comparison = compare_prompt_versions(
        before, after, prompt_name="advisor", version_before="v1", version_after="v2"
    )

    assert comparison.arms == ["advisor@v1", "advisor@v2"]
    assert comparison.record_ids == ["r1", "r2"]
    before_col, after_col = comparison.columns
    assert before_col.cost_usd_mean == pytest.approx(0.02)
    assert after_col.cost_usd_mean == pytest.approx(0.01)


def test_compare_prompt_versions_never_mutates_the_original_records():
    before = [_record("r1")]
    after = [_record("r1")]
    compare_prompt_versions(before, after, prompt_name="advisor", version_before="v1", version_after="v2")
    assert before[0].arm != "advisor@v1" or before[0] is not after[0]  # original objects untouched
    assert before[0].record_id == "r1"


def test_comparing_a_version_against_itself_is_refused():
    before = [_record("r1")]
    after = [_record("r1")]
    with pytest.raises(ValueError, match="MÊME version"):
        compare_prompt_versions(before, after, prompt_name="advisor", version_before="v1", version_after="v1")


def test_unpaired_records_are_excluded_with_a_note():
    before = [_record("r1"), _record("only-before")]
    after = [_record("r1"), _record("only-after")]
    comparison = compare_prompt_versions(
        before, after, prompt_name="advisor", version_before="v1", version_after="v2"
    )
    assert comparison.record_ids == ["r1"]
    assert any("exclus de l'appariement" in note for note in comparison.notes)
