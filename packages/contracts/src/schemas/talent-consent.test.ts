import { describe, expect, it } from 'vitest'
import { consentState, daysBeforeConsentExpiry, type TalentConsent } from './talent-consent.js'

/**
 * Le consentement d'un talent (PDF 3 §7.3).
 *
 * Ce que ces tests protègent : « jamais recueilli » et « expiré » sont deux
 * états différents. L'un demande de poser la question, l'autre de la reposer —
 * les confondre ferait écrire au mauvais moment, à quelqu'un qui n'a peut-être
 * jamais rien accepté.
 */
const NOW = new Date('2026-08-20T12:00:00.000Z')
const consent = (over: Partial<TalentConsent> = {}): TalentConsent => ({
  givenAt: '2025-08-20T12:00:00.000Z',
  expiresAt: null,
  basis: 'candidature spontanée',
  restrictions: null,
  ...over,
})

describe('consentState', () => {
  it('distingue « jamais recueilli » d’« expiré »', () => {
    expect(consentState(consent({ givenAt: null }), NOW)).toBe('none')
    expect(consentState(consent({ expiresAt: '2026-01-01T00:00:00.000Z' }), NOW)).toBe('expired')
  })

  it('vaut sans échéance connue — une absence de date n’est pas une expiration', () => {
    expect(consentState(consent({ expiresAt: null }), NOW)).toBe('valid')
  })

  it('prévient à trente jours, pas avant', () => {
    // C'est le seuil du bandeau du §7.3 : assez tôt pour relancer, assez tard
    // pour ne pas crier tous les mois.
    expect(consentState(consent({ expiresAt: '2026-09-15T12:00:00.000Z' }), NOW)).toBe('expiring')
    expect(consentState(consent({ expiresAt: '2026-10-15T12:00:00.000Z' }), NOW)).toBe('valid')
  })

  it('ne casse pas sur une date illisible — et ne la prend pas pour une expiration', () => {
    expect(consentState(consent({ expiresAt: 'pas une date' }), NOW)).toBe('valid')
  })
})

describe('daysBeforeConsentExpiry', () => {
  it('ne rend JAMAIS un nombre négatif', () => {
    // Un « -12 jours » sur une fiche se lit comme une donnée corrompue.
    expect(daysBeforeConsentExpiry(consent({ expiresAt: '2026-01-01T00:00:00.000Z' }), NOW)).toBe(0)
  })

  it('rend `null` quand la question ne se pose pas', () => {
    expect(daysBeforeConsentExpiry(consent({ expiresAt: null }), NOW)).toBeNull()
  })

  it('compte les jours restants', () => {
    expect(daysBeforeConsentExpiry(consent({ expiresAt: '2026-08-30T12:00:00.000Z' }), NOW)).toBe(10)
  })
})
