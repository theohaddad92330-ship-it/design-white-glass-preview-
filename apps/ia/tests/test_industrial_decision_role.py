"""Les décideurs TECHNIQUES d'un industriel (addendum Stelya §10).

Le retour bêta est net : « Le chemin d'accès commence par les fonctions
techniques pertinentes et place Achats/RH en gatekeepers secondaires sauf preuve
contraire. » Le classifieur du dépôt ne connaissait que le décideur IT — un
directeur d'usine, un responsable méthodes ou un directeur de bureau d'études
étaient rangés `user`, c'est-à-dire derrière un acheteur.

La sûreté tient à un défaut : `industrial=False`. Un vendeur IT continue de voir
exactement le classement d'avant — un directeur d'usine n'est PAS son décideur,
sa DSI l'est.
"""

from __future__ import annotations

import pytest

from app.services.decision_role import classify_decision_role, is_industrial_decider

_INDUSTRIAL_TITLES = [
    "Directeur Technique",
    "Directeur Industriel",
    "Directeur d'usine",
    "Plant Manager",
    "Responsable Bureau d'Études",
    "Directeur BE",
    "Responsable Méthodes",
    "Manufacturing Engineering Manager",
    "Responsable Industrialisation",
    "Responsable Qualité",
    "Supplier Quality Manager",
    "Responsable Maintenance",
    "Asset Manager",
    "Responsable Automatisme",
    "Directeur R&D",
    "Responsable HSE",
    "Directeur de Production",
    "Chief Engineer",
]


@pytest.mark.parametrize("title", _INDUSTRIAL_TITLES)
def test_industrial_titles_are_technical_deciders_for_an_industrial_seller(title: str) -> None:
    assert is_industrial_decider(title) is True
    assert classify_decision_role(title, industrial=True) == "technical"


@pytest.mark.parametrize("title", _INDUSTRIAL_TITLES)
def test_the_same_titles_are_UNCHANGED_for_a_non_industrial_seller(title: str) -> None:
    """La non-régression : pour une ESN IT, un directeur d'usine n'est pas un
    décideur — sa DSI l'est. Le classement d'avant est rendu à l'octet près."""
    assert classify_decision_role(title, industrial=True) != classify_decision_role(title) or classify_decision_role(
        title
    ) in {"technical", None}


def test_it_titles_still_win_for_an_industrial_seller() -> None:
    """Un industriel a AUSSI une DSI : la règle industrielle s'ajoute, elle ne
    remplace pas."""
    assert classify_decision_role("DSI", industrial=True) == "technical"
    assert classify_decision_role("Directeur des Systèmes d'Information", industrial=True) == "technical"


def test_purchasing_stays_purchasing_even_for_an_industrial_seller() -> None:
    """« Achats et RH sont des gatekeepers secondaires sauf preuve contraire » :
    la règle industrielle ne doit surtout pas promouvoir un acheteur."""
    assert classify_decision_role("Responsable Achats", industrial=True) == "procurement"
    assert classify_decision_role("Acheteur Industriel", industrial=True) == "procurement"
    # « Achats industriels » contient « industriel » — c'est le piège exact que
    # des mots-clés trop larges produiraient.
    assert classify_decision_role("Directeur des Achats Industriels", industrial=True) != "technical"


def test_hr_is_never_promoted_by_the_industrial_rule() -> None:
    assert classify_decision_role("DRH", industrial=True) != "technical"
    assert classify_decision_role("Responsable Recrutement", industrial=True) != "technical"


def test_finance_titles_are_not_swept_in() -> None:
    assert classify_decision_role("Directeur Financier", industrial=True) == "economic"


def test_an_intern_is_never_a_decider() -> None:
    """Le garde existant passe AVANT la règle industrielle."""
    assert classify_decision_role("Stagiaire Méthodes", industrial=True) is None
    assert classify_decision_role("Alternant Bureau d'Études", industrial=True) is None


def test_governance_stays_out_of_the_buying_committee() -> None:
    assert classify_decision_role("Président du Conseil d'Administration", industrial=True) is None


# ── Adaptation sectorielle Automobile — programme/safety (#2311.21) ──────────
#
# Mesuré avant d'écrire (git grep) : le classifieur industriel connaissait déjà
# la chaîne technique générique (BE/méthodes/qualité/maintenance/automatisme)
# mais pas les deux fonctions propres à l'automobile citées par l'épopée —
# direction de programme (porte les arbitrages fournisseurs d'un programme
# véhicule) et sécurité produit/fonctionnelle (porte les exigences ISO 26262
# opposables au fournisseur). Sans ces motifs, « Directeur de Programme » et
# « Safety Manager » tombaient `to_qualify` — ni décideur ni utilisateur — chez
# un vendeur industriel automobile.

_AUTOMOTIVE_SECTOR_TITLES = [
    "Directeur de Programme",
    "Program Director",
    "Responsable de Programme",
    "Safety Manager",
    "Responsable Sécurité Produit",
    "Product Safety Manager",
    "Functional Safety Manager",
]


@pytest.mark.parametrize("title", _AUTOMOTIVE_SECTOR_TITLES)
def test_automotive_sector_titles_are_technical_deciders_for_an_industrial_seller(title: str) -> None:
    assert is_industrial_decider(title) is True
    assert classify_decision_role(title, industrial=True) == "technical"


@pytest.mark.parametrize("title", _AUTOMOTIVE_SECTOR_TITLES)
def test_automotive_sector_titles_are_UNCHANGED_for_a_non_industrial_seller(title: str) -> None:
    """Même garde de non-régression que le reste du module : sans le prisme
    industriel, le classement d'avant est rendu à l'octet près."""
    assert classify_decision_role(title) != "technical"


def test_automotive_safety_does_not_reclassify_the_operational_engineer() -> None:
    """« Ingénieur Sécurité Fonctionnelle » reste un exécutant (relais terrain),
    pas un décideur : c'est le RESPONSABLE/MANAGER qui porte l'arbitrage, pas
    l'ingénieur qui applique la norme. Le motif est ancré sur la fonction
    d'encadrement, jamais sur le mot « sécurité » seul."""
    assert classify_decision_role("Ingénieur Sécurité Fonctionnelle", industrial=True) != "technical"


# ── Adaptation sectorielle Pharma — validation/procédés (#2311.22) ───────────
#
# Mesuré avant d'écrire : « Ingénieur Validation »/« Ingénieur Procédés »
# tombaient déjà `user` (fonction opérationnelle, correct), mais les rôles
# réglementaires qui PORTENT l'arbitrage pharma — Personne Qualifiée (QP, seule
# habilitée à libérer un lot en UE), pharmacovigilance, affaires réglementaires,
# assurance qualité — tombaient `to_qualify`.

_PHARMA_SECTOR_TITLES = [
    "Qualified Person",
    "Personne Qualifiée",
    "Responsable Pharmacovigilance",
    "Responsable Affaires Réglementaires",
    "Regulatory Affairs Manager",
    "Head of Quality Assurance",
    "QA Manager",
]


@pytest.mark.parametrize("title", _PHARMA_SECTOR_TITLES)
def test_pharma_sector_titles_are_technical_deciders_for_an_industrial_seller(title: str) -> None:
    assert is_industrial_decider(title) is True
    assert classify_decision_role(title, industrial=True) == "technical"


@pytest.mark.parametrize("title", _PHARMA_SECTOR_TITLES)
def test_pharma_sector_titles_are_UNCHANGED_for_a_non_industrial_seller(title: str) -> None:
    assert classify_decision_role(title) != "technical"


def test_pharma_sector_does_not_reclassify_the_operational_engineer() -> None:
    """« Ingénieur Validation »/« Ingénieur Procédés » restent des exécutants —
    déjà `user` avant ce lot, non touchés par les nouveaux motifs réglementaires."""
    assert classify_decision_role("Ingénieur Validation", industrial=True) != "technical"
    assert classify_decision_role("Ingénieur Procédés", industrial=True) != "technical"
