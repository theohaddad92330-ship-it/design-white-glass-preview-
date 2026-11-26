import { WEEKLY_SALES_TIME_BANDS } from '@bellum/contracts'
import type { SubStep } from './types'
import { choice } from './types'

/**
 * Sous-étape `temps` du stage `company_info` — lot L19 (#2050).
 *
 * LA CAPACITÉ RÉELLE, pas l'effectif théorique. `consultant_size` et
 * `sales_team_size` disent combien l'ESN compte de têtes ; aucune question ne
 * disait ce que la personne peut RÉELLEMENT engager dans une semaine.
 *
 * ⚠️ TROIS QUESTIONS, PAS UNE (#2050.11 / #2050.12 / #2050.13). C'est le sujet
 * où la tentation du chiffre faux est maximale : « je consacre 5 h par semaine à
 * la prospection » est presque toujours le temps ANNONCÉ, rarement celui qui
 * TIENT, et jamais celui qui RESTE une fois la semaine mangée. Un plan d'action
 * bâti sur le premier nombre n'est jamais tenu. Les trois états sont donc
 * DÉCLARÉS séparément, et le résiduel n'est pas calculé par soustraction — une
 * soustraction sur une bande absente rendrait un nombre que personne n'a dit
 * (« non mesuré n'est jamais 0 »).
 *
 * Les bandes viennent de `@bellum/contracts` (`WEEKLY_SALES_TIME_BANDS`), pas
 * d'un littéral recopié trois fois : une borne de tranche vit à UN seul endroit
 * (GA-26), sinon les trois états deviennent incomparables au premier ajustement.
 */
export const tempsStep: SubStep = {
  slug: 'temps',
  questions: [
    {
      // #2050.1 / #2050.11 — le temps ANNONCÉ.
      key: 'weekly_sales_time_declared',
      kind: 'single',
      label: 'questions.weeklySalesTimeDeclared.label',
      subtitle: 'questions.weeklySalesTimeDeclared.subtitle',
      choices: choice(...WEEKLY_SALES_TIME_BANDS),
    },
    {
      // #2050.12 — le temps réellement PROTÉGÉ.
      key: 'weekly_sales_time_protected',
      kind: 'single',
      label: 'questions.weeklySalesTimeProtected.label',
      subtitle: 'questions.weeklySalesTimeProtected.subtitle',
      choices: choice(...WEEKLY_SALES_TIME_BANDS),
    },
    {
      // #2050.13 — le temps RÉSIDUEL.
      key: 'weekly_sales_time_residual',
      kind: 'single',
      label: 'questions.weeklySalesTimeResidual.label',
      subtitle: 'questions.weeklySalesTimeResidual.subtitle',
      choices: choice(...WEEKLY_SALES_TIME_BANDS),
    },
  ],
}
