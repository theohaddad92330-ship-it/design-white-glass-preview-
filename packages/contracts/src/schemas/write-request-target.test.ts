import { describe, expect, it } from 'vitest'
import { EMPTY_WRITE_REQUEST_TARGET, writeRequestTargetSchema } from './write-request-target.js'

// #2200.10 / #2200.11 / #2200.12 / #2200.17 / #2201.21 — le bloc COMMUN
// « objet visé » (compte, contact, propriétaire, canal, risque) que les
// quatre files de validation partagent désormais.
describe('writeRequestTargetSchema', () => {
  it('accepte un bloc entièrement inconnu — jamais 0, jamais deviné', () => {
    expect(writeRequestTargetSchema.parse(EMPTY_WRITE_REQUEST_TARGET)).toEqual(EMPTY_WRITE_REQUEST_TARGET)
  })

  it('accepte un bloc complet avec un risque NOMMÉ, jamais une probabilité', () => {
    const full = {
      accountId: 'acc-1',
      accountName: 'Capgemini',
      contactId: 'contact-1',
      contactName: 'Théo Martin',
      ownerId: 'user-1',
      ownerName: 'Louis',
      channel: 'email',
      risk: 'medium',
      source: { kind: 'routine', ref: 'workflow-9' },
    }
    expect(writeRequestTargetSchema.parse(full)).toEqual(full)
  })

  it('refuse un risque qui ressemble à une probabilité', () => {
    const result = writeRequestTargetSchema.safeParse({ ...EMPTY_WRITE_REQUEST_TARGET, risk: '0.7' })
    expect(result.success).toBe(false)
  })

  it('refuse un canal hors du vocabulaire déjà établi par le journal', () => {
    const result = writeRequestTargetSchema.safeParse({ ...EMPTY_WRITE_REQUEST_TARGET, channel: 'sms' })
    expect(result.success).toBe(false)
  })

  // #2855 — la PROVENANCE : qui/quoi a composé la proposition, jamais un
  // recalcul après coup (risque d'inventer une source absente).
  describe('source (#2855)', () => {
    it('accepte une provenance absente — jamais devinée', () => {
      expect(EMPTY_WRITE_REQUEST_TARGET.source).toBeNull()
      expect(writeRequestTargetSchema.parse(EMPTY_WRITE_REQUEST_TARGET).source).toBeNull()
    })

    it('accepte une provenance NOMMÉE avec sa référence', () => {
      const withSource = { ...EMPTY_WRITE_REQUEST_TARGET, source: { kind: 'meeting_note', ref: 'evt-42' } }
      expect(writeRequestTargetSchema.parse(withSource)).toEqual(withSource)
    })

    it('accepte une provenance NOMMÉE sans référence — le label suffit, la référence est optionnelle', () => {
      const withSource = { ...EMPTY_WRITE_REQUEST_TARGET, source: { kind: 'routine' } }
      expect(writeRequestTargetSchema.parse(withSource)).toEqual(withSource)
    })

    it('refuse une nature de provenance hors du vocabulaire établi', () => {
      const result = writeRequestTargetSchema.safeParse({
        ...EMPTY_WRITE_REQUEST_TARGET,
        source: { kind: 'invented' },
      })
      expect(result.success).toBe(false)
    })

    it('refuse une provenance sans nature — un `ref` seul ne dit pas QUI a proposé', () => {
      const result = writeRequestTargetSchema.safeParse({
        ...EMPTY_WRITE_REQUEST_TARGET,
        source: { ref: 'evt-42' },
      })
      expect(result.success).toBe(false)
    })
  })
})
