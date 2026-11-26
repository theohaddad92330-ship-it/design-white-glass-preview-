"""BELLUM-CV — réécriture du CV selon la mission (annexe méthodo p22).

Ce prompt demande à un modèle d'améliorer un CV pour qu'il colle à un besoin.
La pente naturelle est d'ajouter la compétence qui manque — sur une personne
réelle, dans un document envoyé au client. Les tests ci-dessous verrouillent la
consigne ; le contrôle qui ne dépend PAS du modèle vit côté API
(``cv-rewrite-guard.spec.ts``, qui cherche chaque citation dans le CV source).
"""

from __future__ import annotations

from app.prompts.bellum_cv import build_system_prompt, build_user_prompt

CONSULTANT = {
    "full_name": "Camille Dubois",
    "title": "Ingénieur DevOps",
    "seniority": "senior",
    "stack": ["Kubernetes", "GitLab CI"],
    "sectors": ["Banque"],
    "references": ["Société Générale"],
    "cv_text": "Migration de 40 applications vers Kubernetes chez Société Générale.",
}

MISSION = {
    "label": "Migration Kubernetes et industrialisation Terraform",
    "detail": "Renfort DevOps sur la plateforme cloud",
    "sector": "Banque",
    "zone": "IDF",
}


def test_le_systeme_interdit_explicitement_l_ajout():
    prompt = build_system_prompt()
    assert "JAMAIS LE DROIT" in prompt
    # Les quatre natures d'ajout qui font gagner un deal et perdre un client.
    for interdit in ("compétence", "certification", "client", "année"):
        assert interdit in prompt


def test_le_systeme_exige_une_citation_exacte():
    prompt = build_system_prompt()
    assert "proof" in prompt
    assert "CITATION EXACTE" in prompt


def test_un_manque_va_dans_gaps_pas_dans_le_cv():
    prompt = build_system_prompt()
    assert '"gaps"' in prompt
    assert "n'est PAS une ligne de CV" in prompt


def test_le_cv_source_est_injecte_tel_quel():
    prompt = build_user_prompt(CONSULTANT, MISSION)
    assert "Migration de 40 applications vers Kubernetes" in prompt
    assert "SEULE MATIÈRE AUTORISÉE" in prompt


def test_le_besoin_est_injecte():
    prompt = build_user_prompt(CONSULTANT, MISSION)
    assert "Terraform" in prompt
    assert "Banque" in prompt


def test_le_declaratif_est_marque_comme_non_probant():
    """La stack déclarée sert au vocabulaire, elle ne prouve rien — sinon le
    modèle « prouverait » une compétence par le fait qu'elle est cochée."""
    prompt = build_user_prompt(CONSULTANT, MISSION)
    assert "ce n'est PAS une preuve" in prompt


def test_un_cv_vide_ne_fabrique_pas_de_matiere():
    """TÉMOIN : sans CV, le bloc source est vide — il n'y a rien à citer, donc
    rien ne peut être « prouvé ». C'est ce qui justifie le 422 du routeur."""
    prompt = build_user_prompt({**CONSULTANT, "cv_text": ""}, MISSION)
    assert "Migration de 40 applications" not in prompt
