import type { SubStep } from './types'
import { choice } from './types'

/**
 * Sous-étape `staffing-modes` du stage `offer_expertise` — #2040.3/.4/.5/.6.
 *
 * `staffing_model` reste un choix UNIQUE (le mode dominant, question
 * `positionnement`), inchangé par ce lot — une ESN peut cumuler CDI,
 * sous-traitance et nearshore, ce qu'un select unique ne peut jamais dire.
 * `staffing_modes` capture, en MULTI, tous les modes réellement utilisés,
 * y compris deux que `staffing_model` confond aujourd'hui avec « freelance »
 * (la sous-traitance, #2040.4) ou n'offre pas du tout (recrutement après
 * besoin, nearshore, partenaires).
 */
export const staffingModesStep: SubStep = {
  slug: 'staffing-modes',
  questions: [
    {
      key: 'staffing_modes',
      kind: 'multi',
      label: 'questions.staffingModes.label',
      subtitle: 'questions.staffingModes.subtitle',
      choices: choice(
        'Recrutement après besoin',
        'Sous-traitance',
        'Nearshore',
        'Partenaires',
        'Consultants salariés',
        'Portage salarial',
        'Ressources de partenaires',
        'Équipe dédiée / centre de services',
      ),
    },
  ],
}
