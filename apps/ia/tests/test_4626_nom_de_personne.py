"""#4626 — un nom de PERSONNE ne se rend pas comme une entreprise (« BEN HRIZ AYA », « BEN MECHLIA AYMEN »).

Deux cas, deux issues. Une personne physique PROUVÉE (catégorie juridique 1xxx : entrepreneur individuel) est écartée —
elle ne fait aucune ligne (et l'entonnoir la compte sous « individual », `test_4419_entonnoir_rejet`). Sans catégorie,
rien ne le prouve : la ligne reste, « à vérifier », avec le motif `person_like_name` que l'écran nomme sur la carte
repliée. Ces tests savent dire NON sur une raison sociale.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services.account_qualification import ExclusionCode, VerifyCode, qualify_candidate


def _company(name: str, **over: Any) -> dict[str, Any]:
    return {"name": name, "siren": "123456789", "headcountTranche": "03", "legalCategory": "5710", **over}


def _codes(result: dict[str, Any]) -> list[str]:
    return [result["code"], *result.get("otherCodes", [])]


@pytest.mark.parametrize("name", ["BEN HRIZ AYA", "BEN MECHLIA AYMEN"])
def test_une_personne_physique_prouvee_est_ecartee_elle_ne_fait_aucune_ligne(name: str) -> None:
    result = qualify_candidate(_company(name, legalCategory="1000"), filters={})
    assert result["verdict"] == "excluded"
    assert result["code"] == ExclusionCode.NATURAL_PERSON


@pytest.mark.parametrize("name", ["BEN HRIZ AYA", "BEN MECHLIA AYMEN"])
def test_sans_categorie_le_nom_de_personne_est_a_verifier_et_nomme(name: str) -> None:
    result = qualify_candidate(_company(name, legalCategory=""), filters={})
    assert result["verdict"] == "to_verify"
    assert VerifyCode.PERSON_LIKE_NAME in _codes(result)


@pytest.mark.parametrize("name", ["IA DATA", "EDG DATA & IA", "SOCIETE GENERALE SA"])
def test_sait_dire_non_une_raison_sociale_n_est_pas_un_nom_de_personne(name: str) -> None:
    result = qualify_candidate(_company(name, legalCategory=""), filters={})
    assert VerifyCode.PERSON_LIKE_NAME not in _codes(result)


@pytest.mark.parametrize("name", ["SPIE BATIGNOLLES", "AIR LIQUIDE", "BOUYGUES BATIMENT", "SAINT GOBAIN"])
@pytest.mark.parametrize("tranche", ["", "NN"])
def test_sait_dire_non_sans_tranche_connue_une_raison_sociale_n_est_pas_un_nom_de_personne(
    name: str, tranche: str
) -> None:
    result = qualify_candidate(_company(name, legalCategory="", headcountTranche=tranche), filters={})
    assert VerifyCode.PERSON_LIKE_NAME not in _codes(result)


def test_sans_cle_de_tranche_le_badge_ne_se_declenche_pas() -> None:
    company = _company("AIR LIQUIDE", legalCategory="")
    del company["headcountTranche"]
    assert VerifyCode.PERSON_LIKE_NAME not in _codes(qualify_candidate(company, filters={}))


def test_sait_dire_oui_deux_mots_alphabetiques_avec_une_tranche_connue_sous_cinquante() -> None:
    result = qualify_candidate(_company("MARTIN DUPONT", legalCategory="", headcountTranche="02"), filters={})
    assert VerifyCode.PERSON_LIKE_NAME in _codes(result)


# ── Décision de Louis du 30/10/2026 : tranche INCONNUE et forme juridique INCONNUE → le badge s'affiche aussi, si un
# indice plus fin que « 2-3 mots » l'étaye. La ligne reste comptée (« à vérifier »), elle n'est pas écartée.


def _person(name: str) -> dict[str, Any]:
    return {"name": {"value": name, "origin": "registry", "observedAt": "2026-01-01"}}


@pytest.mark.parametrize("tranche", ["", "NN"])
def test_tranche_et_forme_inconnues_un_dirigeant_du_registre_au_meme_nom_etaye_le_badge(tranche: str) -> None:
    company = _company(
        "BEN HRIZ AYA", legalCategory="", headcountTranche=tranche, people=[_person("Aya BEN HRIZ")]
    )
    result = qualify_candidate(company, filters={})
    assert result["verdict"] == "to_verify"
    assert VerifyCode.PERSON_LIKE_NAME in _codes(result)


def test_tranche_et_forme_inconnues_la_casse_nom_prenom_etaye_le_badge() -> None:
    result = qualify_candidate(
        _company("TAMANI Thinhinane", legalCategory="", headcountTranche="NN"), filters={}
    )
    assert VerifyCode.PERSON_LIKE_NAME in _codes(result)


@pytest.mark.parametrize("name", ["SPIE BATIGNOLLES", "AIR LIQUIDE", "BOUYGUES BATIMENT", "SAINT GOBAIN"])
def test_sait_dire_non_un_dirigeant_physique_n_est_pas_le_nom_de_la_societe(name: str) -> None:
    company = _company(name, legalCategory="", headcountTranche="NN", people=[_person("Jean DUPONT")])
    assert VerifyCode.PERSON_LIKE_NAME not in _codes(qualify_candidate(company, filters={}))


def test_sait_dire_non_la_forme_juridique_connue_ne_laisse_pas_l_indice_seul_decider() -> None:
    company = _company("BEN HRIZ AYA", legalCategory="5710", headcountTranche="NN", people=[_person("Aya BEN HRIZ")])
    assert VerifyCode.PERSON_LIKE_NAME not in _codes(qualify_candidate(company, filters={}))
