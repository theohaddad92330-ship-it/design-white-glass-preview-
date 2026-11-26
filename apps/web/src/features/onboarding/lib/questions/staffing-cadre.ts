import type { SubStep } from './types'
import { choice } from './types'

/** Sous-étape `staffing-cadre` du stage `offer_expertise` — #2040.9/.12. */
export const staffingCadreStep: SubStep = {
  slug: 'staffing-cadre',
  questions: [
    {
      key: 'profile_validation_methods',
      kind: 'multi',
      label: 'questions.profileValidationMethods.label',
      subtitle: 'questions.profileValidationMethods.subtitle',
      choices: choice(
        'Entretien technique interne',
        'Test technique ou mise en situation',
        'Vérification de références',
        'Validation client avant proposition',
        'Aucun process formalisé',
      ),
    },
    {
      key: 'contractual_constraints',
      kind: 'multi',
      label: 'questions.contractualConstraints.label',
      subtitle: 'questions.contractualConstraints.subtitle',
      choices: choice(
        "Durée d'engagement minimale",
        'Clause de non-concurrence',
        'Préavis de fin de mission',
        'Garantie de remplacement',
        'Aucune contrainte particulière',
      ),
    },
  ],
}
