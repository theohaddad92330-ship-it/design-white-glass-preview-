import type { SubStep } from './types'
import { choice } from './types'

/**
 * Sous-étape `decisions-autorite` du stage `role` — #2033.2 / #2033.3 (D3,
 * décision Louis 18/09/2026).
 *
 * ⚠️ Ces réponses N'ENTRENT NULLE PART dans les droits : elles cadrent
 * seulement ce que Laura PROPOSE (`authority-scope.ts`), jamais ce que l'API
 * accepte — `workspace-permission.guard.ts` reste seul (GA-26).
 *
 * Les deux questions posent le MÊME catalogue (`ESN_ANSWER_OPTIONS.decisions_alone`
 * / `.decisions_to_validate`, `onboarding.ts`) : une décision peut apparaître
 * dans l'une, dans l'autre, dans les deux, ou dans aucune.
 */
export const decisionsAutoriteStep: SubStep = {
  slug: 'decisions-autorite',
  questions: [
    {
      key: 'decisions_alone',
      kind: 'multi',
      label: 'questions.decisionsAlone.label',
      subtitle: 'questions.decisionsAlone.subtitle',
      allowOther: true,
      choices: choice(
        'Envoyer une offre commerciale',
        'Fixer un tarif ou une remise',
        'Signer un nouveau compte client',
        'Recruter un consultant',
        'Décider un staffing',
        "Inviter quelqu'un dans l'espace",
      ),
    },
    {
      key: 'decisions_to_validate',
      kind: 'multi',
      label: 'questions.decisionsToValidate.label',
      subtitle: 'questions.decisionsToValidate.subtitle',
      allowOther: true,
      choices: choice(
        'Envoyer une offre commerciale',
        'Fixer un tarif ou une remise',
        'Signer un nouveau compte client',
        'Recruter un consultant',
        'Décider un staffing',
        "Inviter quelqu'un dans l'espace",
      ),
    },
  ],
}
