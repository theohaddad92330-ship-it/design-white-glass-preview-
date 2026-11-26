"""#3668 — le prompt de signaux sélectionne ce qui change la décision."""

from __future__ import annotations

from app.prompts import bellum_signals

_SYSTEM = bellum_signals.build_system_prompt({"companyName": "X", "offers": ["Ingénierie"]})


def test_programme_general_est_du_contexte() -> None:
    assert "programme GENERAL" in _SYSTEM and "CONTEXTE" in _SYSTEM


def test_budget_global_n_est_pas_une_enveloppe() -> None:
    assert "enveloppe accessible au vendeur" in _SYSTEM


def test_pas_de_substitution_par_homonyme_ou_maison_mere() -> None:
    assert "jamais un homonyme" in _SYSTEM


def test_signaux_defavorables_gardes_et_absence_nommee() -> None:
    assert "signaux defavorables" in _SYSTEM
    assert "dans les sources consultees" in _SYSTEM
