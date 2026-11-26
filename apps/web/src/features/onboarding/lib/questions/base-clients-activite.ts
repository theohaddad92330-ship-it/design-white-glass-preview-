import { CLIENT_BASE_COUNT_BAND_CHOICES } from '@bellum/contracts'
import type { Choice, SubStep } from './types'
import { choice } from './types'
import { hasNoCommercialHistory } from './maturite'

/**
 * Sous-étape `base-clients-activite` du stage `company_info` — #2047.2 → .6.
 *
 * Missions en cours et terminées, renouvellements, suivi de la satisfaction,
 * recommandations — ce que la base de clients DÉCLARÉE dit de son activité
 * réelle. `client_base_active_accounts_band` (#2047.1) n'est pas ici :
 * `active_clients_band` (sous-étape `sante-activite`) pose déjà cette
 * question, voir `answers-base-clients.ts`.
 *
 * #2548.1 — Ludovic (call bêta 17/09) : « le questionnaire m'a posé des
 * questions sur mes missions passées, mes recommandations clients ». Les
 * cinq questions ici supposent TOUTES une base de clients déjà là — masquées
 * ensemble pour une activité en création (`hasNoCommercialHistory`,
 * `maturite.ts`).
 */
const RENEWALS_CHOICES: Choice[] = [
  { value: 'aucun', labelKey: 'questions.clientBaseRenewalsBand.choices.aucun' },
  { value: 'quelques_uns', labelKey: 'questions.clientBaseRenewalsBand.choices.quelquesUns' },
  { value: 'la_plupart', labelKey: 'questions.clientBaseRenewalsBand.choices.laPlupart' },
]

const SATISFACTION_CHOICES: Choice[] = [
  { value: 'mesuree_bonne', labelKey: 'questions.clientBaseSatisfactionBand.choices.mesureeBonne' },
  { value: 'mesuree_mitigee', labelKey: 'questions.clientBaseSatisfactionBand.choices.mesureeMitigee' },
  { value: 'jamais_mesuree', labelKey: 'questions.clientBaseSatisfactionBand.choices.jamaisMesuree' },
  { value: 'ne_sait_pas', labelKey: 'questions.clientBaseSatisfactionBand.choices.neSaitPas' },
]

const REFERRALS_CHOICES: Choice[] = [
  { value: 'aucune', labelKey: 'questions.clientBaseReferralsBand.choices.aucune' },
  { value: 'quelques_unes', labelKey: 'questions.clientBaseReferralsBand.choices.quelquesUnes' },
  { value: 'regulierement', labelKey: 'questions.clientBaseReferralsBand.choices.regulierement' },
]

export const baseClientsActiviteStep: SubStep = {
  slug: 'base-clients-activite',
  questions: [
    {
      key: 'client_base_missions_ongoing_band',
      kind: 'single',
      label: 'questions.clientBaseMissionsOngoingBand.label',
      choices: choice(...CLIENT_BASE_COUNT_BAND_CHOICES),
      when: answers => !hasNoCommercialHistory(answers),
    },
    {
      key: 'client_base_missions_completed_band',
      kind: 'single',
      label: 'questions.clientBaseMissionsCompletedBand.label',
      choices: choice(...CLIENT_BASE_COUNT_BAND_CHOICES),
      when: answers => !hasNoCommercialHistory(answers),
    },
    {
      key: 'client_base_renewals_band',
      kind: 'single',
      label: 'questions.clientBaseRenewalsBand.label',
      choices: RENEWALS_CHOICES,
      when: answers => !hasNoCommercialHistory(answers),
    },
    {
      key: 'client_base_satisfaction_band',
      kind: 'single',
      label: 'questions.clientBaseSatisfactionBand.label',
      subtitle: 'questions.clientBaseSatisfactionBand.subtitle',
      choices: SATISFACTION_CHOICES,
      when: answers => !hasNoCommercialHistory(answers),
    },
    {
      key: 'client_base_referrals_band',
      kind: 'single',
      label: 'questions.clientBaseReferralsBand.label',
      choices: REFERRALS_CHOICES,
      when: answers => !hasNoCommercialHistory(answers),
    },
  ],
}
