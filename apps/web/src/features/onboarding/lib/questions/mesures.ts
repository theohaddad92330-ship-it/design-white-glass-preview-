import { ACTIVITY_MEASURE_VALUES, ACTIVITY_REFERENCE_PERIODS } from '@bellum/contracts'
import type { SubStep } from './types'

/**
 * Sous-étape `mesures` du stage `target_market` — lot L19 (#2049).
 *
 * Deux questions, et elles sont la CONDITION de tout le reste : ce que l'ESN
 * compte réellement, et sur quelle période.
 *
 * Pourquoi on ne demande pas onze nombres (#2049.1 → #2049.11). Un
 * questionnaire d'entrée où l'on tape onze chiffres de tête produit onze
 * chiffres inventés — et un chiffre inventé est pire qu'un chiffre absent,
 * parce qu'il se calcule. Ce qu'on demande est ce que l'utilisateur SAIT :
 * quelles étapes il compte (elles ont chacune leur unité — des comptes, des
 * contacts, des rendez-vous, des démarrages — et ne s'additionnent jamais entre
 * elles, #2049.12), et à quelle période ses chiffres se rapportent. Les
 * volumes eux-mêmes sont déjà posés là où ils ont du sens (`weekly_calls`,
 * `weekly_emails`, `weekly_linkedin`, `portfolio_size`), et un canal sans
 * volume reste « non mesuré » plutôt que zéro (#2048.21).
 *
 * ⚠️ #2049.14 est la doctrine du lot : **aucun taux ne se calcule sans
 * dénominateur fiable.** Ces deux réponses sont exactement ce que
 * `comparableRate` (contracts) exige avant de rendre autre chose que `null` —
 * et `funnelBreak` NOMME l'étape où la chaîne cesse d'être mesurée, sans
 * jamais rendre un pourcentage inventé (#2049.15).
 *
 * GA-26 — les deux catalogues viennent du contrat, jamais recopiés ici.
 */
export const mesuresStep: SubStep = {
  slug: 'mesures',
  questions: [
    {
      // #2049.1 → #2049.11 / #2049.12 — les unités réellement comptées.
      key: 'activity_measures_tracked',
      kind: 'multi',
      label: 'questions.activityMeasuresTracked.label',
      subtitle: 'questions.activityMeasuresTracked.subtitle',
      choices: ACTIVITY_MEASURE_VALUES.map(value => ({ value })),
    },
    {
      // #2049.13 / #2048.13 — la période, ou l'aveu explicite qu'il n'y en a
      // pas. UNE période pour tout le bloc : deux réglages pour la même chose
      // auraient divergé (GA-26).
      key: 'activity_reference_period',
      kind: 'single',
      label: 'questions.activityReferencePeriod.label',
      subtitle: 'questions.activityReferencePeriod.subtitle',
      choices: ACTIVITY_REFERENCE_PERIODS.map(value => ({ value })),
    },
  ],
}
