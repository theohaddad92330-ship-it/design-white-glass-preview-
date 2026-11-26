import { describe, expect, it } from 'vitest'
import {
  contactResolutionCorrectionRequestSchema,
  contactResolutionCorrectionSchema,
  CONTACT_RESOLUTION_CORRECTION_DECISIONS,
} from './contact-resolution-correction.js'

describe('#2159.35 — la correction de rapprochement de contact', () => {
  it('accepte les deux décisions, rien d’autre', () => {
    expect(CONTACT_RESOLUTION_CORRECTION_DECISIONS).toEqual(['confirmed', 'rejected'])
    expect(contactResolutionCorrectionRequestSchema.safeParse({ decision: 'rejected' }).success).toBe(true)
    expect(contactResolutionCorrectionRequestSchema.safeParse({ decision: 'confirmed' }).success).toBe(true)
    expect(contactResolutionCorrectionRequestSchema.safeParse({ decision: 'maybe' }).success).toBe(false)
  })

  it('la note est optionnelle, jamais exigée', () => {
    expect(contactResolutionCorrectionRequestSchema.parse({ decision: 'rejected' }).note).toBeUndefined()
    expect(
      contactResolutionCorrectionRequestSchema.parse({ decision: 'rejected', note: 'Standard accueil' }).note,
    ).toBe('Standard accueil')
  })

  it('le corps ne porte ni le contact visé ni la clé de rapprochement — dérivés côté serveur', () => {
    const shape = contactResolutionCorrectionRequestSchema.shape
    expect('contact_id' in shape).toBe(false)
    expect('dedup_key' in shape).toBe(false)
  })

  it('une version rendue par l’API porte sa clé figée et sa date', () => {
    const parsed = contactResolutionCorrectionSchema.parse({
      version: 1,
      decision: 'rejected',
      dedup_key: 'email:accueil@acme.fr',
      note: null,
      decided_at: '2026-09-28T10:00:00.000Z',
    })
    expect(parsed.dedup_key).toBe('email:accueil@acme.fr')
  })
})
