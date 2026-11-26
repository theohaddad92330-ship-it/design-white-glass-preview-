"""BELLUM-BATTLECARD — Battle card préparation RDV."""
from __future__ import annotations

from app.services.domain_focus import offers_or_default

import json

from app.knowledge import objection_block


def build_system_prompt(profile: dict) -> str:
    # camelCase d'abord (AnalysisProfileData résolu server-side par l'API), snake_case
    # ensuite (ligne `profiles` legacy) — même robustesse que bellum_icebreaker /
    # bellum_messages. SAMPLE_PROFILE (golden) ne porte que le snake_case → rendu
    # byte-identique, la baseline ne bouge pas.
    esn_name = profile.get("companyName") or profile.get("esn_name") or "votre ESN"
    archetype = profile.get("archetype") or "boutique_expert"
    offers = offers_or_default(profile, it_default=["conseil IT"])
    offers_str = ", ".join(offers) if isinstance(offers, list) else str(offers)
    size_context = profile.get("size") or profile.get("esn_size") or "PME"

    tone_by_archetype = {
        "solo_hunter": "Direct, efficace, comme si tu briefais un associé 5 min avant le call.",
        "boutique_expert": "Expert et précis, mets en avant la spécialisation.",
        "mid_market_challenger": "Challenger audacieux, propose des comparaisons avec les grands.",
        "scale_up": "Ambitieux mais humble, mets en avant la croissance et les références.",
        "enterprise_player": "Professionnel senior, vision stratégique et multi-entités.",
    }.get(archetype, "Professionnel et concret.")

    return f"""Tu es le directeur commercial de {esn_name} ({size_context}).
Tu prépares une battle card pour un RDV commercial. Une page, 10 minutes de lecture max.

OFFRES : {offers_str}
TON : {tone_by_archetype}

PRINCIPES :
- "Ce qu'il ne faut PAS dire" = les pièges que les commerciaux ESN tombent systématiquement
- L'objection probable = celle qui bloquera ce RDV spécifiquement
- La "killer question" = une question qui force le prospect à réfléchir et révèle un besoin caché
- Les accroches doivent mentionner des éléments SPÉCIFIQUES à CE compte (pas génériques)

{objection_block()}

SORTIE : JSON valide uniquement."""


def build_user_prompt(
    raw_analysis: dict,
    contacts: list,
    profile: dict,
    company_name: str,
    competitors: list | None = None,
) -> str:
    primary_contact = contacts[0] if contacts else {}
    # Idem icebreaker : la colonne réelle est `full_name`.
    contact_name = (
        primary_contact.get("full_name")
        or f"{primary_contact.get('first_name', '')} {primary_contact.get('last_name', '')}".strip()
    )
    contact_title = primary_contact.get("title", "Décideur principal")
    offers = profile.get("offers") or profile.get("core_offers") or []

    # Concurrence PRESENT-ONLY : n'injecter que les ESN réellement identifiées sur
    # le compte (raw_analysis.competitors). Bloc vide → la battle card ne parle pas
    # de concurrence et `vs_competitors` reste []. JAMAIS de concurrent inventé.
    competitors = competitors or []
    competitors_block = (
        json.dumps(competitors[:6], ensure_ascii=False, indent=2)
        if competitors
        else "Aucun concurrent identifié dans l'analyse."
    )

    return f"""Prépare la battle card pour un RDV avec {company_name}.

CONTACT PRINCIPAL : {contact_name or "À identifier"} — {contact_title}
OFFRES ESN : {", ".join(offers) if isinstance(offers, list) else str(offers)}

ANALYSE COMPTE :
{raw_analysis}

CONTACTS DISPONIBLES :
{contacts[:5]}

CONCURRENTS / ESN DÉJÀ PRÉSENTES (identifiés dans l'analyse — n'en invente aucun) :
{competitors_block}

SORTIE JSON :
{{
  "company_activity": "Ce que fait concrètement {company_name} en 3 lignes. Pas le jargon corporate — la réalité opérationnelle.",
  "budget_it_estimated": "Estimation basée sur effectifs et signaux détectés",
  "your_contact": {{
    "name": "{contact_name or 'À confirmer'}",
    "title": "{contact_title}",
    "background": "Profil et contexte en 2 lignes"
  }},
  "what_to_say": [
    "Accroche 1 — basée sur signal récent détecté",
    "Accroche 2 — basée sur un défi IT identifié",
    "Accroche 3 — basée sur une opportunité sectorielle"
  ],
  "what_NOT_to_say": [
    "Piège 1 — avec explication de pourquoi c'est un piège",
    "Piège 2",
    "Piège 3"
  ],
  "vs_competitors": [
    {{
      "competitor": "Nom EXACT d'un concurrent listé ci-dessus — jamais inventé",
      "their_strengths": "Ce qu'ils ont pour eux sur CE compte (position, ancrage)",
      "their_weaknesses": "La faille exploitable face à nos offres",
      "our_counter_angle": "Notre angle de contre concret vs ce concurrent"
    }}
  ],
  "probable_objection": {{
    "objection": "L'objection la plus probable pour CE compte",
    "real_meaning": "Ce que le prospect veut vraiment dire derrière cette objection",
    "response": "Comment répondre sans être défensif",
    "mirror_question": "La question miroir qui retourne la situation"
  }},
  "killer_question": "La question qui débloque le RDV — spécifique à ce compte"
}}

RÈGLE STRICTE : si AUCUN concurrent n'est identifié ci-dessus, renvoie "vs_competitors": []. N'invente JAMAIS un concurrent, une force ou une faiblesse non sourcée."""
