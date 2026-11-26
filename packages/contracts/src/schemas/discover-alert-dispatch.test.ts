import { describe, expect, it } from 'vitest'
import {
  DISCOVER_ALERT_DUE_AFTER_MS,
  DISCOVER_ALERT_OUTBOUND_CHANNELS,
  isDiscoverAlertDue,
  isOutboundAlertChannel,
  isQualifiedOutboundConsent,
} from './discover-alert-dispatch.js'
import { SAVED_VIEW_ALERT_CHANNELS, SAVED_VIEW_ALERT_FREQUENCIES } from './governance.js'

const NOW = new Date('2026-09-15T08:00:00.000Z')

describe('les canaux qui SORTENT', () => {
  it('ne retient que ceux qui quittent réellement l’application', () => {
    expect([...DISCOVER_ALERT_OUTBOUND_CHANNELS]).toEqual(['email', 'sms'])
  })

  it('« dans l’application » n’est pas un envoi sortant', () => {
    expect(isOutboundAlertChannel('in_app')).toBe(false)
  })

  it('« aucun canal » n’est pas un envoi sortant', () => {
    expect(isOutboundAlertChannel(null)).toBe(false)
    expect(isOutboundAlertChannel(undefined)).toBe(false)
    expect(isOutboundAlertChannel('')).toBe(false)
  })

  it('chaque canal sortant est un canal que la colonne accepte', () => {
    for (const channel of DISCOVER_ALERT_OUTBOUND_CHANNELS) {
      expect(SAVED_VIEW_ALERT_CHANNELS).toContain(channel)
    }
  })

  it('un canal inventé n’est jamais sortant', () => {
    expect(isOutboundAlertChannel('pigeon')).toBe(false)
  })
})

describe('le consentement QUALIFIÉ — une date, jamais une case', () => {
  it('une date passée, lisible, qualifie', () => {
    expect(isQualifiedOutboundConsent('2026-09-01T10:00:00.000Z', NOW)).toBe(true)
    expect(isQualifiedOutboundConsent(new Date('2026-09-01T10:00:00.000Z'), NOW)).toBe(true)
  })

  it('l’ABSENCE de date ne qualifie pas — c’est le cœur de la règle', () => {
    // Une case à `true` sans date dit qu'elle vaut `true`. Elle ne dit ni quand
    // ni comment elle y est passée : un DEFAULT de base la remplit pareil.
    expect(isQualifiedOutboundConsent(null, NOW)).toBe(false)
    expect(isQualifiedOutboundConsent(undefined, NOW)).toBe(false)
    expect(isQualifiedOutboundConsent('', NOW)).toBe(false)
    expect(isQualifiedOutboundConsent('   ', NOW)).toBe(false)
  })

  it('une date illisible ne qualifie pas', () => {
    expect(isQualifiedOutboundConsent('hier', NOW)).toBe(false)
    expect(isQualifiedOutboundConsent(new Date('nope'), NOW)).toBe(false)
  })

  it('une date à VENIR ne qualifie pas — personne n’a encore consenti', () => {
    expect(isQualifiedOutboundConsent('2026-09-16T08:00:00.000Z', NOW)).toBe(false)
  })

  it('la date de MAINTENANT qualifie — le geste vient d’avoir lieu', () => {
    expect(isQualifiedOutboundConsent(NOW.toISOString(), NOW)).toBe(true)
  })
})

describe('la cadence — quand un périmètre est DÛ', () => {
  it('« manual » n’est jamais dû : une alerte ne s’allume pas toute seule', () => {
    expect(isDiscoverAlertDue('manual', null, NOW)).toBe(false)
    expect(isDiscoverAlertDue('manual', '2020-01-01T00:00:00.000Z', NOW)).toBe(false)
  })

  it('jamais rejoué = dû', () => {
    expect(isDiscoverAlertDue('daily', null, NOW)).toBe(true)
    expect(isDiscoverAlertDue('weekly', null, NOW)).toBe(true)
  })

  it('rejoué à l’instant = pas dû', () => {
    expect(isDiscoverAlertDue('daily', '2026-09-15T07:30:00.000Z', NOW)).toBe(false)
    expect(isDiscoverAlertDue('weekly', '2026-09-14T08:00:00.000Z', NOW)).toBe(false)
  })

  it('au-delà de la fenêtre = dû', () => {
    expect(isDiscoverAlertDue('daily', '2026-09-14T08:00:00.000Z', NOW)).toBe(true)
    expect(isDiscoverAlertDue('weekly', '2026-09-01T08:00:00.000Z', NOW)).toBe(true)
  })

  it('une dernière exécution illisible ne fait pas repartir la cadence à zéro', () => {
    // Retomber sur « jamais rejoué » enverrait une alerte sur une donnée qu'on
    // n'a pas su lire — c'est « non mesuré rendu 0 », appliqué à un envoi.
    expect(isDiscoverAlertDue('daily', 'pas une date', NOW)).toBe(false)
  })

  it('chaque cadence non manuelle a une fenêtre, et chaque fenêtre une cadence', () => {
    const cadences = SAVED_VIEW_ALERT_FREQUENCIES.filter(frequency => frequency !== 'manual')
    expect(Object.keys(DISCOVER_ALERT_DUE_AFTER_MS).sort()).toEqual([...cadences].sort())
    for (const value of Object.values(DISCOVER_ALERT_DUE_AFTER_MS)) {
      expect(value).toBeGreaterThan(0)
    }
  })
})
