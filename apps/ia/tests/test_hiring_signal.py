"""#3204 (LAU-FINAL-210) — la catégorie commerciale d'une offre d'emploi."""

from __future__ import annotations

from app.services.hiring_signal import classify_hiring_signal


def test_cdi_est_internal_hiring_jamais_contracting() -> None:
    # RÈGLE explicite de la spec : CDI ≠ besoin freelance.
    assert classify_hiring_signal("permanent") == "internal_hiring"


def test_cdd_est_internal_hiring() -> None:
    assert classify_hiring_signal("fixedTerm") == "internal_hiring"


def test_freelance_est_contracting() -> None:
    assert classify_hiring_signal("freelance") == "contracting"


def test_interim_est_staffing_signal() -> None:
    assert classify_hiring_signal("interim") == "staffing_signal"


def test_code_non_verifie_retombe_sur_skill_demand_signal_jamais_none() -> None:
    # RÈGLE : « stage ≠ budget prestation » — un code non vérifié (stage, ou
    # absent) ne doit jamais se classer comme un besoin de prestation. La
    # spec nomme explicitement ce cas SKILL_DEMAND_SIGNAL (compétence
    # recherchée, sans conclusion contractuelle) : jamais deviné vers une
    # catégorie plus forte.
    assert classify_hiring_signal("other") == "skill_demand_signal"
    assert classify_hiring_signal(None) == "skill_demand_signal"
    assert classify_hiring_signal("") == "skill_demand_signal"


def test_intermediated_ecrase_toute_autre_classification() -> None:
    # Une offre publiée par un cabinet POUR un client ne dit rien du besoin
    # de l'employeur nommé — jamais internal_hiring/contracting, quel que
    # soit le code de contrat lu.
    assert classify_hiring_signal("permanent", intermediated=True) == "agency_posting"
    assert classify_hiring_signal("freelance", intermediated=True) == "agency_posting"
