import type { SubStep } from './types'
import { choice } from './types'

/**
 * Sous-étape `responsabilites-autorite` du stage `role` — #2033.5 / #2033.6 /
 * #2033.7 (D3, décision Louis 18/09/2026).
 *
 * Les trois questions posent la MÊME échelle fermée à trois valeurs
 * (`ESN_ANSWER_OPTIONS.recruitment_accounts_authority` /
 * `.staffing_authority` / `.margin_billing_authority`, miroir de
 * `AUTHORITY_SCALE_CHOICES`, `authority-scope.ts`) — c'est la valeur EXACTE
 * que lit la fonction de gate #2033.9 : « Je n'ai pas cette responsabilité »
 * fait sortir la catégorie de ce que Laura propose, jamais des droits réels.
 */
export const responsabilitesAutoriteStep: SubStep = {
  slug: 'responsabilites-autorite',
  questions: [
    {
      key: 'recruitment_accounts_authority',
      kind: 'single',
      label: 'questions.recruitmentAccountsAuthority.label',
      subtitle: 'questions.recruitmentAccountsAuthority.subtitle',
      choices: choice('Je décide seul', 'Je dois faire valider', "Je n'ai pas cette responsabilité"),
    },
    {
      key: 'staffing_authority',
      kind: 'single',
      label: 'questions.staffingAuthority.label',
      subtitle: 'questions.staffingAuthority.subtitle',
      choices: choice('Je décide seul', 'Je dois faire valider', "Je n'ai pas cette responsabilité"),
    },
    {
      key: 'margin_billing_authority',
      kind: 'single',
      label: 'questions.marginBillingAuthority.label',
      subtitle: 'questions.marginBillingAuthority.subtitle',
      choices: choice('Je décide seul', 'Je dois faire valider', "Je n'ai pas cette responsabilité"),
    },
  ],
}
