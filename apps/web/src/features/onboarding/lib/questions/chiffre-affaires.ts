import { ANNUAL_REVENUE_PERIODS } from '@bellum/contracts'
import type { SubStep } from './types'
import { answered } from './visibility'

/**
 * #2088.12/.13 (DÉCISION Louis 18/09/2026, point 16) — le chiffre d'affaires
 * annuel, le second vrai NOMBRE du questionnaire, et sa PÉRIODE.
 *
 * Question ENTIÈREMENT NOUVELLE : aucune tranche de chiffre d'affaires
 * n'existait avant ce lot (contrairement à `consultant_count`, additif à
 * `consultant_size`, `entreprise.ts`).
 *
 * `annual_revenue_period` n'est posée QUE si un montant a déjà été saisi
 * (`when`) : #2088.13 dit qu'une période SANS montant ne veut, elle non plus,
 * rien dire — la poser d'office la ferait répondre pour rien à qui laisse le
 * montant vide. `optional: true` sur les DEUX : ce chiffre reste facultatif,
 * comme `consultant_count`, jamais un blocage de « Continuer ».
 */
export const chiffreAffairesStep: SubStep = {
  slug: 'chiffre-affaires',
  questions: [
    {
      key: 'annual_revenue_amount',
      kind: 'number',
      label: 'questions.annualRevenueAmount.label',
      subtitle: 'questions.annualRevenueAmount.subtitle',
      unitKey: 'questions.annualRevenueAmount.unit',
      optional: true,
    },
    {
      key: 'annual_revenue_period',
      kind: 'single',
      label: 'questions.annualRevenuePeriod.label',
      subtitle: 'questions.annualRevenuePeriod.subtitle',
      choices: ANNUAL_REVENUE_PERIODS.map(value => ({ value })),
      optional: true,
      when: answers => answered(answers.annual_revenue_amount),
    },
  ],
}
