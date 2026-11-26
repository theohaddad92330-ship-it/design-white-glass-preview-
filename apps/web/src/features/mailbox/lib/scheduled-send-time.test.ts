import { describe, expect, it } from 'vitest'
import { zonedLocalToIso, isoToZonedLocal, userTimeZone } from './scheduled-send-time'

// Théo M2 — envoi programmé — l'heure choisie s'entend dans le fuseau de l'UTILISATEUR, pas celui de l'appareil.
describe('zonedLocalToIso', () => {
  it('lit « 23/10 09:30 » à Paris (heure d’été) comme 07:30 UTC', () => {
    expect(zonedLocalToIso('2026-10-23T09:30', 'Europe/Paris')).toBe('2026-10-23T07:30:00.000Z')
  })

  it('franchit le changement d’heure : « 26/10 09:30 » à Paris (hiver) = 08:30 UTC', () => {
    expect(zonedLocalToIso('2026-10-26T09:30', 'Europe/Paris')).toBe('2026-10-26T08:30:00.000Z')
  })

  it('un autre fuseau, une autre heure', () => {
    expect(zonedLocalToIso('2026-10-23T09:30', 'America/New_York')).toBe('2026-10-23T13:30:00.000Z')
  })

  it('une saisie incomplète ne devient pas une date devinée', () => {
    expect(zonedLocalToIso('', 'Europe/Paris')).toBeNull()
    expect(zonedLocalToIso('2026-10-23', 'Europe/Paris')).toBeNull()
  })
})

describe('isoToZonedLocal', () => {
  it('redit l’heure telle que l’utilisateur l’a choisie', () => {
    expect(isoToZonedLocal('2026-10-23T07:30:00.000Z', 'Europe/Paris')).toBe('2026-10-23T09:30')
  })
})

describe('userTimeZone', () => {
  it('le fuseau ENREGISTRÉ gagne ; à défaut, le fuseau de référence nommé du produit', () => {
    expect(userTimeZone('America/New_York')).toBe('America/New_York')
    expect(userTimeZone(null)).toBe('Europe/Paris')
    expect(userTimeZone('Pas/UnFuseau')).toBe('Europe/Paris')
  })
})
