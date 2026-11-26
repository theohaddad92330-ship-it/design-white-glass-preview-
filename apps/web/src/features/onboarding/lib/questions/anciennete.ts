import { PROFILE_QUESTION_OPTIONS } from '@bellum/contracts'
import type { SubStep } from './types'
import { choice } from './types'

/**
 * #2018.2 — orientation et expérience, aux côtés du rôle (`role.ts`). Deux
 * questions liées sur un même écran : depuis combien de temps dans CE rôle,
 * depuis combien de temps dans LE MÉTIER — le même patron que `entreprise.ts`
 * (`esn_name` + `consultant_size`).
 */
export const ancienneteStep: SubStep = {
  slug: 'anciennete',
  questions: [
    {
      key: 'role_tenure',
      kind: 'single',
      label: 'profileQuestions.items.role_tenure.label',
      subtitle: 'profileQuestions.items.role_tenure.subtitle',
      choices: choice(...PROFILE_QUESTION_OPTIONS.role_tenure),
    },
    {
      key: 'industry_tenure',
      kind: 'single',
      label: 'profileQuestions.items.industry_tenure.label',
      subtitle: 'profileQuestions.items.industry_tenure.subtitle',
      choices: choice(...PROFILE_QUESTION_OPTIONS.industry_tenure),
    },
  ],
}
