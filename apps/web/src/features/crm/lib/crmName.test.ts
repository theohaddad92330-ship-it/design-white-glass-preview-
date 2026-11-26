import { describe, expect, it } from 'vitest'
import { crmNameOf } from './crmName'

// #4526.6 — le nom du CRM du CLIENT, jamais celui d'un de nos fournisseurs.
describe('crmNameOf', () => {
  it('nomme le CRM branché quand son nom est connu', () => {
    expect(crmNameOf({ configured: true, connected: true, provider: 'hubspot' })).toBe('HubSpot')
  })
  it('SAIT DIRE NON : non branché, démo ou inconnu ⇒ undefined (la puce dit « Mon CRM »)', () => {
    expect(crmNameOf(undefined)).toBeUndefined()
    expect(crmNameOf({ configured: true, connected: false, provider: 'hubspot' })).toBeUndefined()
    expect(crmNameOf({ configured: true, connected: false, demo: true })).toBeUndefined()
    expect(crmNameOf({ configured: true, connected: true })).toBeUndefined()
  })
})
