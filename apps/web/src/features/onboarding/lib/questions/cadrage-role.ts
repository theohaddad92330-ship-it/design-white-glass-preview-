import type { SubStep } from './types'
import { choice } from './types'

const SCOPE_WITH_NAME: readonly string[] = ['Mon agence / ma BU', 'Mon entreprise', 'Mon groupe']

/**
 * Sous-étape `cadrage-role` du stage `role` — Théo O onboarding-couverture (22/10/2026) : « Précisions de cadrage » de la V23
 * (first_name, scope_level, scope_unit). Toutes FACULTATIVES (`optional`) et portent les quatre états d'incertitude (`allowUnknown`) : une déclaration ne
 * connecte aucun outil, ne vaut pas autorisation d'envoi et n'invente rien à la place de la personne.
 */
export const cadrageRoleStep: SubStep = {
  slug: 'cadrage-role',
  questions: [
    {
      key: 'first_name',
      kind: 'text',
      label: 'questions.firstName.label',
      subtitle: 'questions.firstName.subtitle',
      optional: true,
      allowUnknown: true,
    },
    {
      key: 'scope_level',
      kind: 'single',
      label: 'questions.scopeLevel.label',
      subtitle: 'questions.scopeLevel.subtitle',
      choices: choice(
        'Mon activité individuelle',
        'Mon portefeuille',
        'Mon agence / ma BU',
        'Mon entreprise',
        'Mon groupe',
      ),
      optional: true,
      allowUnknown: true,
    },
    {
      key: 'scope_unit',
      kind: 'text',
      label: 'questions.scopeUnit.label',
      subtitle: 'questions.scopeUnit.subtitle',
      // V23 : le nom du périmètre n'a de sens que pour une agence, une BU, une entreprise ou un groupe.
      when: answers => typeof answers.scope_level === 'string' && SCOPE_WITH_NAME.includes(answers.scope_level),
      optional: true,
      allowUnknown: true,
    },
  ],
}
