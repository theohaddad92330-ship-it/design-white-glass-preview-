import { describe, expect, it } from 'vitest'
import { UNKNOWN_ANSWER_LABELS } from '@bellum/contracts'
import { TEMPS1_STAGES, stageQuestions, type Question } from '@/features/onboarding/lib/questions'
import { ANSWER_STATUSES, statusOf, valueForStatus } from '@/features/onboarding/lib/answer-status'

const CATALOGUE = TEMPS1_STAGES.flatMap(stageQuestions)
const single = CATALOGUE.find(q => q.kind === 'single') as Extract<Question, { kind: 'single' }>
const multi = CATALOGUE.find(q => q.kind === 'multi') as Extract<Question, { kind: 'multi' }>

describe('ANSWER_STATUSES — les cinq statuts de la V23 (Théo O onboarding-theme.N1)', () => {
  it('en compte cinq : renseignée + les quatre incertitudes déjà persistées', () => {
    expect(ANSWER_STATUSES).toEqual([
      'answered',
      'not_yet_known',
      'answer_later',
      'to_verify_with_team',
      'not_applicable',
    ])
  })
})

describe('statusOf', () => {
  it('dit « empty » pour une question jamais répondue', () => {
    expect(statusOf(single, '', undefined)).toBe('empty')
  })

  it('lit une incertitude persistée verbatim dans la valeur (canal existant, aucune colonne neuve)', () => {
    expect(statusOf(single, UNKNOWN_ANSWER_LABELS.answer_later, undefined)).toBe('answer_later')
  })

  it('dit « answered » pour une vraie valeur', () => {
    expect(statusOf(single, single.choices[0]!.value, undefined)).toBe('answered')
  })

  it('lit le statut local d’une question à choix multiples quand sa valeur est vide', () => {
    expect(statusOf(multi, [], 'to_verify_with_team')).toBe('to_verify_with_team')
  })

  it('une vraie réponse gagne sur un statut local périmé', () => {
    expect(statusOf(multi, [multi.choices[0]!.value], 'not_applicable')).toBe('answered')
  })
})

describe('valueForStatus', () => {
  it('écrit le libellé exact d’une incertitude sur une question à valeur texte', () => {
    expect(valueForStatus(single, 'not_applicable')).toBe(UNKNOWN_ANSWER_LABELS.not_applicable)
  })

  it('vide une question à choix multiples (le statut vit à côté)', () => {
    expect(valueForStatus(multi, 'answer_later')).toEqual([])
  })
})
