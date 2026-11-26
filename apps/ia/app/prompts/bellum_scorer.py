"""BELLUM-SCORER — Recalcul du score en fonction du profil ESN."""
from __future__ import annotations

from app.services.domain_focus import offers_or_default

from app.services.seller_context import seller_archetype
from app.prompts.style import FRENCH_STYLE_DIRECTIVE


def build_system_prompt(profile: dict) -> str:
    # Read the resolved ``AnalysisProfileData`` shape (companyName / offers /
    # geoZone — the SAME the analysis pipeline personalises on), falling back to
    # the legacy ``profiles`` keys so a caller still passing the old shape stays
    # byte-identical (no hard cutover; both forms supported).
    esn_name = profile.get("companyName") or profile.get("esn_name") or "votre ESN"
    offers = offers_or_default(profile, it_default=["conseil IT"])
    offers_str = ", ".join(offers) if isinstance(offers, list) else str(offers)
    geography = profile.get("geoZone") or profile.get("geography") or "Île-de-France"
    # Explicit archetype wins (legacy); else derived from ``size`` via the same
    # deterministic ladder the dossier uses, so the two agree.
    archetype = seller_archetype(profile) or "boutique_expert"
    avg_deal_size = profile.get("avg_deal_size", "50K-200K€")
    typical_cycle = profile.get("typical_cycle", "3-6 mois")

    size_constraints = {
        "solo_hunter": "Capacité max 2-3 comptes actifs. Préfère les cycles courts < 3 mois et les PME accessibles.",
        "boutique_expert": "Préfère la profondeur sur 4-6 comptes. Cycles 3-9 mois acceptables si le fit offre est fort.",
        "mid_market_challenger": "Peut gérer 8-12 comptes. Bonne tolérance aux cycles longs si le pipeline est équilibré.",
        "scale_up": "Équipe commerciale structurée. Penser en termes de segments, pas de comptes individuels.",
        "enterprise_player": "KAM model. Chaque compte = relationship longue durée. Score basé sur potentiel LTV.",
    }.get(archetype, "Calibrage standard.")

    return f"""{FRENCH_STYLE_DIRECTIVE}\n\nTu es le directeur commercial de {esn_name}, ESN spécialisée en {offers_str}.
Géographie principale : {geography}
Taille de deal habituelle : {avg_deal_size}
Cycle de vente typique : {typical_cycle}

MISSION : Recalculer le score d'un compte en tenant compte de la réalité de CETTE ESN.

{size_constraints}

CRITÈRES DE SCORING (pondération indicative) :
- offer_fit (30%) : Est-ce que nos offres répondent aux besoins détectés ?
- size_compatibility (20%) : La taille du compte est-elle compatible avec notre modèle ?
- geographic_fit (15%) : Le compte est-il dans notre zone de chalandise ?
- cycle_compatibility (20%) : Le cycle de vente estimé correspond-il à notre pipeline ?
- competition_level (15%) : Pouvons-nous gagner face aux ESN déjà en place ?

RECOMMANDATIONS (vocabulaire unifié GO / PRUDENT / STOP) :
- GO : score ≥ 7.0 ET offer_fit ≥ 7 ET au moins 1 contact identifié
- PRUDENT : score 5.0-6.9 OU offer_fit < 7 OU cycle trop long
- STOP : score < 5.0 OU compétition insurmontable OU aucun budget détecté

SORTIE : JSON valide uniquement."""


def build_user_prompt(
    raw_analysis: dict,
    profile: dict,
    company_name: str,
) -> str:
    return f"""Recalcule le score pour {company_name}.

ANALYSE BRUTE :
{raw_analysis}

PROFIL ESN :
{profile}

SORTIE JSON :
{{
  "global_score": 8.5,
  "criteria": {{
    "offer_fit": {{
      "score": 9,
      "reason": "Explication spécifique à CE compte et CES offres"
    }},
    "size_compatibility": {{
      "score": 7,
      "reason": "Explication"
    }},
    "geographic_fit": {{
      "score": 8,
      "reason": "Explication"
    }},
    "cycle_compatibility": {{
      "score": 6,
      "reason": "Explication"
    }},
    "competition_level": {{
      "score": 7,
      "reason": "Explication"
    }}
  }},
  "recommendation": "GO",
  "one_line": "Résumé en 1 phrase — compte prioritaire ou non et pourquoi",
  "next_review_date": "Dans 30 jours si pas de signal",
  "score_delta": "+1.2 vs score brut initial",
  "score_delta_reason": "Pourquoi notre score diffère de l'analyse brute"
}}"""
