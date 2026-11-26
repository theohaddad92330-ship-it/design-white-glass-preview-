import type { SubStep } from './types'
import { choice } from './types'

/**
 * Sous-étape `cadrage-horizon` du stage `goals` — Théo O onboarding-couverture (22/10/2026) : « Précisions de cadrage » de la V23
 * (horizon, success_target). Toutes FACULTATIVES (`optional`) et portent les quatre états d'incertitude (`allowUnknown`) : une déclaration ne
 * connecte aucun outil, ne vaut pas autorisation d'envoi et n'invente rien à la place de la personne.
 */
export const cadrageHorizonStep: SubStep = {
  slug: 'cadrage-horizon',
  questions: [
    {
      key: 'horizon',
      kind: 'single',
      label: 'questions.horizon.label',
      subtitle: 'questions.horizon.subtitle',
      choices: choice(
        'Cette semaine',
        'Sous 30 jours',
        'Sous 60 jours',
        'Sur le trimestre',
        'Sur six mois',
        'À plus long terme',
        'Pas encore défini',
      ),
      optional: true,
      allowUnknown: true,
    },
    {
      key: 'success_target',
      kind: 'text',
      label: 'questions.successTarget.label',
      subtitle: 'questions.successTarget.subtitle',
      optional: true,
      allowUnknown: true,
    },
  ],
}
