"""LAU-FINAL-206 (#3200) — Laura ne récite jamais le nom d'une méthodologie
commerciale interne ni le nom d'un fournisseur dans une réponse.

Le défaut que ce test ferme : ``build_subsection_user_prompt`` (section
``offers``) injectait littéralement « methode SalesConnect » dans le PROMPT
envoyé au modèle (``app/prompts/bellum_plan.py``). « SalesConnect » est la
méthode commerciale sous licence que Bellum applique en interne — jamais un
mot que le produit doit prononcer devant un client, au même titre qu'un
fournisseur technique (``app/knowledge/business_rules.py`` § interdit
``nom_de_fournisseur_technique_dans_l_app``). Un mot présent dans le CONTEXTE
du modèle peut être recopié tel quel dans sa réponse — c'est le chemin
mesuré par le retour bêta : « elle ne doit pas réciter le nom SalesConnect ».

Contrat : le raisonnement (« une estimation est une hypothèse, jamais un
fait ») reste intact — seul le nom de marque disparaît du texte envoyé au
modèle. Le code et les commentaires internes (jamais lus par le modèle ni
par un client) peuvent continuer à s'y référer pour la traçabilité.
"""

from __future__ import annotations

from app.prompts.bellum_plan import build_subsection_user_prompt

_SECTIONS = ("action_plan", "offers", "quick_wins", "if_no_response", "evaluation")


def test_offers_subsection_prompt_never_names_the_internal_methodology() -> None:
    prompt = build_subsection_user_prompt(company_name="Test", section="offers")
    assert "SalesConnect" not in prompt


def test_no_subsection_prompt_names_the_internal_methodology() -> None:
    """Invariant plus large : aucune des cinq sous-sections du plan Phase 4 ne
    doit, aujourd'hui ni demain, réintroduire le nom par un autre champ."""
    offenders = {
        section: prompt
        for section in _SECTIONS
        if "SalesConnect" in (prompt := build_subsection_user_prompt(company_name="Test", section=section))
    }
    assert not offenders, f"« SalesConnect » fuite dans le prompt de : {sorted(offenders)}"


def test_estimation_reasoning_is_preserved_without_the_brand_name() -> None:
    """Non-régression : on retire le nom, pas la consigne qu'il accompagnait."""
    prompt = build_subsection_user_prompt(company_name="Test", section="offers")
    assert "HYPOTHESE" in prompt
    assert "PAS un fait" in prompt
