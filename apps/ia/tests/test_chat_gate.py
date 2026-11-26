"""Tests for the dedicated chat eval gate (app/eval/chat_gate.py) — #2899 (#2443.7).

Distinct from ``test_eval_gate.py`` (le gate DOSSIER) : cette suite garde SA
propre surface (des fichiers précis du chat) et SON propre enforcement (les
suites déterministes du chat + la couverture des hard failures), jamais le
banc de qualité des dossiers.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.eval import chat_gate
from app.eval.chat_gate import (
    CHAT_EVAL_SUITES,
    CHAT_PROMPT_SURFACE,
    REPO_ROOT,
    chat_surface_changes,
    check_hard_failure_coverage,
    is_chat_surface_path,
    main,
    run_gate,
)

# ── surface de fichiers ────────────────────────────────────────────────────


@pytest.mark.parametrize("path", CHAT_PROMPT_SURFACE)
def test_chat_surface_paths_exist_in_repo(path: str):
    # Garde-fou anti-pourrissement : un fichier renommé ferait sortir le gate
    # de la surveillance en silence.
    assert (REPO_ROOT / path).exists(), f"CHAT_PROMPT_SURFACE entry missing: {path}"


def test_chat_surface_path_matches_exactly():
    assert is_chat_surface_path("apps/ia/app/services/laura_router.py")
    assert not is_chat_surface_path("apps/ia/app/services/laura_router_v2.py")
    assert not is_chat_surface_path("apps/ia/app/prompts/bellum_facts.py")


def test_chat_surface_changes_filters_and_sorts():
    files = [
        "apps/web/src/x.tsx",
        "apps/ia/app/services/chat_tools.py",
        "apps/ia/app/routers/chat.py",
        "apps/ia/app/services/laura_router.py",
    ]
    assert chat_surface_changes(files) == [
        "apps/ia/app/services/chat_tools.py",
        "apps/ia/app/services/laura_router.py",
    ]


def test_every_suite_file_exists():
    for suite in CHAT_EVAL_SUITES:
        assert (REPO_ROOT / "apps" / "ia" / suite).exists(), f"suite manquante : {suite}"


def test_every_copilote_eval_suite_is_gated():
    """#3335.5/#3336.5/#3337.3/#3338.3/#3339.3 — un ``test_copilote_*_eval.py``
    ajouté au dépôt sans entrer dans ``CHAT_EVAL_SUITES`` continue de bloquer
    le pytest CI complet, mais échappe au gate DÉDIÉ (baseline versionnée,
    rejeu explicite sur diff de la surface chat) que ce module promet d'être
    pour cette famille de suites — la même façon de rater une capacité que
    CLAUDE.md nomme : « du code juste, calculé, testé, que personne n'appelle ».
    Cinq gardes de prompt (#3335, #3336, #3337, #3338, #3339) avaient été
    écrites sans être ajoutées à cette liste."""
    on_disk = {p.name for p in (REPO_ROOT / "apps" / "ia" / "tests").glob("test_copilote_*_eval.py")}
    gated = {Path(suite).name for suite in CHAT_EVAL_SUITES}
    missing = sorted(on_disk - gated)
    assert not missing, f"suites test_copilote_*_eval.py absentes de CHAT_EVAL_SUITES : {missing}"


def test_martin_cold_call_dialogue_is_replayed_by_the_gate():
    """#3443.4 — le dialogue d'appel à froid « Martin » est un cas REJOUÉ en CI
    par ce gate (sans appel de modèle) : son fichier est dans les suites ET sa
    modification déclenche le gate. Le retirer d'un des deux fait rougir ici."""
    assert "tests/test_dialogue_golden_3443.py" in CHAT_EVAL_SUITES
    assert is_chat_surface_path("apps/ia/tests/test_dialogue_golden_3443.py")
    # Hermétique : le golden ne parle à aucun modèle ni au réseau.
    source = (REPO_ROOT / "apps" / "ia" / "tests" / "test_dialogue_golden_3443.py").read_text(encoding="utf-8")
    assert "anthropic" not in source.lower()
    assert "httpx" not in source


# ── skip fast quand la surface chat est inchangée ──────────────────────────


def test_gate_skips_when_no_chat_surface_change(monkeypatch, capsys):
    def _boom():
        raise AssertionError("suites lancées malgré une surface chat inchangée")

    monkeypatch.setattr(chat_gate, "_run_suites", _boom)
    code = run_gate(changed=["apps/web/src/a.tsx", "apps/ia/app/routers/chat.py"])
    assert code == 0
    assert "SKIP" in capsys.readouterr().out


def test_gate_skips_on_empty_diff(monkeypatch):
    monkeypatch.setattr(chat_gate, "_run_suites", lambda: pytest.fail("suites lancées"))
    assert run_gate(changed=[]) == 0


# ── rejoue les suites quand la surface a changé ────────────────────────────


def test_gate_runs_suites_on_surface_change(monkeypatch, capsys):
    monkeypatch.setattr(chat_gate, "_run_suites", lambda: 0)
    monkeypatch.setattr(chat_gate, "check_hard_failure_coverage", lambda **_kw: (True, "ok"))
    code = run_gate(changed=["apps/ia/app/services/laura_router.py"])
    assert code == 0
    out = capsys.readouterr().out
    assert "apps/ia/app/services/laura_router.py" in out


def test_gate_fails_when_a_suite_is_red(monkeypatch):
    monkeypatch.setattr(chat_gate, "_run_suites", lambda: 1)
    assert run_gate(changed=["apps/ia/app/services/laura_router.py"]) == 1


def test_gate_fails_on_coverage_regression_even_if_suites_are_green(monkeypatch):
    monkeypatch.setattr(chat_gate, "_run_suites", lambda: 0)
    monkeypatch.setattr(chat_gate, "check_hard_failure_coverage", lambda **_kw: (False, "régression"))
    assert run_gate(changed=["apps/ia/app/services/laura_router.py"]) == 1


def test_gate_force_runs_without_changes(monkeypatch):
    ran: list[bool] = []
    monkeypatch.setattr(chat_gate, "_run_suites", lambda: ran.append(True) or 0)
    monkeypatch.setattr(chat_gate, "check_hard_failure_coverage", lambda **_kw: (True, "ok"))
    assert run_gate(changed=[], force=True) == 0
    assert ran == [True]


def test_gate_fail_safe_when_git_unavailable(monkeypatch, capsys):
    ran: list[bool] = []
    monkeypatch.setattr(chat_gate, "changed_files_vs", lambda *_a, **_kw: None)
    monkeypatch.setattr(chat_gate, "_run_suites", lambda: ran.append(True) or 0)
    monkeypatch.setattr(chat_gate, "check_hard_failure_coverage", lambda **_kw: (True, "ok"))
    assert run_gate() == 0
    assert ran == [True]
    assert "fail-safe" in capsys.readouterr().out


# ── couverture des hard failures, contre la vraie baseline committée ───────


def test_coverage_is_ok_on_the_committed_baseline():
    ok, message = check_hard_failure_coverage()
    assert ok, message


def test_coverage_regresses_when_a_hard_failure_is_doctored_missing(tmp_path: Path):
    from app.eval.chat_gate import _load_baseline

    baseline = _load_baseline()
    doctored = json.loads(json.dumps(baseline))
    doctored["covered_hard_failures"].append("this_hard_failure_does_not_exist_yet")
    p = tmp_path / "chat_gate_baseline.json"
    p.write_text(json.dumps(doctored), encoding="utf-8")

    ok, message = check_hard_failure_coverage(baseline_path=p)
    assert ok is False
    assert "RÉGRESSION" in message


def test_coverage_stays_ok_when_the_baseline_asks_less_than_what_is_covered(tmp_path: Path):
    from app.eval.chat_gate import _load_baseline

    baseline = _load_baseline()
    doctored = json.loads(json.dumps(baseline))
    doctored["covered_hard_failures"] = doctored["covered_hard_failures"][:1]
    doctored["corpus_scenario_count"] = 0
    p = tmp_path / "chat_gate_baseline.json"
    p.write_text(json.dumps(doctored), encoding="utf-8")

    ok, _message = check_hard_failure_coverage(baseline_path=p)
    assert ok is True


# ── CLI ──────────────────────────────────────────────────────────────────


def test_main_force_flag(monkeypatch):
    monkeypatch.setattr(chat_gate, "_run_suites", lambda: 0)
    monkeypatch.setattr(chat_gate, "check_hard_failure_coverage", lambda **_kw: (True, "ok"))
    assert main(["--force"]) == 0


def test_main_skips_via_injected_diff(monkeypatch):
    monkeypatch.setattr(chat_gate, "changed_files_vs", lambda *_a, **_kw: ["apps/web/src/a.tsx"])
    monkeypatch.setattr(chat_gate, "_run_suites", lambda: pytest.fail("suites lancées"))
    assert main([]) == 0


def test_main_base_ref_is_forwarded(monkeypatch):
    seen: list[str] = []
    monkeypatch.setattr(chat_gate, "changed_files_vs", lambda base_ref, **_kw: seen.append(base_ref) or [])
    assert main(["--base", "origin/staging"]) == 0
    assert seen == ["origin/staging"]


def test_main_update_baseline_writes_the_file(tmp_path: Path, monkeypatch):
    p = tmp_path / "chat_gate_baseline.json"
    p.write_text(json.dumps({"covered_hard_failures": [], "corpus_scenario_count": 0}), encoding="utf-8")
    monkeypatch.setattr(chat_gate, "BASELINE_PATH", p)

    assert main(["--update-baseline"]) == 0

    written = json.loads(p.read_text(encoding="utf-8"))
    assert written["corpus_scenario_count"] > 0
    assert len(written["covered_hard_failures"]) > 0
