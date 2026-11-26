"""Tests for the eval CI gate (app/eval/gate.py) — golden set en gate avant merge.

The gate re-plays the hermetic eval bench (committed fixtures, deterministic
metrics, zero network) against the committed baseline, but ONLY when the prompt
surface changed vs the base branch — otherwise it skips fast.

Hermetic: the changed-file list is injected (never a real ``git diff``), and the
bench itself only reads bundled fixtures.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.eval import gate
from app.eval.gate import (
    PROMPT_SURFACE,
    REPO_ROOT,
    is_prompt_path,
    main,
    prompt_changes,
    run_gate,
)

# ── prompt-surface classification ─────────────────────────────────────────────


@pytest.mark.parametrize(
    "path",
    [
        "apps/ia/app/prompts/bellum_facts.py",
        "apps/ia/app/prompts/registry.py",
        "apps/ia/app/prompts/fencing.py",
        "apps/ia/app/services/domain_focus.py",
        "apps/ia/app/eval/metrics.py",
        "apps/ia/app/eval/baseline.json",
        "apps/ia/app/eval/fixtures/societe-generale.analysis.json",
        "apps/ia/app/eval/golden/doctolib.json",
    ],
)
def test_prompt_surface_paths_match(path: str):
    assert is_prompt_path(path)


@pytest.mark.parametrize(
    "path",
    [
        "apps/ia/app/routers/chat.py",
        "apps/ia/app/services/entities.py",
        "apps/ia/app/graph/builder.py",
        "apps/ia/tests/test_prompt_golden.py",
        "apps/web/src/features/chat/view/Chat.tsx",
        "apps/api/src/main.ts",
        "CLAUDE.md",
        # substring traps — must NOT match on containment, only on path prefix
        "apps/ia/app/prompts_v2/other.py",
        "docs/apps/ia/app/prompts/copy.py",
    ],
)
def test_non_prompt_paths_do_not_match(path: str):
    assert not is_prompt_path(path)


def test_prompt_changes_filters_and_sorts():
    files = [
        "apps/web/src/x.tsx",
        "apps/ia/app/prompts/bellum_plan.py",
        "apps/ia/app/routers/chat.py",
        "apps/ia/app/eval/baseline.json",
    ]
    assert prompt_changes(files) == [
        "apps/ia/app/eval/baseline.json",
        "apps/ia/app/prompts/bellum_plan.py",
    ]


def test_prompt_surface_paths_exist_in_repo():
    # Guard against surface rot: if a watched file/dir is renamed, the gate
    # would silently stop watching it — this test forces the rename to update
    # PROMPT_SURFACE in the same PR.
    for entry in PROMPT_SURFACE:
        assert (REPO_ROOT / entry).exists(), f"PROMPT_SURFACE entry missing: {entry}"


# ── skip fast when prompts are unchanged ──────────────────────────────────────


def test_gate_skips_when_no_prompt_change(monkeypatch, capsys):
    def _boom(**_kw):  # the bench must NOT run on skip
        raise AssertionError("bench ran despite no prompt change")

    monkeypatch.setattr(gate, "_run_bench", _boom)
    code = run_gate(changed=["apps/web/src/a.tsx", "apps/ia/app/routers/chat.py"])
    assert code == 0
    assert "SKIP" in capsys.readouterr().out


def test_gate_skips_on_empty_diff(monkeypatch):
    monkeypatch.setattr(gate, "_run_bench", lambda **_kw: pytest.fail("bench ran"))
    assert run_gate(changed=[]) == 0


# ── run the bench when the prompt surface changed ─────────────────────────────


def test_gate_runs_bench_on_prompt_change(monkeypatch, capsys):
    calls: list[dict] = []
    monkeypatch.setattr(gate, "_run_bench", lambda **kw: calls.append(kw) or 0)
    code = run_gate(changed=["apps/ia/app/prompts/bellum_facts.py"])
    assert code == 0
    assert len(calls) == 1
    assert "apps/ia/app/prompts/bellum_facts.py" in capsys.readouterr().out


def test_gate_propagates_bench_failure(monkeypatch):
    monkeypatch.setattr(gate, "_run_bench", lambda **_kw: 1)
    assert run_gate(changed=["apps/ia/app/prompts/bellum_facts.py"]) == 1


def test_gate_force_runs_without_changes(monkeypatch):
    ran: list[bool] = []
    monkeypatch.setattr(gate, "_run_bench", lambda **_kw: ran.append(True) or 0)
    assert run_gate(changed=[], force=True) == 0
    assert ran == [True]


def test_gate_fail_safe_when_git_unavailable(monkeypatch, capsys):
    # git missing/broken → we cannot prove prompts are unchanged → run the
    # bench anyway (it is hermetic and cheap). Fail-safe, never fail-open.
    ran: list[bool] = []
    monkeypatch.setattr(gate, "changed_files_vs", lambda *_a, **_kw: None)
    monkeypatch.setattr(gate, "_run_bench", lambda **_kw: ran.append(True) or 0)
    assert run_gate() == 0
    assert ran == [True]
    assert "fail-safe" in capsys.readouterr().out


# ── end-to-end against the real bench (still hermetic: fixtures only) ─────────


def test_gate_green_on_committed_state():
    # Prompt change + committed fixtures/baseline in sync → pass.
    assert run_gate(changed=["apps/ia/app/prompts/bellum_facts.py"]) == 0


def test_gate_fails_on_simulated_regression(tmp_path: Path):
    # Doctor a baseline that promises MORE than the fixtures deliver — as if a
    # prompt/metric change had degraded the scores → the gate must exit 1.
    from app.eval.run import load_baseline

    baseline = load_baseline()
    assert baseline is not None
    doctored = json.loads(json.dumps(baseline))
    doctored["goldens"]["societe-generale"]["metrics"]["faithfulness"] = 1.5
    p = tmp_path / "baseline.json"
    p.write_text(json.dumps(doctored), encoding="utf-8")
    assert run_gate(changed=["apps/ia/app/prompts/bellum_facts.py"], baseline_path=p) == 1


# ── CLI ───────────────────────────────────────────────────────────────────────


def test_main_force_flag(monkeypatch):
    monkeypatch.setattr(gate, "_run_bench", lambda **_kw: 0)
    assert main(["--force"]) == 0


def test_main_skips_via_injected_diff(monkeypatch):
    monkeypatch.setattr(gate, "changed_files_vs", lambda *_a, **_kw: ["apps/web/src/a.tsx"])
    monkeypatch.setattr(gate, "_run_bench", lambda **_kw: pytest.fail("bench ran"))
    assert main([]) == 0


def test_main_base_ref_is_forwarded(monkeypatch):
    seen: list[str] = []
    monkeypatch.setattr(gate, "changed_files_vs", lambda base_ref, **_kw: seen.append(base_ref) or [])
    assert main(["--base", "origin/staging"]) == 0
    assert seen == ["origin/staging"]


# ── real git plumbing (read-only, uses this repo) ─────────────────────────────


def test_changed_files_vs_returns_none_on_bad_ref():
    assert gate.changed_files_vs("no-such-ref-xyz") is None


def test_changed_files_vs_head_is_a_list():
    # Diff vs HEAD itself: committed delta is empty; only local working-tree
    # noise (if any) remains. Must be a list, never None.
    files = gate.changed_files_vs("HEAD")
    assert isinstance(files, list)


# ── LOT C-5b (#1925.14) — CE QUE LA GATE COUVRE VRAIMENT ─────────────────────
#
# La gate ne rejouait que DEUX comptes (Doctolib, Société Générale) : deux
# dossiers, deux secteurs, et rien qui ressemble à un grand compte industriel ou
# public. Trois s'y ajoutent, et chacun ne porte que des faits VÉRIFIABLES DANS
# CE DÉPÔT (leur `_source` le dit, fichier par fichier) : inventer un chiffre
# pour remplir le gardien des chiffres inventés serait la faute exacte qu'il
# cherche.

_NAMED_ACCOUNTS = {"doctolib", "societe-generale", "thales", "sncf", "decathlon"}


def test_the_gate_replays_the_five_named_accounts():
    from app.eval.golden import list_goldens

    assert {g.slug for g in list_goldens()} >= _NAMED_ACCOUNTS


def test_every_named_account_is_pinned_by_the_committed_baseline():
    """Un golden que la baseline ne connaît pas n'est comparé à RIEN : il
    apparaît « ✓ » dans le rapport sans avoir été gardé une seule fois. Le
    compte n'est gaté que quand la baseline le nomme."""
    from app.eval.run import load_baseline

    baseline = load_baseline()
    assert baseline is not None
    assert set(baseline["goldens"]) >= _NAMED_ACCOUNTS


def test_a_golden_absent_from_the_baseline_is_reported_as_a_regression():
    """La garde du trou ci-dessus, côté code : `compare_to_baseline` ne bouclait
    que sur la BASELINE, donc un golden ajouté sans son entrée passait en
    silence — un compte « gaté » que rien ne gardait."""
    from app.eval.run import compare_to_baseline, load_baseline

    baseline = load_baseline()
    assert baseline is not None
    amputated = json.loads(json.dumps(baseline))
    amputated["goldens"].pop("thales")

    reports = _golden_reports()
    problems = compare_to_baseline(reports, amputated)
    assert any("thales" in p for p in problems), problems


def test_a_golden_the_baseline_knows_is_not_reported_as_new():
    """Le témoin du cas voisin LÉGITIME : la baseline committée décrit le run
    committé — aucun problème, ni « absent du run », ni « absent de la
    baseline »."""
    from app.eval.run import compare_to_baseline, load_baseline

    baseline = load_baseline()
    assert baseline is not None
    assert compare_to_baseline(_golden_reports(), baseline) == []


def _golden_reports() -> dict:
    from app.eval.golden import list_goldens, resolve_analysis
    from app.eval.metrics import evaluate

    return {g.slug: evaluate(resolve_analysis(g), g.as_expectations()) for g in list_goldens()}
