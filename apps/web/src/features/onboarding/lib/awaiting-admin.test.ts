import { describe, expect, it } from 'vitest'
import { isPersonalAnswerKey, type OnboardingStateResponse } from '@bellum/contracts'
import { TEMPS1_SUBSTEPS } from './questions'
import {
  AWAITING_SEQUENCE,
  awaitingNeighbour,
  awaitingView,
  firstAwaitingSubStep,
  isAwaitingAdmin,
} from './awaiting-admin'

// #4158.12 — un membre arrivé avant que l'administrateur décrive l'ESN ne
// répond qu'à ses questions PERSONNELLES.
const stateWith = (awaiting: OnboardingStateResponse['awaiting_company_admin']) =>
  ({ awaiting_company_admin: awaiting }) as OnboardingStateResponse

describe('isAwaitingAdmin', () => {
  it('lit le signal du serveur, jamais une déduction locale', () => {
    expect(isAwaitingAdmin(stateWith({ admin_name: 'Marie Curie' }))).toBe(true)
    expect(isAwaitingAdmin(stateWith({ admin_name: null }))).toBe(true)
    expect(isAwaitingAdmin(stateWith(null))).toBe(false)
    expect(isAwaitingAdmin(undefined)).toBe(false)
  })
})

describe('la séquence « personnelles seules »', () => {
  it('ne contient AUCUNE question d’entreprise — la garde sait dire non', () => {
    const questions = AWAITING_SEQUENCE.flatMap(step => step.questions)
    expect(questions.length).toBeGreaterThan(0)
    expect(questions.every(q => isPersonalAnswerKey(q.key))).toBe(true)
  })

  it('garde les index GLOBAUX des sous-étapes et retire celles qui n’ont aucune question personnelle', () => {
    expect(AWAITING_SEQUENCE.length).toBeLessThan(TEMPS1_SUBSTEPS.length)
    for (const step of AWAITING_SEQUENCE) {
      expect(TEMPS1_SUBSTEPS[step.index]?.slug).toBe(step.slug)
    }
  })

  it('awaitingView réduit une sous-étape à ses questions perso, et rend null si elle n’en a pas', () => {
    const companyOnly = TEMPS1_SUBSTEPS.find(step => step.questions.every(q => !isPersonalAnswerKey(q.key)))
    expect(companyOnly).toBeDefined()
    expect(awaitingView(companyOnly!)).toBeNull()
    const mixedOrPersonal = AWAITING_SEQUENCE[0]!
    const view = awaitingView(TEMPS1_SUBSTEPS[mixedOrPersonal.index]!)
    expect(view?.questions.every(q => isPersonalAnswerKey(q.key))).toBe(true)
  })

  it('le voisin reste DANS la séquence réduite et finit sur null aux deux bouts', () => {
    // Aujourd'hui une seule question personnelle est posée au Temps 1
    // (`main_sales_pain`) : la séquence peut n'avoir qu'une étape, et le test
    // tient aussi le jour où elle en aura plusieurs.
    const first = AWAITING_SEQUENCE[0]!
    expect(awaitingNeighbour(first, 1)?.slug ?? null).toBe(AWAITING_SEQUENCE[1]?.slug ?? null)
    expect(awaitingNeighbour(first, -1)).toBeNull()
    expect(awaitingNeighbour(AWAITING_SEQUENCE[AWAITING_SEQUENCE.length - 1]!, 1)).toBeNull()
    // Une sous-étape d'entreprise n'a aucune place dans la séquence.
    const companyOnly = TEMPS1_SUBSTEPS.find(step => awaitingView(step) === null)!
    expect(awaitingNeighbour(companyOnly, 1)).toBeNull()
  })

  it('le point d’entrée est la première sous-étape personnelle', () => {
    expect(firstAwaitingSubStep().slug).toBe(AWAITING_SEQUENCE[0]!.slug)
  })
})
