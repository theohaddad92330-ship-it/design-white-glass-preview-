import type { Choice, SubStep } from './types'
import { choice } from './types'
import { hasNoCommercialHistory } from './maturite'

/**
 * Sous-étape `base-clients-capitalisation` du stage `company_info` —
 * #2047.7/.8/.9/.11.
 *
 * REX, cas clients exploitables, cross-sell, échéances suivies : ce que la
 * base de clients CAPITALISE, pas seulement ce qu'elle contient.
 *
 * `client_base_case_studies_band` (#2047.8) compte les cas EXPLOITABLES, pas
 * leur contenu — `client_references`/`case_study_results` (Temps 2, lot 26)
 * portent déjà le texte des références.
 *
 * #2548.1 — quatre questions, même motif que `base-clients-activite` : rien à
 * capitaliser sans base de clients. Masquées ensemble pour une activité en
 * création.
 */
const REX_CHOICES: Choice[] = [
  { value: 'systematique', labelKey: 'questions.clientBaseRexBand.choices.systematique' },
  { value: 'parfois', labelKey: 'questions.clientBaseRexBand.choices.parfois' },
  { value: 'jamais', labelKey: 'questions.clientBaseRexBand.choices.jamais' },
]

const CROSS_SELL_CHOICES: Choice[] = [
  { value: 'jamais_tente', labelKey: 'questions.clientBaseCrossSellBand.choices.jamaisTente' },
  { value: 'tente_occasionnellement', labelKey: 'questions.clientBaseCrossSellBand.choices.tenteOccasionnellement' },
  { value: 'pratique_reguliere', labelKey: 'questions.clientBaseCrossSellBand.choices.pratiqueReguliere' },
]

const DEADLINES_CHOICES: Choice[] = [
  { value: 'aucune_connue', labelKey: 'questions.clientBaseDeadlinesBand.choices.aucuneConnue' },
  { value: 'quelques_unes', labelKey: 'questions.clientBaseDeadlinesBand.choices.quelquesUnes' },
  { value: 'la_plupart_suivies', labelKey: 'questions.clientBaseDeadlinesBand.choices.laPlupartSuivies' },
]

export const baseClientsCapitalisationStep: SubStep = {
  slug: 'base-clients-capitalisation',
  questions: [
    {
      key: 'client_base_rex_band',
      kind: 'single',
      label: 'questions.clientBaseRexBand.label',
      subtitle: 'questions.clientBaseRexBand.subtitle',
      choices: REX_CHOICES,
      when: answers => !hasNoCommercialHistory(answers),
    },
    {
      key: 'client_base_case_studies_band',
      kind: 'single',
      label: 'questions.clientBaseCaseStudiesBand.label',
      subtitle: 'questions.clientBaseCaseStudiesBand.subtitle',
      choices: choice('0', '1-5', 'plus de 5'),
      when: answers => !hasNoCommercialHistory(answers),
    },
    {
      key: 'client_base_cross_sell_band',
      kind: 'single',
      label: 'questions.clientBaseCrossSellBand.label',
      choices: CROSS_SELL_CHOICES,
      when: answers => !hasNoCommercialHistory(answers),
    },
    {
      key: 'client_base_deadlines_band',
      kind: 'single',
      label: 'questions.clientBaseDeadlinesBand.label',
      subtitle: 'questions.clientBaseDeadlinesBand.subtitle',
      choices: DEADLINES_CHOICES,
      when: answers => !hasNoCommercialHistory(answers),
    },
  ],
}
