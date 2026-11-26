"""BELLUM-ACTIVITY — Description concrète de l'activité d'une entreprise."""
from __future__ import annotations

from app.prompts.forbidden_phrasings import DIGITAL_TRANSFORMATION
from app.services.domain_focus import looks_like_it_esn, resolve_domain_focus


def build_system_prompt(profile: dict) -> str:
    offers = profile.get("core_offers", ["conseil IT"])
    offers_str = ", ".join(offers) if isinstance(offers, list) else str(offers)

    if not looks_like_it_esn(profile):
        return _build_neutral_system_prompt(profile)

    return f"""Tu es un expert sectoriel qui aide des commerciaux ESN à comprendre concrètement ce que fait une entreprise.

MISSION : Traduire une analyse corporate en langage opérationnel.

OFFRES ESN À CONNECTER : {offers_str}

PRINCIPES :
- "Transport ferroviaire" devient "15 000 trains/jour, 5 millions de voyageurs, 30 000 km de voies"
- Chaque filiale/entité a une relevance ESN claire : "e.SNCF Solutions = DSI groupe, ~800 projets IT actifs"
- Les "implications IT" = les besoins concrets qui naissent de cette activité
- Les "portes d'entrée" = les points d'accès réalistes pour une ESN
- Les "pièges" = ce que les commerciaux font toujours et qui ne marche pas

RÈGLE ABSOLUE : Aucun jargon corporate. Si tu écris "{DIGITAL_TRANSFORMATION}" sans exemple concret derrière, recommence.

SORTIE : JSON valide uniquement."""


def _build_neutral_system_prompt(profile: dict) -> str:
    """Vendeur non-IT (#3673) : ni offre « conseil IT » par défaut, ni DSI en exemple.

    Le vocabulaire IT reste réservé au vendeur IT (chemin historique, golden).
    """
    offers = profile.get("core_offers") or profile.get("offers") or []
    offers_str = ", ".join(offers) if isinstance(offers, list) else str(offers)
    offers_line = offers_str or "celles que le vendeur propose (non précisées : n'en suppose aucune)"

    return f"""Tu es un expert sectoriel qui aide des commerciaux de sociétés de services, de conseil et d'ingénierie à comprendre concrètement ce que fait une entreprise.

MISSION : Traduire une analyse corporate en langage opérationnel.

OFFRES À CONNECTER : {offers_line}

PRINCIPES :
- "Transport ferroviaire" devient "15 000 trains/jour, 5 millions de voyageurs, 30 000 km de voies"
- Chaque filiale/entité a une pertinence claire pour les offres ci-dessus : l'entité qui porte les projets, pas le groupe entier par défaut
- Les "implications" = les besoins concrets qui naissent de cette activité, dans le métier du vendeur
- Les "portes d'entrée" = les points d'accès réalistes pour le vendeur
- Les "pièges" = ce que les commerciaux font toujours et qui ne marche pas

RÈGLE ABSOLUE : Aucun jargon corporate. Si tu écris "{DIGITAL_TRANSFORMATION}" sans exemple concret derrière, recommence.

SORTIE : JSON valide uniquement."""


def build_user_prompt(
    raw_analysis: dict,
    company_name: str,
    *,
    profile_data: dict | None = None,
) -> str:
    """Ce prompt n'importait PAS ``domain_focus`` : il annonçait « DÉFIS IT
    IDENTIFIÉS » quel que soit le métier du vendeur, y compris à une société de
    conseil en ingénierie dont les défis ne sont pas informatiques.

    ``profile_data`` est un mot-clé OPTIONNEL : un appelant qui ne le passe pas
    retombe sur la lentille IT historique, et le prompt reste byte-identique.
    """
    lens = resolve_domain_focus(profile_data)
    challenge_label = (lens.get("challenge_label") or "IT").upper()
    business_desc = raw_analysis.get("business_description", "")
    entities = raw_analysis.get("entities_exhaustive", raw_analysis.get("entities", []))
    subsidiaries = raw_analysis.get("subsidiaries", [])
    it_challenges = raw_analysis.get("it_challenges", [])

    return f"""Décris concrètement l'activité de {company_name} pour un commercial ESN.

DESCRIPTION BRUTE : {business_desc}
ENTITÉS : {entities}
FILIALES : {subsidiaries}
DÉFIS {challenge_label} IDENTIFIÉS : {it_challenges}

SORTIE JSON :
{{
  "company_name": "{company_name}",
  "concrete_activity": "Ce que fait l'entreprise en langage opérationnel. Chiffres réels, pas de jargon. 3-5 phrases.",
  "scale_indicators": {{
    "employees": "Chiffre si connu",
    "revenue": "CA si connu",
    "sites": "Nombre de sites/agences si pertinent",
    "daily_operations": "Chiffre clé opérationnel (ex: X transactions/jour)"
  }},
  "entities": [
    {{
      "name": "Nom de l'entité",
      "activity": "Ce que fait cette entité concrètement",
      "size_hint": "Taille/importance relative",
      "relevance_for_esn": "Pourquoi un commercial ESN devrait s'y intéresser",
      "it_budget_hint": "Estimation du budget IT de cette entité si déductible"
    }}
  ],
  "it_implications": "Quels besoins IT cette activité génère concrètement. Pas de liste générique — besoins SPÉCIFIQUES à cette entreprise.",
  "entry_points": [
    {{
      "entity": "Nom entité",
      "reason": "Pourquoi entrer par là",
      "how": "Comment concrètement"
    }}
  ],
  "traps_to_avoid": [
    "Piège 1 — avec exemple concret de ce qui ne marche pas",
    "Piège 2"
  ]
}}"""
