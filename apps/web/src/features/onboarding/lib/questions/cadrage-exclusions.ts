import type { SubStep } from './types'

/**
 * Sous-étape `cadrage-exclusions` du stage `target_market` — Théo O onboarding-couverture (22/10/2026) : « Précisions de cadrage » de la V23
 * (no_go, account_access). Toutes FACULTATIVES (`optional`) et portent les quatre états d'incertitude (`allowUnknown`) : une déclaration ne
 * connecte aucun outil, ne vaut pas autorisation d'envoi et n'invente rien à la place de la personne.
 */
export const cadrageExclusionsStep: SubStep = {
  slug: 'cadrage-exclusions',
  questions: [
    {
      key: 'no_go',
      kind: 'text',
      label: 'questions.noGo.label',
      subtitle: 'questions.noGo.subtitle',
      optional: true,
      allowUnknown: true,
    },
    {
      key: 'account_access',
      kind: 'text',
      label: 'questions.accountAccess.label',
      subtitle: 'questions.accountAccess.subtitle',
      optional: true,
      allowUnknown: true,
    },
  ],
}
