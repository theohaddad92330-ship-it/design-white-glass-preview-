import type { SubStep } from './types'
import { choice } from './types'

/**
 * Sous-étape `cadrage-cibles` du stage `target_market` — Théo O onboarding-couverture (22/10/2026) : « Précisions de cadrage » de la V23
 * (target_nature, target_size). Toutes FACULTATIVES (`optional`) et portent les quatre états d'incertitude (`allowUnknown`) : une déclaration ne
 * connecte aucun outil, ne vaut pas autorisation d'envoi et n'invente rien à la place de la personne.
 */
export const cadrageCiblesStep: SubStep = {
  slug: 'cadrage-cibles',
  questions: [
    {
      key: 'target_nature',
      kind: 'multi',
      label: 'questions.targetNature.label',
      subtitle: 'questions.targetNature.subtitle',
      choices: choice(
        'Clients finaux',
        'ESN / cabinets partenaires',
        'Plateformes / intermédiaires',
        'Sans préférence pour le moment',
      ),
      allowOther: true,
      optional: true,
      allowUnknown: true,
    },
    {
      key: 'target_size',
      kind: 'multi',
      label: 'questions.targetSize.label',
      subtitle: 'questions.targetSize.subtitle',
      choices: choice(
        'Toutes les tailles selon la pertinence',
        'TPE',
        'PME',
        'ETI',
        'Grand groupe',
        'Start-up / scale-up',
      ),
      allowOther: true,
      optional: true,
      allowUnknown: true,
    },
  ],
}
