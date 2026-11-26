import { describe, expect, it } from 'vitest'
import {
  declareOutreachEngagementSignalSchema,
  OUTREACH_ENGAGEMENT_SIGNALS,
  outreachEngagementSignalSchema,
} from './outreach-sequence.js'

/**
 * #2909 (#2378.2) — le déclencheur par ouverture/clic, DÉCLARATIF (le
 * commercial rapporte ce qu'il a constaté dans sa messagerie, jamais un pixel
 * ou un lien réécrit par Bellum — voir le docblock de `outreach-sequence.ts`).
 */
describe('OUTREACH_ENGAGEMENT_SIGNALS — deux valeurs, jamais une troisième inventée', () => {
  it('ferme la liste à `opened`/`clicked`', () => {
    expect(OUTREACH_ENGAGEMENT_SIGNALS).toEqual(['opened', 'clicked'])
  })

  it('refuse une valeur hors de la liste', () => {
    expect(outreachEngagementSignalSchema.safeParse('replied').success).toBe(false)
  })
})

describe('declareOutreachEngagementSignalSchema — corps du PATCH .../steps/:stepId/engagement', () => {
  it('accepte une déclaration', () => {
    expect(declareOutreachEngagementSignalSchema.parse({ engagement_signal: 'opened' })).toEqual({
      engagement_signal: 'opened',
    })
  })

  it('accepte `null` — effacer une déclaration, une correction humaine gagne toujours', () => {
    expect(declareOutreachEngagementSignalSchema.parse({ engagement_signal: null })).toEqual({
      engagement_signal: null,
    })
  })

  it('refuse une valeur hors de la liste fermée', () => {
    expect(declareOutreachEngagementSignalSchema.safeParse({ engagement_signal: 'read' }).success).toBe(false)
  })
})
