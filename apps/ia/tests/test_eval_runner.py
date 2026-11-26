"""Tests for the IA v2 eval runner CLI (app/eval/run.py).

Hermetic: bundled fixtures + a tmp dossier only. Never uses ``--live`` (that
path imports/invokes the real engine and needs API keys).
"""

from __future__ import annotations

import json
from pathlib import Path

from app.eval.golden import FIXTURES_DIR, list_goldens, load_golden
from app.eval.run import main, run

_SG = str(FIXTURES_DIR / "societe-generale.analysis.json")
_BAD = str(FIXTURES_DIR / "hallucinated.analysis.json")


def test_run_all_goldens_passes():
    # Every bundled golden fixture is a good dossier → exit 0.
    assert run() == 0


def test_run_single_golden():
    assert run(company="doctolib") == 0


def test_run_bad_source_fails():
    assert run(source=_BAD) == 1


def test_run_good_source_passes():
    assert run(source=_SG) == 0


def test_run_require_subset_gates_only_named_metrics(tmp_path: Path):
    # A dossier that is fully sourced + coherent + complete but has NO contacts:
    # only contacts_quality fails.
    dossier = {
        "company": "Partial Test SA",
        "research": {
            "sector": "Conseil",
            "siren": "552120222",
            "businessDescription": "Test.",
            "sources": {"tags": {"siren": "PUBLIC", "sector": "PUBLIC"}, "citations": {}},
        },
        "plan": {"actionPlan": {"phases": []}},
        "contacts": [],
    }
    path = tmp_path / "partial.json"
    path.write_text(json.dumps(dossier), encoding="utf-8")

    # Requiring only the passing metrics → exit 0 …
    assert run(source=str(path), require=["faithfulness", "coherence"]) == 0
    # … but the failing metric flips exit when required (default = all).
    assert run(source=str(path)) == 1
    assert run(source=str(path), require=["contacts_quality"]) == 1


def test_run_json_output_is_parseable(capsys):
    code = run(as_json=True)
    out = capsys.readouterr().out
    payload = json.loads(out)
    assert isinstance(payload, list) and payload
    first = payload[0]
    assert {"company", "aggregate", "passed", "metrics", "golden"} <= set(first)
    assert code == 0


def test_main_argv_parsing():
    # --company + --require wired through argparse to run().
    assert main(["--company", "societe-generale", "--require", "faithfulness"]) == 0
    assert main(["--source", _BAD]) == 1


def test_goldens_are_loadable_and_have_expectations():
    goldens = list_goldens()
    slugs = {g.slug for g in goldens}
    assert {"doctolib", "societe-generale"} <= slugs
    sg = load_golden("societe-generale")
    assert sg.expect["siren"] == "552120222"
    assert sg.expect["isPublic"] is True


# ── baseline regression check ─────────────────────────────────────────────────


def test_committed_baseline_matches_current_scores():
    # The committed baseline must always agree with the committed fixtures —
    # `python -m app.eval.run --check-baseline` green in this repo state.
    assert run(check_baseline=True) == 0


def test_check_baseline_flags_a_score_drop(tmp_path: Path):
    # Doctor a baseline that promises MORE than the fixtures deliver → the
    # check must flag the (simulated) regression and exit 1.
    from app.eval.run import load_baseline

    baseline = load_baseline()
    assert baseline is not None
    doctored = json.loads(json.dumps(baseline))
    doctored["goldens"]["doctolib"]["aggregate"] = 0.999
    p = tmp_path / "baseline.json"
    p.write_text(json.dumps(doctored), encoding="utf-8")
    assert run(check_baseline=True, baseline_path=p) == 1


def test_check_baseline_flags_a_metric_drop(tmp_path: Path):
    from app.eval.run import load_baseline

    baseline = load_baseline()
    doctored = json.loads(json.dumps(baseline))
    doctored["goldens"]["societe-generale"]["metrics"]["plays_grounding"] = 0.99
    p = tmp_path / "baseline.json"
    p.write_text(json.dumps(doctored), encoding="utf-8")
    assert run(check_baseline=True, baseline_path=p) == 1


def test_check_baseline_flags_missing_golden(tmp_path: Path):
    from app.eval.run import load_baseline

    baseline = load_baseline()
    doctored = json.loads(json.dumps(baseline))
    doctored["goldens"]["ghost-company"] = {"aggregate": 0.9, "passed": True, "metrics": {}}
    p = tmp_path / "baseline.json"
    p.write_text(json.dumps(doctored), encoding="utf-8")
    assert run(check_baseline=True, baseline_path=p) == 1


def test_check_baseline_without_baseline_fails(tmp_path: Path):
    assert run(check_baseline=True, baseline_path=tmp_path / "absent.json") == 1


def test_update_baseline_writes_current_scores(tmp_path: Path):
    p = tmp_path / "baseline.json"
    assert run(update_baseline=True, baseline_path=p) == 0
    written = json.loads(p.read_text(encoding="utf-8"))
    assert {"doctolib", "societe-generale"} <= set(written["goldens"])
    assert written["counterexample"]["hallucinated"]["passed"] is False
    for entry in written["goldens"].values():
        assert entry["passed"] is True
        assert set(entry["metrics"]) >= {"faithfulness", "no_invented_data", "plays_grounding"}
    # A freshly written baseline is by definition regression-free.
    assert run(check_baseline=True, baseline_path=p) == 0


def test_counterexample_guard_is_part_of_the_bench(capsys):
    # The default bench run must score the bundled bad dossier and report the
    # guard — a detector suite that passes it would flip the exit code.
    assert run() == 0
    out = capsys.readouterr().out
    assert "hallucinated (bad)" in out
    assert "contre-exemple échoue comme attendu" in out


def test_json_bench_includes_counterexample(capsys):
    code = run(as_json=True)
    payload = json.loads(capsys.readouterr().out)
    assert code == 0
    counters = [e for e in payload if e.get("counterexample")]
    assert len(counters) == 1
    assert counters[0]["passed"] is False
