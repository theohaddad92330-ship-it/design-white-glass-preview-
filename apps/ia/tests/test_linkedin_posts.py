"""Sujets de publication : le prompt propose des SUJETS, pas des posts."""

from __future__ import annotations

from app.models.outputs.linkedin_posts import LinkedInPostsOutput, PostIdea
from app.prompts.bellum_linkedin_posts import build_system_prompt, build_user_prompt
from app.services.model_policy import model_for


def test_le_prompt_refuse_d_ecrire_le_post():
    system = build_system_prompt()
    assert "Tu n'écris PAS le post" in system
    # La raison est écrite dans le prompt, parce qu'un modèle qui la comprend
    # tient mieux la contrainte qu'un modèle à qui on l'assène.
    assert "sa crédibilité" in system


def test_le_prompt_interdit_d_inventer_un_fait():
    system = build_system_prompt()
    assert "Tu n'inventes AUCUN fait" in system
    assert "propose moins de sujets" in system


def test_un_contexte_vide_est_annonce_comme_tel():
    prompt = build_user_prompt()
    assert "AUCUN CONTEXTE FOURNI" in prompt
    assert "rends-en moins" in prompt


def test_chaque_bloc_de_contexte_est_optionnel():
    prompt = build_user_prompt(missions="Mission Java chez ACME")
    assert "MISSIONS ET RÉFÉRENCES RÉELLES" in prompt
    assert "CE QUE VEND SON ESN" not in prompt
    assert "SIGNAUX DE MARCHÉ" not in prompt


def test_le_modele_est_declare_dans_la_politique():
    assert model_for("bellum_linkedin_posts")


def test_une_sortie_vide_est_valide():
    # Un contexte trop mince doit produire zéro sujet, pas un sujet creux.
    assert LinkedInPostsOutput().ideas == []


def test_un_sujet_sans_ancrage_reste_detectable():
    # Le routeur filtre sur `grounded_on` : le modèle par défaut le laisse vide,
    # donc un sujet non ancré ne peut pas passer pour ancré.
    assert PostIdea(angle="Un angle").grounded_on == ""
