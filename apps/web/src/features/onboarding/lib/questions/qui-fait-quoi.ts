import {
  ASSOCIATES_COUNT_BAND,
  DELIVERY_TEAM_SIZE_BAND,
  MARKETING_TEAM_SIZE_BAND,
  OPS_TEAM_SIZE_BAND,
  RECRUITERS_TEAM_SIZE_BAND,
  TEAM_COORDINATION_MODE,
} from '@bellum/contracts'
import { worksAlone } from '@bellum/contracts'
import type { SubStep } from './types'
import { choice } from './types'

/**
 * Sous-étape `qui-fait-quoi` du stage `role` — #2037.1 / #2037.3 / #2037.4 /
 * #2037.5 / #2037.6 / #2037.11 (lot EE, 18/09/2026).
 *
 * `sales_team_size` (`equipe-commerciale.ts`) compte les commerciaux ; rien
 * d'autre ne comptait les associés, les recruteurs, le delivery, le marketing
 * ou les ops, ni ne demandait COMMENT l'équipe se coordonne. Décision Louis
 * 18/09 : une tranche suffit partout, jamais un champ numérique libre.
 *
 * #2037.12 — masquée en entier pour une personne SEULE
 * (`worksAlone(answers)`, même fonction que `sales_team_size` lit déjà) :
 * un indépendant sans équipe commerciale n'a par construction ni recruteur
 * ni delivery ni marketing dédiés à compter.
 */
export const quiFaitQuoiStep: SubStep = {
  slug: 'qui-fait-quoi',
  questions: [
    {
      key: 'associates_count',
      kind: 'single',
      label: 'questions.associatesCount.label',
      subtitle: 'questions.associatesCount.subtitle',
      choices: choice(...ASSOCIATES_COUNT_BAND),
      when: answers => !worksAlone(answers),
    },
    {
      key: 'recruiters_team_size',
      kind: 'single',
      label: 'questions.recruitersTeamSize.label',
      subtitle: 'questions.recruitersTeamSize.subtitle',
      choices: choice(...RECRUITERS_TEAM_SIZE_BAND),
      when: answers => !worksAlone(answers),
    },
    {
      key: 'delivery_team_size',
      kind: 'single',
      label: 'questions.deliveryTeamSize.label',
      subtitle: 'questions.deliveryTeamSize.subtitle',
      choices: choice(...DELIVERY_TEAM_SIZE_BAND),
      when: answers => !worksAlone(answers),
    },
    {
      key: 'marketing_team_size',
      kind: 'single',
      label: 'questions.marketingTeamSize.label',
      subtitle: 'questions.marketingTeamSize.subtitle',
      choices: choice(...MARKETING_TEAM_SIZE_BAND),
      when: answers => !worksAlone(answers),
    },
    {
      key: 'ops_team_size',
      kind: 'single',
      label: 'questions.opsTeamSize.label',
      subtitle: 'questions.opsTeamSize.subtitle',
      choices: choice(...OPS_TEAM_SIZE_BAND),
      when: answers => !worksAlone(answers),
    },
    {
      key: 'team_coordination_mode',
      kind: 'single',
      label: 'questions.teamCoordinationMode.label',
      subtitle: 'questions.teamCoordinationMode.subtitle',
      choices: choice(...TEAM_COORDINATION_MODE),
      when: answers => !worksAlone(answers),
    },
  ],
}
