import type { SubStep } from './types'
import { choice } from './types'

/**
 * Sous-étape `cadrage-laura` du stage `role` — Théo O onboarding-couverture (22/10/2026) : « Précisions de cadrage » de la V23
 * (autonomy, context_policy). Toutes FACULTATIVES (`optional`) et portent les quatre états d'incertitude (`allowUnknown`) : une déclaration ne
 * connecte aucun outil, ne vaut pas autorisation d'envoi et n'invente rien à la place de la personne.
 */
export const cadrageLauraStep: SubStep = {
  slug: 'cadrage-laura',
  questions: [
    {
      key: 'autonomy',
      kind: 'single',
      label: 'questions.autonomy.label',
      subtitle: 'questions.autonomy.subtitle',
      choices: choice(
        'Conseils et préparations, sans action externe',
        'Préparer puis me faire valider les actions externes',
        'Étudier une délégation limitée pour certains usages',
      ),
      optional: true,
      allowUnknown: true,
    },
    {
      key: 'context_policy',
      kind: 'single',
      label: 'questions.contextPolicy.label',
      subtitle: 'questions.contextPolicy.subtitle',
      choices: choice('Avec mon activité comme contexte', 'En mode Neutre, sans préférences implicites'),
      optional: true,
      allowUnknown: true,
    },
  ],
}
