import type { SubStep } from './types'
import { choice } from './types'

/**
 * Sous-étape `cadrage-activite` du stage `company_info` — Théo O onboarding-couverture (22/10/2026) : « Précisions de cadrage » de la V23
 * (activity_nature). Toutes FACULTATIVES (`optional`) et portent les quatre états d'incertitude (`allowUnknown`) : une déclaration ne
 * connecte aucun outil, ne vaut pas autorisation d'envoi et n'invente rien à la place de la personne.
 */
export const cadrageActiviteStep: SubStep = {
  slug: 'cadrage-activite',
  questions: [
    {
      key: 'activity_nature',
      kind: 'multi',
      label: 'questions.activityNature.label',
      subtitle: 'questions.activityNature.subtitle',
      choices: choice(
        'ESN généraliste',
        'ESN spécialiste',
        'Cabinet de conseil',
        'Société d’ingénierie',
        'Bureau d’études',
        'Cabinet de recrutement',
        'Collectif de freelances',
        'Activité indépendante',
        'Centre de services / infogérance',
        'Éditeur / intégrateur',
        'Agence digitale / créative',
        'Management de transition',
      ),
      allowOther: true,
      optional: true,
      allowUnknown: true,
    },
  ],
}
