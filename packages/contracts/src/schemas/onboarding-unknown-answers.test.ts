import { describe, expect, it } from 'vitest'
import {
  isUnknownAnswerValue,
  UNKNOWN_ANSWER_LABELS,
  UNKNOWN_ANSWER_REASONS,
  unknownAnswerReasonOf,
} from './onboarding-unknown-answers.js'

// #2027.1 / #2027.2 — quatre états d'incertitude, distincts d'une absence de réponse.
describe('onboarding unknown answers', () => {
  it('names exactly the four reasons of the issue, in order', () => {
    expect(UNKNOWN_ANSWER_REASONS).toEqual(['not_yet_known', 'not_applicable', 'to_verify_with_team', 'answer_later'])
  })

  it('exposes the four exact French labels of #2027', () => {
    expect(Object.values(UNKNOWN_ANSWER_LABELS)).toEqual([
      'Je ne sais pas encore',
      'Non applicable',
      'À vérifier avec mon équipe',
      'Je préfère répondre plus tard',
    ])
  })

  it('recognizes an unknown-answer value and names its reason', () => {
    expect(isUnknownAnswerValue('Je ne sais pas encore')).toBe(true)
    expect(unknownAnswerReasonOf('Non applicable')).toBe('not_applicable')
  })

  it('says NO on a real answer and on an absence of answer — the whole point of #2027.2', () => {
    expect(isUnknownAnswerValue('16 à 30 consultants')).toBe(false)
    expect(isUnknownAnswerValue('')).toBe(false)
    expect(isUnknownAnswerValue(null)).toBe(false)
    expect(isUnknownAnswerValue(undefined)).toBe(false)
    expect(unknownAnswerReasonOf('16 à 30 consultants')).toBeNull()
  })
})
