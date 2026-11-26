"""Tests de app/eval/chat_dashboard.py + tests/chat_dashboard_report.py — le
tableau de pilotage (#2443.11, script, pas un écran).

`app/eval/chat_dashboard.py` reste pur (render_markdown, NOT_YET_MEASURED) —
`tests/chat_dashboard_report.py` lit CORPUS (GA-193 : `app/` n'importe jamais
`tests/`).
"""

from __future__ import annotations

from app.eval.chat_dashboard import NOT_YET_MEASURED, render_markdown
from tests.chat_dashboard_report import build_report


def test_report_names_the_version_and_total_cases():
    report = build_report()
    assert "Version du registre de prompts" in report
    assert "Cas du corpus" in report


def test_report_covers_the_four_hermetically_computable_axes():
    report = build_report()
    for heading in ("P0 — rôles clés", "Hard failures nommés", "Persona", "## Outil"):
        assert heading in report, f"axe manquant du rapport : {heading}"


def test_report_names_the_fifteen_commercial_intelligence_measures():
    # #3197 (LAU-FINAL-203) : chaque mesure nommée apparaît, calculable ou non.
    from app.eval.chat_commercial_measures import ChatCommercialMeasure

    report = build_report()
    assert "Mesures d'intelligence commerciale (LAU-FINAL-203, #3197)" in report
    for measure in ChatCommercialMeasure:
        assert f"`{measure.value}`" in report, f"mesure absente du rapport : {measure.value}"


def test_report_names_every_axis_it_cannot_measure_rather_than_showing_zero():
    """Doctrine : un axe non évaluable sort du dénominateur, et se NOMME —
    jamais un silence, jamais un 0 inventé."""
    report = build_report()
    for axe in NOT_YET_MEASURED:
        assert axe in report, f"axe non mesuré non nommé dans le rapport : {axe}"


def test_app_eval_chat_dashboard_never_imports_tests():
    """GA-193 : le module de RENDU ne doit jamais importer `tests/`."""
    import ast
    from pathlib import Path

    import app.eval.chat_dashboard as mod

    source = Path(mod.__file__).read_text(encoding="utf-8")
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            assert not node.module.startswith("tests"), f"import interdit : {node.module}"
        if isinstance(node, ast.Import):
            assert not any(a.name.startswith("tests") for a in node.names)


def test_render_markdown_is_deterministic_given_the_same_metrics():
    metrics = {
        "version": "abc123",
        "total_cases": 3,
        "key_role_coverage": {"dirigeant": {"cases": 3, "cases_with_named_hard_failure": 1}},
        "hard_failure_coverage": {"identity_error": 1},
        "persona_counts": {"dirigeant": 3},
        "outil_counts": {"get_pipeline": 2, "(aucun — règle de conduite du prompt)": 1},
    }
    assert render_markdown(metrics) == render_markdown(metrics)


def test_render_markdown_never_invents_a_key_role_row():
    metrics = {
        "version": "abc123",
        "total_cases": 0,
        "key_role_coverage": {},
        "hard_failure_coverage": {},
        "persona_counts": {},
        "outil_counts": {},
    }
    report = render_markdown(metrics)
    assert "| dirigeant |" not in report


# #2899 / #2443.10 — la section « demandes de production anonymisées » : lue par le pont, nommée
# « non mesuré » quand il est éteint, jamais « 0 ».
def test_prod_samples_section_absent_unless_asked():
    assert "Demandes de production anonymisées" not in build_report()


def test_prod_samples_section_says_not_measured_when_the_bridge_is_off():
    from app.eval.chat_prod_samples import ProdSampleReport, ProdSampleStatus

    report = render_markdown(
        {**_minimal_metrics(), "prod_samples": ProdSampleReport(status=ProdSampleStatus.UNAVAILABLE)}
    )
    assert "Demandes de production anonymisées" in report
    assert "non mesuré" in report
    assert "0 échantillon" not in report


def test_prod_samples_section_counts_clean_and_leaking_samples():
    from app.eval.chat_prod_samples import ProdSample, ProdSampleReport, ProdSampleStatus

    samples = [ProdSample("une question", ""), ProdSample("écris à marie@nova.fr", "")]
    report = render_markdown(
        {**_minimal_metrics(), "prod_samples": ProdSampleReport(ProdSampleStatus.OK, samples, not_anonymous=1)}
    )
    assert "**2** demandes" in report
    assert "**1** ne passe pas la seconde lecture" in report


def _minimal_metrics() -> dict:
    return {
        "version": "v",
        "total_cases": 0,
        "key_role_coverage": {},
        "hard_failure_coverage": {},
        "persona_counts": {},
        "outil_counts": {},
    }
