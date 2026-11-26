import { describe, expect, it } from 'vitest'
import { analysisEntityAnswerSchema, analysisEntityQuestionSchema } from './analysis.js'

/**
 * #2164.17 — corriger une ambiguïté PENDANT le job. La question posée par le
 * worker nomme au moins deux entités porteuses d'un SIREN ; la réponse en
 * choisit une, jamais un nom libre.
 */
const QUESTION = {
  candidates: [
    { name: 'BPCE', siren: '493455042', city: 'Paris' },
    { name: 'BPCE Lease', siren: '332357286', city: null },
  ],
  hypothesisSiren: '493455042',
  askedAt: '2026-11-01T10:00:00.000Z',
  expiresAt: '2026-11-01T10:05:00.000Z',
}

describe('analysisEntityQuestionSchema — #2164.17', () => {
  it('accepte une question à deux candidats nommés', () => {
    expect(analysisEntityQuestionSchema.safeParse(QUESTION).success).toBe(true)
  })

  it('NON — une question à un seul candidat n’est pas une ambiguïté', () => {
    expect(analysisEntityQuestionSchema.safeParse({ ...QUESTION, candidates: [QUESTION.candidates[0]] }).success).toBe(
      false,
    )
  })

  it('NON — un candidat sans SIREN ne peut pas être choisi', () => {
    const candidates = [QUESTION.candidates[0], { name: 'BPCE ?', siren: '', city: null }]
    expect(analysisEntityQuestionSchema.safeParse({ ...QUESTION, candidates }).success).toBe(false)
  })
})

describe('analysisEntityAnswerSchema — #2164.17', () => {
  it('accepte un SIREN à neuf chiffres', () => {
    expect(analysisEntityAnswerSchema.safeParse({ siren: '332357286' }).success).toBe(true)
  })

  it('NON — un nom libre ou un SIREN mal formé', () => {
    expect(analysisEntityAnswerSchema.safeParse({ siren: 'BPCE' }).success).toBe(false)
    expect(analysisEntityAnswerSchema.safeParse({ siren: '33235728' }).success).toBe(false)
    expect(analysisEntityAnswerSchema.safeParse({ siren: '332357286', extra: 1 }).success).toBe(false)
  })
})
