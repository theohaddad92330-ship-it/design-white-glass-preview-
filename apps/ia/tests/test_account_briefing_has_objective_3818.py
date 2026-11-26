"""#3818.1 — le verdict NOMMÉ d'un dossier lit l'OBJECTIF RÉELLEMENT renseigné
par l'espace (le domaine d'offre, `profileData.offerDomain` — seule source,
`esn_profiles.offer_domain`/`offer_domains`, GA-26), au lieu du défaut
`has_objective=True` qui masquait l'absence d'objectif derrière un
« ÉCARTER POUR CET OBJECTIF » illisible.

`build_account_briefing(account)` sans `profile_data` (tous les appelants
existants, `test_chat_tools_briefing.py` inchangé) garde le comportement
d'AVANT à l'octet près — seul l'appelant RÉEL (`get_account_briefing`,
`_suggest_account_alternatives`) qui connaît le profil fait la différence."""

from __future__ import annotations

from app.services.account_score import VERDICT_ZERO_MEASURED
from app.services.chat_tools import _account_named_verdict, build_account_briefing

_STOP_ACCOUNT = {
    "id": "acc-3818",
    "company_name": "SansObjectif SAS",
    "raw_analysis": {"plan": {"evaluation": {"verdict": "STOP"}}},
}


def test_sans_profile_data_le_defaut_reste_ecarter_pour_cet_objectif():
    b = build_account_briefing(_STOP_ACCOUNT)
    assert b["verdict"] == "ÉCARTER POUR CET OBJECTIF"


def test_profile_sans_aucun_domaine_d_offre_rend_zero_mesure_jamais_ecarter():
    b = build_account_briefing(_STOP_ACCOUNT, profile_data={})
    assert b["verdict"] == VERDICT_ZERO_MEASURED
    assert b["verdict"] != "ÉCARTER POUR CET OBJECTIF"


def test_profile_sans_profil_du_tout_rend_zero_mesure_jamais_ecarter():
    b = build_account_briefing(_STOP_ACCOUNT, profile_data=None)
    assert b["verdict"] == VERDICT_ZERO_MEASURED


def test_profile_avec_un_domaine_d_offre_garde_ecarter_pour_cet_objectif():
    b = build_account_briefing(_STOP_ACCOUNT, profile_data={"offerDomain": "esn_it"})
    assert b["verdict"] == "ÉCARTER POUR CET OBJECTIF"


def test_account_named_verdict_lit_directement_has_objective():
    assert _account_named_verdict(_STOP_ACCOUNT, has_objective=False) == VERDICT_ZERO_MEASURED
    assert _account_named_verdict(_STOP_ACCOUNT, has_objective=True) == "ÉCARTER POUR CET OBJECTIF"
    # Défaut byte-identique à l'ancien appel à un seul argument.
    assert _account_named_verdict(_STOP_ACCOUNT) == "ÉCARTER POUR CET OBJECTIF"
