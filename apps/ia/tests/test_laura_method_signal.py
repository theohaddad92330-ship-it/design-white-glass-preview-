"""BEL-SC-226 (#3255) — le signal de méthode DISCRET pour le reçu de réponse.

Spec, section TRANSPARENCE : « Dans le reçu de réponse, indiquer discrètement :
« Méthode utilisée : ouverture de compte fermé / 5P incomplet ». Pas de document
complet exposé. » Ce module dérive la moitié « 5P incomplet » à partir de la
projection déjà posée par l'API sur `account_data["strategy5p"]` (BEL-SC-225,
readiness + next_action_dimension) — jamais une réévaluation ni les cinq P en
entier.
"""

from __future__ import annotations

from app.prompts.laura_method_signal import resolve_5p_method_signal


def test_no_signal_without_an_account():
    assert resolve_5p_method_signal(None) == ""


def test_no_signal_when_the_key_is_absent_client_ancien():
    assert resolve_5p_method_signal({"company_name": "SNCF"}) == ""


def test_no_signal_when_the_five_p_are_ready():
    assert resolve_5p_method_signal({"readiness": "READY_TO_ACT", "next_action_dimension": None}) == ""


def test_signal_names_the_next_dimension_when_incomplete():
    signal = resolve_5p_method_signal({"readiness": "INCOMPLETE", "next_action_dimension": "perimeter"})
    assert signal == "5P incomplet (périmètre à cadrer en premier)"


def test_signal_covers_every_named_dimension():
    expected = {
        "perimeter": "périmètre",
        "problem": "problème",
        "people": "personnes",
        "proof": "preuve",
        "passage": "passage",
    }
    for dimension, label in expected.items():
        signal = resolve_5p_method_signal({"readiness": "BLOCKED", "next_action_dimension": dimension})
        assert signal == f"5P incomplet ({label} à cadrer en premier)"


def test_signal_stays_generic_without_a_named_dimension():
    # NO_GO sans dimension nommée (forme malformée / ancien client) : jamais une
    # ligne inventée, un « incomplet » nu reste honnête.
    assert resolve_5p_method_signal({"readiness": "NO_GO", "next_action_dimension": None}) == "5P incomplet"


def test_no_signal_on_an_unknown_readiness_value():
    # Une valeur hors de l'énumération connue (contrat non vérifiable) ne se
    # devine pas — silence plutôt qu'une affirmation fausse.
    assert resolve_5p_method_signal({"readiness": "SOMETHING_NEW", "next_action_dimension": "perimeter"}) == ""


def test_tolerant_to_a_non_dict_payload():
    assert resolve_5p_method_signal("not-a-dict") == ""
    assert resolve_5p_method_signal(42) == ""


# ─── #3285 — la moitié « ouverture de compte fermé » ─────────────────────────

import pytest  # noqa: E402

from app.prompts.laura_method_signal import resolve_opening_method_signal  # noqa: E402


@pytest.mark.parametrize("state", ["dormant", "ancien_client"])
def test_closed_account_opening_is_named_for_a_reactivation_state(state):
    assert resolve_opening_method_signal(state) == "ouverture de compte fermé"


@pytest.mark.parametrize("state", [None, "", "froid", "client_actif", "inconnu", 3])
def test_no_opening_signal_when_the_route_is_not_a_reactivation(state):
    assert resolve_opening_method_signal(state) == ""
