"""#15 : budget global de contexte — plafonne la somme des blocs, sacrifie le
moins prioritaire d'abord."""

from __future__ import annotations

from app.prompts.context_budget import fit_to_budget


def test_all_fit_untouched():
    out = fit_to_budget([("a", "xxx"), ("b", "yy")], 100)
    assert out == {"a": "xxx", "b": "yy"}


def test_lowest_priority_trimmed_first():
    out = fit_to_budget([("kb", "k" * 5), ("plan", "p" * 5), ("contacts", "c" * 5)], 12)
    # kb (5) + plan (5) intacts, contacts rogné à 2 (12 - 10)
    assert out["kb"] == "k" * 5
    assert out["plan"] == "p" * 5
    assert out["contacts"] == "c" * 2


def test_highest_priority_survives_when_over_budget():
    out = fit_to_budget([("kb", "k" * 20), ("plan", "p" * 20)], 10)
    assert out["kb"] == "k" * 10  # le prioritaire prend tout le budget
    assert out["plan"] == ""  # le reste tombe à vide


def test_zero_budget_drops_all():
    out = fit_to_budget([("a", "xx"), ("b", "yy")], 0)
    assert out == {"a": "", "b": ""}


def test_advisor_prompt_enforces_global_budget(monkeypatch):
    from app.prompts import bellum_advisor
    from app.prompts.bellum_advisor import build_system_prompt

    monkeypatch.setattr(bellum_advisor, "_CONTEXT_TOTAL_MAX", 3000)
    # contacts + plan + kb chacun < leur cap mais somme > 3000 → total borné.
    # Marqueurs distinctifs (le template contient des C/P/K parasites).
    sys = build_system_prompt({}, {}, "Zc" * 2000, "Yp" * 2000, "Xk" * 1000)
    assert sys.count("Xk") == 1000  # kb (2000 chars) prioritaire, gardé entier
    assert "Zc" not in sys  # contacts sacrifiés en premier → 0
    # plan prend le budget restant (~1000 chars) : présent mais tronqué
    assert 0 < sys.count("Yp") < 2000
