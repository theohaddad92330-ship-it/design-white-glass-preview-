import { describe, expect, it } from 'vitest'
import {
  createEsnProfileCorrectionRequestSchema,
  esnProfileCorrectionRequestSchema,
  esnProfileCorrectionRequestStatusValues,
} from './esn-profile-correction-request.js'

const UUID = '11111111-1111-1111-1111-111111111111'
const ISO = '2026-09-18T10:00:00.000Z'

// #2018.7 — signaler une information d'entreprise fausse, sans l'écraser.
describe('createEsnProfileCorrectionRequestSchema', () => {
  it('accepts a field key and a reason', () => {
    const parsed = createEsnProfileCorrectionRequestSchema.parse({
      fieldKey: 'esn_name',
      reason: "Le nom affiché est celui d'une ancienne raison sociale.",
    })
    expect(parsed.fieldKey).toBe('esn_name')
  })

  it('sait dire NON à une raison vide — un signalement doit dire pourquoi', () => {
    expect(createEsnProfileCorrectionRequestSchema.safeParse({ fieldKey: 'esn_name', reason: '' }).success).toBe(false)
  })

  it('sait dire NON à une clé de champ vide', () => {
    expect(createEsnProfileCorrectionRequestSchema.safeParse({ fieldKey: '', reason: 'Raison valide' }).success).toBe(
      false,
    )
  })

  it('rejette un champ étranger au contrat (.strict())', () => {
    expect(
      createEsnProfileCorrectionRequestSchema.safeParse({
        fieldKey: 'esn_name',
        reason: 'Raison valide',
        proposedValue: 'Nouvelle valeur', // #2018.7 — jamais une valeur proposée : signaler n'écrit rien.
      }).success,
    ).toBe(false)
  })
})

describe('esnProfileCorrectionRequestStatusValues', () => {
  it("porte les trois états — jamais 'refused', jamais supprimé (on archive, on ne supprime pas)", () => {
    expect(esnProfileCorrectionRequestStatusValues).toEqual(['pending', 'resolved', 'dismissed'])
  })
})

describe('esnProfileCorrectionRequestSchema', () => {
  it('parses a pending request', () => {
    const parsed = esnProfileCorrectionRequestSchema.parse({
      id: UUID,
      fieldKey: 'esn_name',
      reason: 'Raison',
      status: 'pending',
      createdAt: ISO,
      resolvedAt: null,
    })
    expect(parsed.status).toBe('pending')
  })
})
