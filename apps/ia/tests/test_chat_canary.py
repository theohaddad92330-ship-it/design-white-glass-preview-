"""Tests de `app/eval/chat_canary.py` — #2443.9, cohorte canary bornée."""

from __future__ import annotations

from app.eval.chat_canary import ENV_VAR, canary_workspace_ids, is_workspace_in_canary_cohort


def test_empty_by_default_when_the_variable_is_absent(monkeypatch):
    monkeypatch.delenv(ENV_VAR, raising=False)
    assert canary_workspace_ids() == frozenset()
    assert is_workspace_in_canary_cohort("n-importe-quel-espace") is False


def test_no_workspace_is_ever_in_cohort_by_accident_on_empty_string(monkeypatch):
    monkeypatch.setenv(ENV_VAR, "")
    assert is_workspace_in_canary_cohort("ws-1") is False


def test_a_listed_workspace_is_in_the_cohort(monkeypatch):
    monkeypatch.setenv(ENV_VAR, "ws-1,ws-2")
    assert is_workspace_in_canary_cohort("ws-1") is True
    assert is_workspace_in_canary_cohort("ws-2") is True
    assert is_workspace_in_canary_cohort("ws-3") is False


def test_comparison_is_space_and_case_insensitive():
    from app.eval import chat_canary

    ids = chat_canary._normalise  # noqa: SLF001 — la fonction interne EST ce qui est testé
    assert ids("  WS-1  ") == ids("ws-1")


def test_newline_separated_list_is_also_accepted(monkeypatch):
    monkeypatch.setenv(ENV_VAR, "ws-1\nws-2\n  ws-3  ")
    assert canary_workspace_ids() == frozenset({"ws-1", "ws-2", "ws-3"})


def test_an_empty_workspace_id_is_never_in_cohort(monkeypatch):
    monkeypatch.setenv(ENV_VAR, "ws-1")
    assert is_workspace_in_canary_cohort("") is False


def test_whitespace_only_env_means_empty_cohort(monkeypatch):
    monkeypatch.setenv(ENV_VAR, "   ")
    assert canary_workspace_ids() == frozenset()
