import type { Choice, SubStep } from './types'
import { choice } from './types'

/**
 * // Théo O onboarding-couverture.R3 (22/10/2026) — V23 : « vivier accessible dès la création ; historique de société non
 * requis ». Le masquage `hasNoCommercialHistory` (#2548.1) est RETIRÉ : une activité en création peut déjà avoir un vivier.
 * Les réponses déjà données restent en base (on archive, on ne supprime pas).
 */
/**
 * Sous-étape `vivier-collecte` du stage `company_info` — #2046.6 → .10.
 *
 * Mobilité, consentement, processus concurrents, engagement réel, fréquence
 * de revalidation — cinq bandes qui disent si le vivier déclaré est
 * EXPLOITABLE, pas seulement combien de profils il contient.
 *
 * ⚠️ `talent_pool_consent_status` (#2046.7) est une donnée de PERSONNE
 * agrégée : elle ne compte QUE combien de profils ont un consentement, elle
 * n'entre dans AUCUN prompt qui note ou classe une personne (c58, GA-06). Le
 * consentement redevient une nouvelle déclaration à chaque correction —
 * `esn_profiles` est versionné, l'ancienne réponse n'est jamais supprimée
 * (« on archive, on ne supprime pas »).
 *
 * `talent_pool_revalidation_frequency` (#2046.10) partage son vocabulaire
 * avec `AVAILABILITY_REVALIDATION_DAYS` (`consultants/matching/pushable.ts`),
 * le seuil déjà tenu par `TalentRoutinesService.availabilityToReconfirm` —
 * même mot pour la même idée de fraîcheur, jamais deux.
 */
const CONSENT_STATUS_CHOICES: Choice[] = [
  { value: 'tous', labelKey: 'questions.talentPoolConsentStatus.choices.tous' },
  { value: 'partiel', labelKey: 'questions.talentPoolConsentStatus.choices.partiel' },
  { value: 'aucun', labelKey: 'questions.talentPoolConsentStatus.choices.aucun' },
  { value: 'ne_sait_pas', labelKey: 'questions.talentPoolConsentStatus.choices.neSaitPas' },
]

const REVALIDATION_FREQUENCY_CHOICES: Choice[] = [
  { value: 'hebdomadaire', labelKey: 'questions.talentPoolRevalidationFrequency.choices.hebdomadaire' },
  { value: 'mensuelle', labelKey: 'questions.talentPoolRevalidationFrequency.choices.mensuelle' },
  { value: 'trimestrielle', labelKey: 'questions.talentPoolRevalidationFrequency.choices.trimestrielle' },
  { value: 'jamais', labelKey: 'questions.talentPoolRevalidationFrequency.choices.jamais' },
]

export const vivierCollecteStep: SubStep = {
  slug: 'vivier-collecte',
  questions: [
    {
      key: 'talent_pool_mobility_band',
      kind: 'single',
      label: 'questions.talentPoolMobilityBand.label',
      choices: choice(
        'Essentiellement locaux',
        'Mobiles en France',
        'Mobiles en Europe ou à l’international',
        'Un mix, non homogène',
      ),
      // #2548.1 — les cinq bandes de `vivier-collecte` supposent un vivier
      // DÉJÀ constitué (aucune ne porte de choix « pas de vivier ») : une
      // activité en création n'a rien à en dire.
    },
    {
      key: 'talent_pool_consent_status',
      kind: 'single',
      label: 'questions.talentPoolConsentStatus.label',
      subtitle: 'questions.talentPoolConsentStatus.subtitle',
      choices: CONSENT_STATUS_CHOICES,
    },
    {
      key: 'talent_pool_other_processes_band',
      kind: 'single',
      label: 'questions.talentPoolOtherProcessesBand.label',
      choices: choice('Aucun à notre connaissance', 'Quelques-uns', 'La plupart sont aussi en process ailleurs'),
    },
    {
      key: 'talent_pool_engagement_reality_band',
      kind: 'single',
      label: 'questions.talentPoolEngagementRealityBand.label',
      choices: choice(
        'Tous engageables immédiatement',
        'Une partie seulement',
        'Peu sont réellement engageables tout de suite',
      ),
    },
    {
      key: 'talent_pool_revalidation_frequency',
      kind: 'single',
      label: 'questions.talentPoolRevalidationFrequency.label',
      choices: REVALIDATION_FREQUENCY_CHOICES,
    },
  ],
}
