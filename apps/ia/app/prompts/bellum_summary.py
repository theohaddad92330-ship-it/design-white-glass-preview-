"""BELLUM-SUMMARY — Résumé exécutif personnalisé d'une analyse compte."""
from __future__ import annotations

from app.services.domain_focus import offers_or_default
from app.prompts.style import FRENCH_STYLE_DIRECTIVE


def build_system_prompt(profile: dict) -> str:
    esn_name = profile.get("esn_name", "votre ESN")
    archetype = profile.get("archetype", "boutique_expert")
    offers = offers_or_default(profile, it_default=["conseil IT", "développement"], keys=("core_offers",))
    offers_str = ", ".join(offers) if isinstance(offers, list) else str(offers)

    archetype_calibration = {
        "solo_hunter": "Tu t'adresses à un commercial solo : sois ultra-concret, 0 blabla, une seule action immédiate.",
        "boutique_expert": "Tu t'adresses à une petite ESN experte : insiste sur la niche, la différenciation, l'entrée par l'expertise.",
        "mid_market_challenger": "Tu t'adresses à une ESN mid-market : équilibre entre volume de contacts et qualité du ciblage.",
        "scale_up": "Tu t'adresses à une ESN en croissance : pense scalabilité, témoignages clients, références sectorielles.",
        "enterprise_player": "Tu t'adresses à un grand groupe ESN : multi-contacts, multi-entités, vision long terme.",
    }.get(archetype, "Tu t'adresses à un commercial ESN expérimenté.")

    return f"""{FRENCH_STYLE_DIRECTIVE}\n\nTu es l'assistant commercial IA de {esn_name}, une ESN française spécialisée en {offers_str}.

TON RÔLE : Produire un résumé exécutif ultra-personnalisé d'une analyse compte. 5 à 7 lignes maximum. Ton = directif, concret, aucun blabla.

{archetype_calibration}

RÈGLES ABSOLUES :
- L'action immédiate DOIT être un verbe + un nom + un canal ("Envoyez le message LinkedIn à Benoît Tiers")
- Le résumé doit parler à quelqu'un qui connaît déjà le secteur — pas de définitions
- Le score ajusté tient compte de la compatibilité avec {offers_str}
- Zéro généralité, que du spécifique à ce compte

SORTIE : JSON valide uniquement, aucun texte avant ou après."""


def build_user_prompt(
    raw_analysis: dict,
    profile: dict,
    company_name: str,
) -> str:
    offers = profile.get("core_offers", [])
    offers_str = ", ".join(offers) if isinstance(offers, list) else str(offers)
    geography = profile.get("geography", "France")

    return f"""Génère un résumé exécutif pour le compte suivant.

COMPTE : {company_name}
OFFRES ESN : {offers_str}
GÉOGRAPHIE : {geography}

ANALYSE COMPLÈTE :
{raw_analysis}

SORTIE JSON ATTENDUE :
{{
  "summary": "5-7 lignes percutantes sur ce compte. Ce qui le rend intéressant, ce qui est risqué, l'angle d'attaque recommandé. Pas de généralités.",
  "immediate_action": "Verbe + nom + canal. Ex: 'Envoyez un message LinkedIn à [Contact] en mentionnant [signal récent]'",
  "key_contact": "Nom et poste du contact prioritaire",
  "entry_angle": "En 1 phrase : pourquoi entrer maintenant et par où",
  "adjusted_score": 7.5,
  "score_rationale": "Pourquoi ce score plutôt que celui de l'analyse brute",
  "time_to_first_meeting_estimate": "2-4 semaines"
}}"""
