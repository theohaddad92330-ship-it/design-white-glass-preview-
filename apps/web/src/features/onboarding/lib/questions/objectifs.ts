import { PROFILE_QUESTION_OPTIONS } from '@bellum/contracts'
import type { SubStep } from './types'
import { choice } from './types'

/**
 * #2018.4 — objectifs et préférences. Stage `goals` (`stepper.steps.goals`),
 * câblé pour de bon : même situation que `role.ts`, le libellé de l'étape
 * existait dans le stepper sans question Temps-1 pour la remplir
 * (`ONBOARDING_RESULT_STEPS`, `stageCodes: []`).
 *
 * Réutilise le catalogue et le libellé du profil progressif
 * (`PROFILE_QUESTION_OPTIONS.individual_goal`/`monthly_target`,
 * `profileQuestions.items.*`) — même raison qu'en `role.ts`.
 */
export const objectifsStep: SubStep = {
  slug: 'objectifs',
  questions: [
    {
      key: 'individual_goal',
      kind: 'single',
      label: 'profileQuestions.items.individual_goal.label',
      subtitle: 'profileQuestions.items.individual_goal.subtitle',
      choices: choice(...PROFILE_QUESTION_OPTIONS.individual_goal),
    },
    {
      key: 'monthly_target',
      kind: 'single',
      label: 'profileQuestions.items.monthly_target.label',
      subtitle: 'profileQuestions.items.monthly_target.subtitle',
      choices: choice(...PROFILE_QUESTION_OPTIONS.monthly_target),
    },
  ],
}
