import type { SubStep } from './types'
import { choice } from './types'

/**
 * Sous-étape `cadrage-territoire` du stage `target_market` — Théo O onboarding-couverture (22/10/2026) : « Précisions de cadrage » de la V23
 * (country_scope, geography_detail). Toutes FACULTATIVES (`optional`) et portent les quatre états d'incertitude (`allowUnknown`) : une déclaration ne
 * connecte aucun outil, ne vaut pas autorisation d'envoi et n'invente rien à la place de la personne.
 */
export const cadrageTerritoireStep: SubStep = {
  slug: 'cadrage-territoire',
  questions: [
    {
      key: 'country_scope',
      kind: 'multi',
      label: 'questions.countryScope.label',
      subtitle: 'questions.countryScope.subtitle',
      choices: choice(
        'France',
        'Belgique',
        'Luxembourg',
        'Suisse',
        'Royaume-Uni',
        'Allemagne',
        'Espagne',
        'Italie',
        'Pays-Bas',
        'Portugal',
        'Canada',
        'Autres pays à préciser',
      ),
      allowOther: true,
      optional: true,
      allowUnknown: true,
    },
    {
      key: 'geography_detail',
      kind: 'text',
      label: 'questions.geographyDetail.label',
      subtitle: 'questions.geographyDetail.subtitle',
      optional: true,
      allowUnknown: true,
    },
  ],
}
