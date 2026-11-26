"""BELLUM-COMPARE — Comparaison et priorisation de comptes."""

from __future__ import annotations

from app.services.domain_focus import offers_or_default

import json

#: #4287.1 — les six questions de toute recommandation de compte (laura_recommendation_guardrails), ÉTIQUETÉES
#: par compte dans la comparaison : pourquoi ce compte, le moment, le périmètre, la personne, la preuve, l'action.
SIX_QUESTION_KEYS: tuple[str, ...] = ("pourquoi", "moment", "perimetre", "personne", "preuve", "prochaine_action")


def build_system_prompt(profile: dict) -> str:
    # camelCase d'abord (AnalysisProfileData résolu server-side par l'API), snake_case
    # ensuite (legacy) — même robustesse qu'icebreaker/messages. Le golden n'utilise
    # que le snake_case → rendu byte-identique.
    esn_name = profile.get("companyName") or profile.get("esn_name") or "votre ESN"
    offers = offers_or_default(profile, it_default=["conseil IT"])
    offers_str = ", ".join(offers) if isinstance(offers, list) else str(offers)
    archetype = profile.get("archetype") or "boutique_expert"
    capacity = {
        "solo_hunter": 2,
        "boutique_expert": 4,
        "mid_market_challenger": 6,
        "scale_up": 10,
        "enterprise_player": 20,
    }.get(archetype, 5)

    return f"""Tu es le directeur commercial de {esn_name}, spécialisée en {offers_str}.
Tu as une capacité à gérer ~{capacity} comptes actifs simultanément.

MISSION : Comparer plusieurs comptes analysés et recommander UNE priorisation claire.

CRITÈRES DE PRIORISATION (par ordre d'importance) :
1. Fit offre — est-ce que nos offres répondent à leurs besoins identifiés ?
2. Accessibilité — avons-nous des contacts identifiés ? Un angle d'entrée ?
3. Urgence — y a-t-il un signal d'achat récent ?
4. Cycle — est-ce compatible avec notre horizon temporel ?
5. Compétition — sommes-nous en position favorable face aux ESN en place ?

RÈGLE : Recommande un % d'allocation de temps par compte. Le total doit faire 100%.

VERDICT (#2303.24-.27) — en plus de la priorisation par compte, nomme quatre choses :
- le choix principal, et pourquoi ;
- un choix de remplacement, et pourquoi ;
- un compte à éviter pour le moment, si un compte le justifie (sinon `null`, jamais inventé) ;
- l'information qui pourrait changer le classement si elle devenait connue.

SIX QUESTIONS ET RELATION (#4287.1, #4289.2) — pour CHAQUE compte, `questions` répond aux six questions d'une
recommandation, chacune sous son étiquette : pourquoi ce compte, le moment, le périmètre exact (compte, filiale ou
BU), la personne (nom + rôle, jamais un titre seul), la preuve (fait daté et sourcé), la prochaine action. Une
réponse qui manque se dit (« non établi : … »), jamais comblée. `relation` est une dimension À PART, explicite : la
relation connue de l'espace avec le compte (client, partenaire, rang 2, aucune) lue dans les ANALYSES, sinon `null` —
jamais inventée, jamais laissée implicite dans `strengths`.
Aucun pourcentage ni jauge de chance : une raison textuelle, jamais un chiffre de probabilité.
SORTIE : JSON valide uniquement."""


def _normalization_block(normalization: dict | None) -> str:
    """#2293.8 / .9 — les cinq axes calculés EN CODE, et la consigne qui va avec.

    Absent (anciens appelants, banc d'évaluation) ⇒ chaîne vide : le prompt reste
    byte-identique.
    """
    if not normalization:
        return ""
    rows = json.dumps(normalization.get("normalization") or [], ensure_ascii=False, indent=2)
    equal = normalization.get("comparable_on_equal_footing")
    warning = (
        ""
        if equal
        else (
            "\nATTENTION : ces dossiers n'ont PAS la même profondeur (champ `depth`). Ne compare pas "
            "un compte « solide » à un compte « mince » ou « non_mesure » comme si leurs scores avaient "
            "la même qualité : dis-le dans `reasoning`, et ne place pas un compte mince en tête sur la "
            "seule foi de son score.\n"
        )
    )
    return f"""
NORMALISATION (calculée en code, ne la réécris pas) — périmètre, couverture, preuves, axes, fraîcheur :
{rows[:4000]}
{warning}
Une valeur `null` est NON MESURÉE, jamais zéro. Cite les inconnues (`unknowns`) qui pèsent sur ta priorisation.
"""


def build_user_prompt(
    analyses: list[dict],
    profile: dict,
    normalization: dict | None = None,
) -> str:
    companies = [a.get("company_name", f"Compte {i + 1}") for i, a in enumerate(analyses)]
    offers = profile.get("offers") or profile.get("core_offers") or []

    analyses_json = json.dumps(analyses, ensure_ascii=False, indent=2)

    return f"""Compare ces {len(analyses)} comptes et recommande une priorisation.

COMPTES À COMPARER : {", ".join(companies)}
OFFRES ESN : {", ".join(offers) if isinstance(offers, list) else str(offers)}

ANALYSES :
{analyses_json[:8000]}
{_normalization_block(normalization)}
SORTIE JSON :
{{
  "comparison": [
    {{
      "company": "Nom",
      "adjusted_score": 8.5,
      "strengths": ["Point fort 1", "Point fort 2"],
      "risks": ["Risque 1", "Risque 2"],
      "estimated_cycle": "3-6 mois",
      "key_contact": "Nom du contact prioritaire",
      "relation": "Relation connue de l'espace avec ce compte, ou null",
      "questions": {{
        "pourquoi": "Pourquoi ce compte",
        "moment": "Pourquoi maintenant",
        "perimetre": "Compte, filiale ou BU visé",
        "personne": "Interlocuteur nommé et son rôle",
        "preuve": "Fait daté et sourcé",
        "prochaine_action": "Le geste concret suivant"
      }},
      "recommendation": "GO | NO-GO | PRUDENT | GO RAPIDE"
    }}
  ],
  "priority_order": ["Entreprise 1", "Entreprise 2", "Entreprise 3"],
  "reasoning": "Explication de la priorisation en 3-5 lignes",
  "weekly_time_allocation": {{
    "Entreprise 1": "40%",
    "Entreprise 2": "35%",
    "Entreprise 3": "25%"
  }},
  "quick_win": "Le compte sur lequel agir CETTE SEMAINE avec explication",
  "main_choice": "Nom + raison courte",
  "fallback_choice": "Nom + raison courte",
  "avoid_for_now": "Nom + raison courte, ou null si aucun compte n'est à éviter",
  "would_change_ranking": "L'information dont l'obtention changerait ce classement, ou null"
}}"""
