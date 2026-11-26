import { describe, expect, it } from 'vitest'
import { REFRESH_MIN_INTERVAL_MS, refreshedTooRecently } from './analysis.js'

const NOW = new Date('2026-08-25T10:00:00.000Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000)

describe('refreshedTooRecently — le double clic, et rien d’autre', () => {
  it('bloque dans la fenêtre, laisse passer au-delà', () => {
    expect(refreshedTooRecently(hoursAgo(1), NOW)).toBe(true)
    expect(refreshedTooRecently(hoursAgo(5.9), NOW)).toBe(true)
    expect(refreshedTooRecently(hoursAgo(6.1), NOW)).toBe(false)
    expect(refreshedTooRecently(hoursAgo(72), NOW)).toBe(false)
  })

  it('une date ABSENTE ne bloque rien — on ne refuse pas sur ce qu’on n’a pas', () => {
    expect(refreshedTooRecently(null, NOW)).toBe(false)
    expect(refreshedTooRecently(undefined, NOW)).toBe(false)
  })

  it('une date ILLISIBLE ne bloque rien non plus', () => {
    // Un refus sur une donnée abîmée est pire qu'un refresh de trop.
    expect(refreshedTooRecently('pas une date', NOW)).toBe(false)
    expect(refreshedTooRecently('', NOW)).toBe(false)
  })

  it('une date dans le FUTUR ne prouve pas une fraîcheur, elle prouve une horloge', () => {
    expect(refreshedTooRecently(hoursAgo(-3), NOW)).toBe(false)
  })

  it('accepte une chaîne ISO comme un Date — les deux voyagent sur le fil', () => {
    expect(refreshedTooRecently(hoursAgo(1).toISOString(), NOW)).toBe(true)
    expect(refreshedTooRecently(hoursAgo(24).toISOString(), NOW)).toBe(false)
  })

  it('la fenêtre est de SIX heures, pas de trente jours', () => {
    // Le seuil de trente jours protège le lancement d'une analyse complète. Le
    // borner ainsi reviendrait à interdire un geste qu'on fait le matin d'un
    // rendez-vous.
    expect(REFRESH_MIN_INTERVAL_MS).toBe(6 * 60 * 60 * 1000)
    expect(refreshedTooRecently(hoursAgo(1), NOW, 60_000)).toBe(false)
  })
})
