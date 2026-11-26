import type { SubStep } from './types'
import { choice } from './types'

/** Sous-étape `equipe-commerciale` du stage `company_info`. */
export const equipeCommercialeStep: SubStep = {
  slug: 'equipe-commerciale',
  questions: [
    {
      key: 'sales_team_size',
      kind: 'single',
      label: 'questions.salesTeamSize.label',
      subtitle: 'questions.salesTeamSize.subtitle',
      choices: choice(
        'Je suis seul (fondateur / indépendant)',
        '2-3 personnes',
        '4-8 personnes',
        '8-15 personnes',
        '15+ personnes',
        "Je n'ai pas d'équipe commerciale dédiée",
      ),
    },
  ],
}
