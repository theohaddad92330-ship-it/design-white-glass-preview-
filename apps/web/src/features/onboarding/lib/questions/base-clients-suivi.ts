import type { Choice, SubStep } from './types'
import { hasNoCommercialHistory } from './maturite'

/**
 * Sous-étape `base-clients-suivi` du stage `company_info` — #2047.12.
 *
 * Deux questions, jamais fusionnées : la RÉGULARITÉ du suivi de compte et QUI
 * en est responsable ne répondent pas à la même chose — une ESN peut avoir un
 * suivi régulier fait par une seule personne surchargée, ou un suivi
 * irrégulier réparti sur toute l'équipe. `sales_routine` (profil progressif)
 * décrit le rythme personnel du VENDEUR ; ceci décrit le suivi du COMPTE.
 *
 * #2548.1 — `client_base_followup_owner` (texte libre, sans `optional`)
 * bloquerait « Continuer » sur une activité qui n'a personne à désigner :
 * masquées ensemble pour une activité en création.
 */
const REGULARITY_CHOICES: Choice[] = [
  { value: 'regulier', labelKey: 'questions.clientBaseFollowupRegularity.choices.regulier' },
  { value: 'irregulier', labelKey: 'questions.clientBaseFollowupRegularity.choices.irregulier' },
  { value: 'aucun', labelKey: 'questions.clientBaseFollowupRegularity.choices.aucun' },
]

export const baseClientsSuiviStep: SubStep = {
  slug: 'base-clients-suivi',
  questions: [
    {
      key: 'client_base_followup_regularity',
      kind: 'single',
      label: 'questions.clientBaseFollowupRegularity.label',
      choices: REGULARITY_CHOICES,
      when: answers => !hasNoCommercialHistory(answers),
    },
    {
      key: 'client_base_followup_owner',
      kind: 'text',
      label: 'questions.clientBaseFollowupOwner.label',
      subtitle: 'questions.clientBaseFollowupOwner.subtitle',
      placeholder: 'questions.clientBaseFollowupOwner.placeholder',
      when: answers => !hasNoCommercialHistory(answers),
    },
  ],
}
