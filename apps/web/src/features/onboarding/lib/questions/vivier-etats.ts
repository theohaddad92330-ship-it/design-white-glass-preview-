import { VIVIER_COUNT_BAND_CHOICES } from '@bellum/contracts'
import type { SubStep } from './types'
import { choice } from './types'

/**
 * // Théo O onboarding-couverture.R3 (22/10/2026) — V23 : « vivier accessible dès la création ; historique de société non
 * requis ». Le masquage `hasNoCommercialHistory` (#2548.1) est RETIRÉ : une activité en création peut déjà avoir un vivier.
 * Les réponses déjà données restent en base (on archive, on ne supprime pas).
 */
/**
 * Sous-étape `vivier-etats` du stage `company_info` — #2046.11 → .14.
 *
 * Les quatre états DÉFINIS au contrat (`TALENT_POOL_STATES`,
 * `answers-vivier.ts`), jamais quatre libellés d'écran réinventés ici : le
 * mot « présentable » de cette question et celui que lira un jour un écran de
 * vivier doivent rester le même mot.
 *
 * ⚠️ #2046.14 — un CV n'est pas une candidature prête. Confondre les quatre
 * états, c'est promettre au client un consultant qu'on n'a pas.
 *
 * #2548.1 — ces quatre bandes portent déjà un `'0'` honnête
 * (`VIVIER_COUNT_BAND_CHOICES`), mais redemander « combien sont intéressés/
 * disponibles/sécurisés/présentables » à une activité en création revient à
 * reposer, quatre fois, une question dont `vivier-comptage` (masquée pour le
 * même motif) a déjà la réponse : zéro. Masquées ensemble.
 */
export const vivierEtatsStep: SubStep = {
  slug: 'vivier-etats',
  questions: [
    {
      key: 'talent_pool_state_interested_band',
      kind: 'single',
      label: 'questions.talentPoolStateInterestedBand.label',
      subtitle: 'questions.talentPoolStateInterestedBand.subtitle',
      choices: choice(...VIVIER_COUNT_BAND_CHOICES),
    },
    {
      key: 'talent_pool_state_available_band',
      kind: 'single',
      label: 'questions.talentPoolStateAvailableBand.label',
      subtitle: 'questions.talentPoolStateAvailableBand.subtitle',
      choices: choice(...VIVIER_COUNT_BAND_CHOICES),
    },
    {
      key: 'talent_pool_state_secured_band',
      kind: 'single',
      label: 'questions.talentPoolStateSecuredBand.label',
      subtitle: 'questions.talentPoolStateSecuredBand.subtitle',
      choices: choice(...VIVIER_COUNT_BAND_CHOICES),
    },
    {
      // #2046.14 — un CV n'est pas une candidature prête.
      key: 'talent_pool_state_presentable_band',
      kind: 'single',
      label: 'questions.talentPoolStatePresentableBand.label',
      subtitle: 'questions.talentPoolStatePresentableBand.subtitle',
      choices: choice(...VIVIER_COUNT_BAND_CHOICES),
    },
  ],
}
