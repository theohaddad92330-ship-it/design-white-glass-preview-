import type { SubStep } from './types'
import { choice } from './types'

/**
 * Sous-étape `equipe-managee` du stage `role` — #2033.4 (D3, décision Louis
 * 18/09/2026) : les personnes managées, par FONCTION — jamais un nom propre
 * (aucun critère protégé, et un tiers non consentant ne se nomme pas ici).
 */
export const equipeManageeStep: SubStep = {
  slug: 'equipe-managee',
  questions: [
    {
      key: 'people_managed',
      kind: 'multi',
      label: 'questions.peopleManaged.label',
      subtitle: 'questions.peopleManaged.subtitle',
      allowOther: true,
      choices: choice(
        'Des Business Managers',
        'Des consultants',
        'Des recruteurs',
        'Une équipe pluridisciplinaire',
        'Personne, je ne manage personne',
      ),
    },
  ],
}
