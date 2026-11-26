"""BELLUM-WEEKLY — Briefing du lundi matin."""
from __future__ import annotations

import json
from datetime import date

from app.services.seller_context import seller_archetype


def build_system_prompt(profile: dict) -> str:
    # Resolved ``AnalysisProfileData`` shape (companyName…) with a legacy
    # ``profiles`` fallback — same unified seller context as scoring / analysis.
    esn_name = profile.get("companyName") or profile.get("esn_name") or "votre ESN"
    user_name = profile.get("user_name") or "commercial"
    archetype = seller_archetype(profile) or "boutique_expert"

    motivation_style = {
        "solo_hunter": "Bref, dynamique, comme un coach sportif. Pas de fioritures.",
        "boutique_expert": "Stratégique et précis. Met en avant les opportunités de niche.",
        "mid_market_challenger": "Challenger, donne envie de décrocher le téléphone.",
        "scale_up": "Ambitieux, focus sur la croissance et les indicateurs.",
        "enterprise_player": "Professionnel, orienté pipeline et forecasting.",
    }.get(archetype, "Motivant et actionnable.")

    return f"""Tu es l'assistant commercial IA de {esn_name}.
Tu produis le briefing du lundi matin de {user_name}.

STYLE : {motivation_style}

RÈGLES :
- Top 5 actions = ce qu'il faut faire EN PREMIER cette semaine, dans l'ordre
- Chaque action a une deadline, un canal, un nom de contact
- "why_now" = pourquoi cette action est urgente CETTE semaine spécifiquement
- Le tip doit être actionnable immédiatement (pas une philosophie de vie)
- Les stats doivent être honnêtes — si 0 message envoyé, le dire sans jugement

SORTIE : JSON valide uniquement."""


def build_user_prompt(
    accounts: list[dict],
    pending_actions: list[dict],
    weekly_stats: dict,
    profile: dict,
) -> str:
    user_name = profile.get("user_name", "")
    today = date.today().strftime("%A %d %B %Y")

    accounts_summary = [
        {
            "company": a.get("company_name"),
            "score": a.get("priority_score"),
            "status": a.get("status"),
            "last_signal": a.get("recent_signals", [{}])[0] if a.get("recent_signals") else None,
        }
        for a in accounts[:10]
    ]

    return f"""Génère le briefing du lundi matin.

DATE : {today}
PRÉNOM : {user_name}
COMPTES ACTIFS : {len(accounts)} comptes en pipeline
ACTIONS EN RETARD : {len([a for a in pending_actions if a.get('overdue')])}

COMPTES (résumés) :
{json.dumps(accounts_summary, ensure_ascii=False)}

ACTIONS PENDING :
{json.dumps(pending_actions[:10], ensure_ascii=False)}

STATS DE LA SEMAINE PASSÉE :
{json.dumps(weekly_stats, ensure_ascii=False)}

LECTURE DE messages_sent_breakdown : "verified" = messages réellement expédiés
par Bellum (preuve de livraison). "declared" = le commercial a déclaré les avoir
envoyés lui-même sur LinkedIn — Bellum n'envoie rien sur LinkedIn, c'est du
travail réel mais invérifiable. "unattributed" = historique dont l'origine n'est
pas traçable. Ne présente JAMAIS un envoi déclaré comme une livraison confirmée
et n'invente aucun chiffre : si tu commentes le volume d'envois, appuie-toi sur
le total en distinguant explicitement la part prouvée de la part déclarée.

SORTIE JSON :
{{
  "greeting": "Bonjour {user_name}, [phrase d'accroche motivante adaptée au contexte]",
  "week_summary": "1 phrase sur l'état du pipeline",
  "top_5_actions": [
    {{
      "rank": 1,
      "action": "Ce qu'il faut faire en 1 phrase claire",
      "contact": "Prénom Nom",
      "company": "Nom entreprise",
      "channel": "linkedin | email | phone | meeting",
      "deadline": "Lundi avant midi",
      "why_now": "Pourquoi cette semaine précisément"
    }}
  ],
  "pipeline_status": {{
    "go": 0,
    "pending": 0,
    "nogo": 0,
    "total": 0
  }},
  "weekly_stats": {{
    "messages_sent": 0,
    "responses": 0,
    "response_rate": "0%",
    "analyses_done": 0
  }},
  "tip_of_the_week": "Conseil actionnable en 2 lignes — une technique de prospection ou un insight commercial",
  "focus_account": "Le compte sur lequel concentrer 50% de l'énergie cette semaine avec raison"
}}"""
