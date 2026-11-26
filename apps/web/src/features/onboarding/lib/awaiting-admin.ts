import { isPersonalAnswerKey, type OnboardingStateResponse } from '@bellum/contracts'
import { TEMPS1_SUBSTEPS, type FlatSubStep } from './questions'

/**
 * #4158.12 (Louis, 14/10/2026) — LE MEMBRE QUI ATTEND L'ADMINISTRATEUR.
 *
 * Un membre qui arrive AVANT que l'administrateur ait décrit l'ESN ne répond
 * qu'aux questions PERSONNELLES (`ESN_PERSONAL_ANSWER_KEYS`) : l'API ignore ses
 * réponses entreprise (elles ne feraient qu'une fiche orpheline, qui divergerait
 * de la future fiche canonique). Le signal vient du serveur
 * (`awaiting_company_admin`, une seule dérivation — `resolveAwaitingCompanyAdmin`).
 *
 * La séquence est calculée UNE fois, depuis `TEMPS1_SUBSTEPS` : aucune seconde
 * liste de questions à tenir (GA-26). Les sous-étapes gardent leur index
 * GLOBAL (ce que lisent le stepper, le guide de Laura et les URL) ; seul le
 * voisinage (« suivant », « précédent », « dernière ») se lit ici.
 */
export function isAwaitingAdmin(state: Pick<OnboardingStateResponse, 'awaiting_company_admin'> | undefined): boolean {
  return Boolean(state?.awaiting_company_admin)
}

/** La sous-étape réduite à ses seules questions personnelles — `null` quand elle n'en a aucune. */
export function awaitingView(sub: FlatSubStep): FlatSubStep | null {
  const questions = sub.questions.filter(question => isPersonalAnswerKey(question.key))
  return questions.length > 0 ? { ...sub, questions } : null
}

export const AWAITING_SEQUENCE: readonly FlatSubStep[] = TEMPS1_SUBSTEPS.flatMap(sub => {
  const view = awaitingView(sub)
  return view ? [view] : []
})

/** Le point d'entrée d'un membre qui attend : sa première sous-étape personnelle. */
export function firstAwaitingSubStep(): FlatSubStep {
  return AWAITING_SEQUENCE[0] ?? TEMPS1_SUBSTEPS[0]!
}

/** La sous-étape voisine DANS la séquence réduite (`delta` = +1 / -1), `null` aux bouts. */
export function awaitingNeighbour(sub: Pick<FlatSubStep, 'index'>, delta: 1 | -1): FlatSubStep | null {
  const at = AWAITING_SEQUENCE.findIndex(step => step.index === sub.index)
  if (at === -1) return null
  return AWAITING_SEQUENCE[at + delta] ?? null
}
