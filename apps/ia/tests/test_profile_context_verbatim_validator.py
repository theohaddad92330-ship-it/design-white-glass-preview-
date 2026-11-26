"""Le `field_validator` qui REFUSE le vouvoiement PRODUIT (R16-1).

`test_welcome_summary_tutoiement.py` prouve que la CONSIGNE commande le
tutoiement dans le schéma envoyé au modèle — ce qu'Instructor transmet
RÉELLEMENT. Ce fichier prouve l'étage d'après, celui que la garde de schéma ne
pouvait pas voir : que Pydantic REFUSE une valeur PRODUITE qui vouvoie quand
même. C'est le seul mécanisme qui transforme la consigne en contrat, puisque
Instructor ne rejoue le tour du modèle que sur une `ValidationError`, jamais
sur une consigne de prompt non suivie
(`.claude/notes/defaut-R16-1-tutoiement-de-la-sortie.md`).

Preuve n°1 : chaque « sait dire NON » ci-dessous rejoue un texte MESURÉ en
production le 15 ou le 16/09/2026 — pas un exemple inventé.
Preuve n°2 : le corpus des champs validés n'est pas vide.
Preuve n°3 : le témoin — `messagingStyle.avoid` (`audience: "external"` dans
`packages/contracts/src/schemas/profile-context-rendered-fields.json`) accepte
le vouvoiement, parce que ce champ décrit ce que le commercial écrit À SON
PROSPECT — le vouvoiement du prospect est l'usage B2B français normal, pas un
défaut. Aucun `field_validator` de tutoiement n'est câblé dessus.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.models.profile_context import (
    BellumPhrases,
    CoachingInsights,
    FirstAnalysisSuggestion,
    MessageLength,
    MessagingStyle,
    MessagingTone,
    ProfileContradiction,
    WelcomeSummary,
)


def _valid_bellum_phrases(**overrides: str) -> dict[str, str]:
    base = {
        "welcome": "Bienvenue, on transforme ton expertise en pipeline.",
        "first_analysis_cta": "Lance une analyse sur une ETI du secteur Industrie.",
        "weekly_summary_intro": "Cette semaine, concentre-toi sur tes ETI.",
        "empty_state": "Ton pipeline est vide, lance ta première analyse.",
        "score_context": "Le score se justifie par ses axes, jamais par une chance.",
    }
    base.update(overrides)
    return base


def _valid_welcome_summary(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "profile_recap": 'Tu es une ESN "Data" de 30 consultants.',
        "searches_personalization": 'Les recherches cibleront en priorité "data" et "cloud".',
        "contacts_personalization": 'Les contacts identifiés seront des "DSI".',
        "messages_personalization": 'Les messages seront rédigés sur un ton "expert direct".',
        "scoring_personalization": "Le scoring évaluera ta couverture stakeholders.",
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Preuve n°2 : le corpus des champs validés n'est pas vide.
# ---------------------------------------------------------------------------


def test_le_corpus_des_validateurs_nest_pas_vide():
    assert {"welcome", "first_analysis_cta", "weekly_summary_intro", "empty_state", "score_context"} <= set(
        BellumPhrases.model_fields
    )


# ---------------------------------------------------------------------------
# Preuve n°1 : le validateur SAIT DIRE NON, sur le texte RÉEL mesuré en prod.
# ---------------------------------------------------------------------------


def test_refuse_profile_recap_mesure_en_production_le_15_09():
    # Révision 25, 15/09/2026 14:23 — le motif exact que la garde de schéma
    # citait déjà comme cause racine de R15N-11, mais que RIEN ne refusait à
    # la PRODUCTION tant qu'aucun field_validator n'existait (R16-1).
    with pytest.raises(ValidationError, match="vouvoiement"):
        WelcomeSummary.model_validate(
            _valid_welcome_summary(
                profile_recap=(
                    'Vous travaillez uniquement avec des "freelances" et votre équipe '
                    "commerciale est de 4-8 personnes."
                )
            )
        )


def test_refuse_scoring_personalization_mesure_en_production_le_16_09():
    with pytest.raises(ValidationError, match="vouvoiement"):
        WelcomeSummary.model_validate(
            _valid_welcome_summary(
                scoring_personalization="Le scoring évaluera vos domaines (cloud, data, cybersécurité)."
            )
        )


def test_refuse_weekly_summary_intro_mesure_en_production_le_16_09():
    # #2062 R16-1 — bellumPhrases.weeklySummaryIntro, HORS de WelcomeSummary :
    # la preuve que le correctif couvre aussi ce que le corpus à 5 champs
    # (avant ce lot) laissait passer.
    with pytest.raises(ValidationError, match="vouvoiement"):
        BellumPhrases.model_validate(
            _valid_bellum_phrases(
                weekly_summary_intro="Cette semaine, on a creusé les stakeholders clés chez vos cibles."
            )
        )


def test_refuse_first_analysis_suggestion_reason_qui_vouvoie():
    with pytest.raises(ValidationError, match="vouvoiement"):
        FirstAnalysisSuggestion.model_validate(
            {
                "company_name": "Société Générale",
                "sector": "Banque",
                "reason": "Votre expertise Kubernetes matche leur stack actuelle.",
            }
        )


def test_refuse_statement_de_contradiction_qui_vouvoie():
    """#2088.34 — la tension que LAURA repère, comme les autres champs
    `audience: "user"`, refuse le vouvoiement produit (même mécanisme R16-1)."""
    with pytest.raises(ValidationError, match="vouvoiement"):
        ProfileContradiction.model_validate(
            {
                "statement": "Vous avez sélectionné dix secteurs prioritaires alors que votre équipe compte deux personnes.",
                "reasoning": "Ça vient de priority_sectors et sales_team_size.",
            }
        )


def test_refuse_reasoning_de_contradiction_qui_vouvoie():
    with pytest.raises(ValidationError, match="vouvoiement"):
        ProfileContradiction.model_validate(
            {
                "statement": "Tu as sélectionné dix secteurs prioritaires alors que ton équipe compte deux personnes.",
                "reasoning": "Ça vient de vos réponses priority_sectors et sales_team_size.",
            }
        )


def test_contradiction_sans_son_reasoning_est_refusee():
    """#2088.34 — pas de tension sans sa raison : `statement` et `reasoning`
    sont REQUIS ensemble (même principe que `orgInfluenceClaim`,
    `packages/shared/schemas/classify.schema.json` — une hypothèse sans
    `reasoning` n'est pas émise)."""
    with pytest.raises(ValidationError):
        ProfileContradiction.model_validate(
            {"statement": "Tu as sélectionné dix secteurs prioritaires alors que ton équipe compte deux personnes."}
        )


def test_refuse_main_weakness_qui_vouvoie():
    with pytest.raises(ValidationError, match="vouvoiement"):
        CoachingInsights.model_validate(
            {
                "main_weakness": "Votre ciblage de comptes manque de précision.",
                "key_advice": "Commence par prioriser 5 comptes cette semaine.",
                "cadence_recommendation": {
                    "analyses_per_week": 5,
                    "messages_per_day": 10,
                    "follow_ups_per_week": 15,
                },
                "kpi_targets": {
                    "accounts_per_month": 10,
                    "rdv_per_month": 3,
                    "conversion_rate_target": "15-25%",
                },
            }
        )


# ---------------------------------------------------------------------------
# Preuve n°3 : le validateur n'attrape pas ce qu'il ne vise pas.
# ---------------------------------------------------------------------------


def test_temoin_le_tutoiement_correct_passe():
    phrases = BellumPhrases.model_validate(_valid_bellum_phrases())
    assert phrases.welcome == _valid_bellum_phrases()["welcome"]


def test_temoin_une_contradiction_tutoyee_et_complete_passe():
    contradiction = ProfileContradiction.model_validate(
        {
            "statement": "Tu as sélectionné dix secteurs prioritaires alors que ton équipe commerciale compte deux personnes.",
            "reasoning": "Ça vient de priority_sectors (10 valeurs) et sales_team_size (2-3 personnes).",
        }
    )
    assert "dix secteurs" in contradiction.statement


def test_temoin_messaging_style_avoid_accepte_le_vouvoiement_du_prospect():
    """`avoid` est `audience: "external"` : il liste des formulations À BANNIR
    dans un message AU PROSPECT, et « à vos côtés » y est une entrée légitime
    (un vouvoiement CITÉ comme donnée, pas commandé par l'app). Aucun
    `field_validator` de tutoiement n'est câblé dessus — le forcer casserait
    cette liste (voir le docstring du module)."""

    style = MessagingStyle.model_validate(
        {
            "tone": MessagingTone.CHALLENGER,
            "message_length": MessageLength.STANDARD,
            "value_proposition_angle": "On accompagne vos équipes data avec des seniors.",
            "differentiation_points": ["Seniors dédiés", "Livraison en 48h", "Zéro sous-traitance"],
            "avoid": ["à vos côtés", "main dans la main", "leader du marché"],
        }
    )
    assert "à vos côtés" in style.avoid
