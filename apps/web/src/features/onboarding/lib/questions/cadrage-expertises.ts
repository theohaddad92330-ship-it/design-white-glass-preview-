import type { SubStep } from './types'
import { answered } from './visibility'

/**
 * Sous-étape `cadrage-expertises` du stage `offer_expertise` — Théo O onboarding-couverture (22/10/2026) : « Précisions de cadrage » de la V23
 * (priority_expertise, skill_technos). Toutes FACULTATIVES (`optional`) et portent les quatre états d'incertitude (`allowUnknown`) : une déclaration ne
 * connecte aucun outil, ne vaut pas autorisation d'envoi et n'invente rien à la place de la personne.
 */
export const cadrageExpertisesStep: SubStep = {
  slug: 'cadrage-expertises',
  questions: [
    {
      key: 'priority_expertise',
      kind: 'multi',
      label: 'questions.priorityExpertise.label',
      subtitle: 'questions.priorityExpertise.subtitle',
      allowOther: true,
      // Les choix sont les expertises DÉJÀ déclarées (jamais un catalogue deviné) : toutes restent conservées.
      choices: [],
      dynamicChoicesFromAnswerKey: 'expertise_areas',
      when: answers => answered(answers.expertise_areas),
      optional: true,
      allowUnknown: true,
    },
    {
      key: 'skill_technos',
      kind: 'tags',
      label: 'questions.skillTechnos.label',
      subtitle: 'questions.skillTechnos.subtitle',
      optional: true,
    },
  ],
}
