import type { SubStep } from './types'
import { choice } from './types'

/**
 * Sous-étape `cadrage-economie` du stage `offer_expertise` — Théo O onboarding-couverture (22/10/2026) : « Précisions de cadrage » de la V23
 * (commercial_limits, currency). Toutes FACULTATIVES (`optional`) et portent les quatre états d'incertitude (`allowUnknown`) : une déclaration ne
 * connecte aucun outil, ne vaut pas autorisation d'envoi et n'invente rien à la place de la personne.
 */
export const cadrageEconomieStep: SubStep = {
  slug: 'cadrage-economie',
  questions: [
    {
      key: 'commercial_limits',
      kind: 'text',
      label: 'questions.commercialLimits.label',
      subtitle: 'questions.commercialLimits.subtitle',
      optional: true,
      allowUnknown: true,
    },
    {
      key: 'currency',
      kind: 'single',
      label: 'questions.currency.label',
      subtitle: 'questions.currency.subtitle',
      choices: choice('EUR', 'CHF', 'GBP', 'USD', 'CAD', 'Autre devise'),
      optional: true,
      allowUnknown: true,
    },
  ],
}
