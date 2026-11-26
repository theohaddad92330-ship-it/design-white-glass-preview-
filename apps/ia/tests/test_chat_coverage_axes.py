"""#2899 (#2278.27) — la couverture minimale du corpus chat, NOMMÉE.

#2278.27 demande une couverture minimale sur treize axes (vingt secteurs, six
tailles d'ESN, rôles, types de contrat, pays, connecteurs, richesse du
workspace, mobile, vocal, fichiers, jobs longs). Aucune mesure aujourd'hui —
ce module NOMME les treize axes (même discipline que `chat_corpus_sources`) :
pour chacun, soit une mesure RÉELLE contre le corpus canonique, soit une
raison concrète d'absence, jamais un silence ni un chiffre inventé.
"""

from __future__ import annotations

from app.eval.chat_coverage_axes import (
    MEASURED_AXIS_COVERAGE,
    NOT_MEASURABLE_AXIS_REASONS,
    CoverageAxis,
    axis_coverage,
)


def test_exactly_thirteen_axes() -> None:
    assert len(list(CoverageAxis)) == 13


def test_every_axis_is_either_measured_or_named_absent_never_both_never_neither() -> None:
    measured = set(MEASURED_AXIS_COVERAGE)
    absent = set(NOT_MEASURABLE_AXIS_REASONS)
    assert measured & absent == set(), "un axe ne peut pas être à la fois mesuré et absent"
    assert measured | absent == set(CoverageAxis), "un axe du corps de l'issue manque à l'appel"


def test_every_absence_reason_is_a_real_sentence_never_a_silence() -> None:
    for axis, reason in NOT_MEASURABLE_AXIS_REASONS.items():
        assert len(reason.strip()) > 20, f"{axis} : raison trop courte pour être une vraie explication"


def test_roles_axis_is_measured_against_the_real_corpus() -> None:
    # Le seul axe mesurable aujourd'hui : Meta.personas (Famille), déjà porté
    # par chaque scénario canonique (#1948.13).
    coverage = axis_coverage(CoverageAxis.ROLES)
    assert coverage is not None
    families, scenario_count = coverage
    assert scenario_count > 100, "corpus canonique suspect — trop peu de scénarios"
    assert families, "au moins une famille doit apparaître dans un corpus non vide"


def test_axis_coverage_returns_none_for_a_named_absent_axis() -> None:
    assert axis_coverage(CoverageAxis.SECTORS) is None


def test_at_least_twelve_axes_are_honestly_named_absent() -> None:
    # Un TAUX DE COUVERTURE mesure ce qu'on SAIT, jamais ce que le marché FAIT
    # (doctrine, garde GA-259) : inventer une mesure sur les douze autres axes
    # serait la donnée fictive interdite.
    assert len(NOT_MEASURABLE_AXIS_REASONS) >= 12
