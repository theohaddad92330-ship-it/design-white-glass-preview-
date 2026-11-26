import type { SubStep } from './types'
import { choice } from './types'

/**
 * Sous-étape `cadrage-staffing` du stage `offer_expertise` — Théo O onboarding-couverture (22/10/2026) : « Précisions de cadrage » de la V23
 * (bench_status, recruiting_priorities). Toutes FACULTATIVES (`optional`) et portent les quatre états d'incertitude (`allowUnknown`) : une déclaration ne
 * connecte aucun outil, ne vaut pas autorisation d'envoi et n'invente rien à la place de la personne.
 */
export const cadrageStaffingStep: SubStep = {
  slug: 'cadrage-staffing',
  questions: [
    {
      key: 'bench_status',
      kind: 'single',
      label: 'questions.benchStatus.label',
      subtitle: 'questions.benchStatus.subtitle',
      choices: choice(
        'Oui, disponibles maintenant',
        'Oui, à une date prochaine',
        'Pas actuellement',
        'Je source après qualification du besoin',
        'Non applicable à mon activité',
      ),
      optional: true,
      allowUnknown: true,
    },
    {
      key: 'recruiting_priorities',
      kind: 'multi',
      label: 'questions.recruitingPriorities.label',
      subtitle: 'questions.recruitingPriorities.subtitle',
      choices: choice(
        'Sourcer des profils',
        'Qualifier les compétences',
        'Confirmer les disponibilités',
        'Réduire l’intercontrat',
        'Préparer les présentations',
        'Réactiver mon vivier',
        'Préparer une relève',
        'Pas de priorité pour le moment',
      ),
      allowOther: true,
      optional: true,
      allowUnknown: true,
    },
  ],
}
