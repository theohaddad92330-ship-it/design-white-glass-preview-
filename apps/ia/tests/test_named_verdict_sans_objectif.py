"""#3818 — sans objectif renseigné dans l'espace, un STOP ne dit jamais
« ÉCARTER POUR CET OBJECTIF » : il n'y a pas de "cet objectif" à juger.

`has_objective=True` (défaut) garde le comportement d'avant à l'octet près —
voir `test_account_named_verdict.py`, inchangé par ce lot."""

from __future__ import annotations

from app.services.account_score import (
    VERDICT_INCOMPATIBILITY_ESTABLISHED,
    VERDICT_SOURCE_DOWN,
    VERDICT_ZERO_MEASURED,
    named_verdict,
)


def test_sans_objectif_un_stop_mesure_ne_dit_jamais_ecarter_pour_cet_objectif():
    verdict = named_verdict("STOP", has_objective=False)
    assert verdict != "ÉCARTER POUR CET OBJECTIF"
    assert verdict == VERDICT_ZERO_MEASURED


def test_sans_objectif_une_source_en_panne_est_distincte_d_un_zero_mesure():
    source_down = named_verdict("STOP", has_objective=False, data_complete=False)
    zero_measured = named_verdict("STOP", has_objective=False, data_complete=True)
    assert source_down == VERDICT_SOURCE_DOWN
    assert zero_measured == VERDICT_ZERO_MEASURED
    assert source_down != zero_measured


def test_sans_objectif_un_declencheur_reste_un_ecartement_legitime_et_nomme():
    verdict = named_verdict("STOP", has_objective=False, has_no_go_trigger=True)
    assert verdict == VERDICT_INCOMPATIBILITY_ESTABLISHED
    assert verdict not in {VERDICT_SOURCE_DOWN, VERDICT_ZERO_MEASURED, "ÉCARTER POUR CET OBJECTIF"}


def test_les_trois_libelles_sont_distincts():
    assert len({VERDICT_SOURCE_DOWN, VERDICT_ZERO_MEASURED, VERDICT_INCOMPATIBILITY_ESTABLISHED}) == 3


def test_avec_objectif_le_comportement_d_avant_est_inchange():
    assert named_verdict("STOP", has_objective=True, has_no_go_trigger=True) == "METTRE EN VEILLE"
    assert named_verdict("STOP", has_objective=True, has_no_go_trigger=False) == "ÉCARTER POUR CET OBJECTIF"
    assert named_verdict("STOP") == "ÉCARTER POUR CET OBJECTIF"  # défaut jamais régressé


def test_go_prudent_explorer_ignorent_has_objective():
    assert named_verdict("GO", has_objective=False) == "AGIR MAINTENANT"
    assert named_verdict("PRUDENT", has_objective=False) == "RÉSERVE"
    assert named_verdict("EXPLORER", has_objective=False) == "QUALIFIER"
