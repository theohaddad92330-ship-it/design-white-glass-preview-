"""Moteur de recherche actualité multi-source — #2769 (#2289.1/.2/.3/.4/.5/.12)."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.services.source_engine import (
    OBJECT_FRESHNESS_DAYS,
    OBJECT_TO_FAMILIES,
    SOURCE_FAMILIES,
    ResearchPlan,
    build_research_plan,
    freshness_window_days,
    should_query_family,
)


def test_sixteen_named_source_families():
    assert len(SOURCE_FAMILIES) == 16
    assert len({f.name for f in SOURCE_FAMILIES}) == 16  # tous distincts


def test_exactly_four_families_have_a_connector():
    connected = [f.name for f in SOURCE_FAMILIES if f.has_connector]
    assert connected == [
        "registres officiels",
        "appels d'offres en cours",
        "marchés attribués",
        "pages carrières",
    ]


def test_twelve_families_named_without_connector():
    without = [f.name for f in SOURCE_FAMILIES if not f.has_connector]
    assert len(without) == 12
    assert "profils publics" in without  # #2289.11


def test_eight_named_freshness_objects():
    assert len(OBJECT_FRESHNESS_DAYS) == 8
    for objet in (
        "poste",
        "recrutement",
        "appel d'offre",
        "technologie",
        "budget",
        "projet",
        "entité",
        "certification",
    ):
        assert freshness_window_days(objet) > 0


def test_unknown_objet_raises_rather_than_guesses():
    with pytest.raises(ValueError):
        freshness_window_days("transformation digitale")


def test_build_research_plan_has_ten_fields():
    plan = build_research_plan("budget", secteur=None, geo="FR", now=datetime(2026, 9, 26, tzinfo=UTC))
    fields = [
        plan.objet,
        plan.secteur,
        plan.geo,
        plan.freshness_window_days,
        plan.selected_families,
        plan.families_without_connector,
        plan.reliability_floor,
        plan.stop_criteria,
        plan.validation_criteria,
        plan.created_at,
    ]
    assert len(fields) == 10
    assert plan.freshness_window_days == 365
    # "budget" n'a aujourd'hui aucune famille CONNECTÉE pertinente (#2289.1/.2) —
    # sélection vide assumée, jamais une famille non pertinente retenue.
    assert plan.selected_families == ()
    assert len(plan.families_without_connector) == 12
    assert "communiqués" in plan.families_without_connector


def test_build_research_plan_never_claims_a_connected_family_is_exhaustive():
    # #2289.4 — aucune source n'est automatiquement exhaustive : le plan ne dit
    # jamais "cette famille suffit", seulement un critère d'arrêt PAR RÉSULTAT.
    plan = build_research_plan("appel d'offre")
    assert "chaque famille" in plan.stop_criteria
    assert "toutes les familles retenues épuisées" in plan.stop_criteria


# ── #2289.1/.2 — le plan choisit RÉELLEMENT les sources interrogées ──────────
# Avant : ``selected_families`` retenait toujours les 4 familles connectées,
# quel que soit l'objet — un plan qui répond toujours pareil ne DÉCIDE rien
# (constat du vérificateur du 26/09). Ces tests prouvent que la sélection
# dépend de l'objet, jamais un simple journal de ce qui est déjà connecté.


def test_selected_families_depend_on_the_objet_not_only_on_connectivity():
    assert build_research_plan("appel d'offre").selected_families == (
        "appels d'offres en cours",
        "marchés attribués",
    )
    assert build_research_plan("poste").selected_families == ("pages carrières",)
    assert build_research_plan("recrutement").selected_families == ("pages carrières",)
    assert build_research_plan("entité").selected_families == ("registres officiels",)
    # Un objet "appel d'offre" ne retient jamais la famille carrières, et
    # réciproquement — la sélection distingue vraiment les objets entre eux.
    assert "pages carrières" not in build_research_plan("appel d'offre").selected_families
    assert "appels d'offres en cours" not in build_research_plan("poste").selected_families


def test_selected_families_never_names_a_family_without_connector():
    connected = {f.name for f in SOURCE_FAMILIES if f.has_connector}
    for objet in OBJECT_FRESHNESS_DAYS:
        plan = build_research_plan(objet)
        assert set(plan.selected_families) <= connected, objet


def test_object_to_families_covers_exactly_the_eight_named_objects():
    assert set(OBJECT_TO_FAMILIES) == set(OBJECT_FRESHNESS_DAYS)


def test_should_query_family_reflects_the_plan_selection():
    plan = build_research_plan("appel d'offre")
    assert should_query_family(plan, "appels d'offres en cours") is True
    assert should_query_family(plan, "marchés attribués") is True
    # Ni une famille non retenue pour cet objet, ni une famille sans connecteur.
    assert should_query_family(plan, "pages carrières") is False
    assert should_query_family(plan, "presse") is False


def test_should_query_family_is_false_on_an_empty_selection():
    empty_plan = ResearchPlan(
        objet="budget",
        secteur=None,
        geo="FR",
        freshness_window_days=365,
        selected_families=(),
        families_without_connector=(),
        reliability_floor="public_fiable",
        stop_criteria="",
        validation_criteria="",
        created_at=datetime(2026, 9, 26, tzinfo=UTC),
    )
    assert should_query_family(empty_plan, "registres officiels") is False
