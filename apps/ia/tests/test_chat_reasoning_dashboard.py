"""Tests de app/eval/chat_reasoning_dashboard.py + tests/chat_reasoning_dashboard_report.py
— le tableau de pilotage du raisonnement commercial (#3198, épopée #3223).

Même séparation que `chat_dashboard.py`/`chat_dashboard_report.py` (#2443.11) :
`app/eval/chat_reasoning_dashboard.py` reste pur, `tests/chat_reasoning_dashboard_report.py`
porte le CLI. Ce rapport-ci ne lit aucun `CORPUS` — `render_markdown` ne prend
aucun argument, il n'y a donc pas de pont `app/` ↔ `tests/` à vérifier.
"""

from __future__ import annotations

from app.eval.chat_reasoning_dashboard import (
    ALERTS_NOT_YET_MEASURED,
    COMPUTED_ON_REAL_TRAFFIC,
    DASHBOARD_METRICS_NOT_YET_MEASURED,
    render_markdown,
)
from tests.chat_reasoning_dashboard_report import main as report_main


def test_names_all_twelve_dashboard_metrics_of_3198():
    metrics = {
        "source route utilisée",
        "taux de réponses public-only",
        "taux d'usage Market Memory",
        "taux de contre-conseil",
        "taux d'alternatives",
        "taux de corrections utilisateur",
        "taux de rerun après correction",
        "taux de recommandations génériques",
        "outils ignorés malgré disponibilité",
        "tours interrompus par budget",
        "comptes les plus contestés",
        "secteurs les moins fiables",
    }
    assert set(DASHBOARD_METRICS_NOT_YET_MEASURED) | (set(COMPUTED_ON_REAL_TRAFFIC) & metrics) == metrics
    # Jamais une mesure à la fois « calculée » et « non mesurée » (deux vérités).
    assert not set(DASHBOARD_METRICS_NOT_YET_MEASURED) & set(COMPUTED_ON_REAL_TRAFFIC)
    assert len(set(DASHBOARD_METRICS_NOT_YET_MEASURED) | (set(COMPUTED_ON_REAL_TRAFFIC) & metrics)) == 12


def test_generic_and_contested_are_measured_since_louis_decision_of_11_10():
    """#3223 — décision Louis 11/10/2026 : détecteur évalué + classement agrégé ≥ 3 espaces."""
    for name in (
        "taux de recommandations génériques",
        "hausse des réponses génériques",
        "comptes les plus contestés",
        "secteurs les moins fiables",
    ):
        assert name in COMPUTED_ON_REAL_TRAFFIC
    assert "trois espaces" in COMPUTED_ON_REAL_TRAFFIC["comptes les plus contestés"]
    assert "non fiable" in COMPUTED_ON_REAL_TRAFFIC["taux de recommandations génériques"]


def test_names_all_eight_alerts_of_3198():
    alerts = {
        "source interne jamais utilisée sur plusieurs jours",
        "hausse des réponses génériques",
        "Market Memory appelée mais non citée",
        "correction utilisateur sans changement de résultat",
        "taux élevé de NO_GO sans alternatives",
        "taux élevé de GO sur grands comptes sans accès",
        "réponses finales après budget épuisé",
        "absence systématique de DataForge",
    }
    assert set(ALERTS_NOT_YET_MEASURED) | (set(COMPUTED_ON_REAL_TRAFFIC) & alerts) == alerts
    assert not set(ALERTS_NOT_YET_MEASURED) & set(COMPUTED_ON_REAL_TRAFFIC)


def test_every_reason_is_non_empty_and_never_a_zero_disguised_as_a_reason():
    for reason in {
        **DASHBOARD_METRICS_NOT_YET_MEASURED,
        **ALERTS_NOT_YET_MEASURED,
        **COMPUTED_ON_REAL_TRAFFIC,
    }.values():
        assert reason.strip(), "une raison vide se lit comme un silence, jamais autorisé"
        assert reason != "0"


def test_report_names_every_metric_and_alert_rather_than_showing_zero():
    """Doctrine : un axe non évaluable sort du dénominateur, et se NOMME —
    jamais un silence, jamais un 0 inventé."""
    report = render_markdown()
    for metric in (*DASHBOARD_METRICS_NOT_YET_MEASURED, *COMPUTED_ON_REAL_TRAFFIC):
        assert metric in report, f"métrique non nommée dans le rapport : {metric}"
    for alert in ALERTS_NOT_YET_MEASURED:
        assert alert in report, f"alerte non nommée dans le rapport : {alert}"


def test_render_markdown_is_deterministic():
    assert render_markdown() == render_markdown()


def test_app_eval_chat_reasoning_dashboard_never_imports_tests():
    """GA-193 : le module de RENDU ne doit jamais importer `tests/`."""
    import ast
    from pathlib import Path

    import app.eval.chat_reasoning_dashboard as mod

    source = Path(mod.__file__).read_text(encoding="utf-8")
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            assert not node.module.startswith("tests"), f"import interdit : {node.module}"
        if isinstance(node, ast.Import):
            assert not any(a.name.startswith("tests") for a in node.names)


def test_cli_entry_point_prints_the_report(capsys):
    """`python -m tests.chat_reasoning_dashboard_report` — le vrai appelant."""
    exit_code = report_main([])
    assert exit_code == 0
    captured = capsys.readouterr()
    assert "raisonnement commercial de Laura" in captured.out
    assert "secteurs les moins fiables" in captured.out


def test_cli_entry_point_writes_to_a_file_with_out(tmp_path):
    out = tmp_path / "rapport.md"
    exit_code = report_main(["--out", str(out)])
    assert exit_code == 0
    assert "absence systématique de DataForge" in out.read_text(encoding="utf-8")
