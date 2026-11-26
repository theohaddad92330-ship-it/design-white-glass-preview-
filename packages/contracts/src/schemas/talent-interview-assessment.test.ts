import { describe, expect, it } from 'vitest'
import {
  recordTalentInterviewTraitSchema,
  recordTalentRampUpSchema,
  talentInterviewGaps,
  talentInterviewTraitSchema,
  talentRampUpSchema,
} from './talent-interview-assessment.js'

describe('talentInterviewTraitSchema', () => {
  it('accepte une entrée entretien complète', () => {
    const result = talentInterviewTraitSchema.safeParse({
      trait: 'communication',
      level: 'solide',
      source: 'interview',
      note: 'Clair au téléphone, reformule bien les besoins.',
      recordedAt: '2026-09-28T10:00:00.000Z',
      recordedByName: 'Louis Schlegel',
    })
    expect(result.success).toBe(true)
  })

  it('refuse une source différente de "interview" — jamais un CV ni une auto-déclaration', () => {
    const result = talentInterviewTraitSchema.safeParse({
      trait: 'communication',
      level: 'solide',
      source: 'cv',
      note: null,
      recordedAt: '2026-09-28T10:00:00.000Z',
      recordedByName: null,
    })
    expect(result.success).toBe(false)
  })

  it('refuse un niveau qui ne fait pas partie des trois crans nommés', () => {
    const result = talentInterviewTraitSchema.safeParse({
      trait: 'autonomy',
      level: 'inconnu',
      source: 'interview',
      note: null,
      recordedAt: '2026-09-28T10:00:00.000Z',
      recordedByName: null,
    })
    expect(result.success).toBe(false)
  })
})

describe('recordTalentInterviewTraitSchema', () => {
  it('accepte un enregistrement minimal, sans note', () => {
    const result = recordTalentInterviewTraitSchema.safeParse({ trait: 'autonomy', level: 'fort' })
    expect(result.success).toBe(true)
  })

  it('rejette un champ inconnu (.strict())', () => {
    const result = recordTalentInterviewTraitSchema.safeParse({ trait: 'autonomy', level: 'fort', score: 9 })
    expect(result.success).toBe(false)
  })
})

describe('talentRampUpSchema / recordTalentRampUpSchema', () => {
  it('accepte une bande de temps avant efficacité', () => {
    const result = talentRampUpSchema.safeParse({
      band: 'semaines',
      note: null,
      recordedAt: '2026-09-28T10:00:00.000Z',
      recordedByName: 'Louis Schlegel',
    })
    expect(result.success).toBe(true)
  })

  it('refuse une bande hors de la liste fermée', () => {
    const result = recordTalentRampUpSchema.safeParse({ band: 'des_mois' })
    expect(result.success).toBe(false)
  })
})

describe('talentInterviewGaps', () => {
  it('nomme les deux traits et le temps avant efficacité quand rien n’a été évalué', () => {
    expect(talentInterviewGaps({ interviewTraits: [], rampUp: null })).toEqual(['communication', 'autonomy', 'rampUp'])
  })

  it('ne nomme plus que ce qui manque réellement', () => {
    const gaps = talentInterviewGaps({
      interviewTraits: [
        {
          trait: 'communication',
          level: 'fort',
          source: 'interview',
          note: null,
          recordedAt: '2026-09-28T10:00:00.000Z',
          recordedByName: null,
        },
      ],
      rampUp: { band: 'jours', note: null, recordedAt: '2026-09-28T10:00:00.000Z', recordedByName: null },
    })
    expect(gaps).toEqual(['autonomy'])
  })

  it('rend un tableau vide — un fait mesuré, jamais un silence — une fois tout évalué', () => {
    const evaluatedAt = '2026-09-28T10:00:00.000Z'
    const gaps = talentInterviewGaps({
      interviewTraits: [
        {
          trait: 'communication',
          level: 'fort',
          source: 'interview',
          note: null,
          recordedAt: evaluatedAt,
          recordedByName: null,
        },
        {
          trait: 'autonomy',
          level: 'solide',
          source: 'interview',
          note: null,
          recordedAt: evaluatedAt,
          recordedByName: null,
        },
      ],
      rampUp: { band: 'immediat', note: null, recordedAt: evaluatedAt, recordedByName: null },
    })
    expect(gaps).toEqual([])
  })
})
