import { describe, expect, it } from 'vitest'
import { referencingWindowAlert } from './access.js'

const NOW = new Date('2026-08-23T09:00:00Z')
const inDays = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString().slice(0, 10)

describe('referencingWindowAlert — la fenêtre de référencement (F08)', () => {
  it('n’alerte JAMAIS sur une échéance inconnue', () => {
    // « Je ne sais pas quand » n'est pas « c'est imminent ». Alerter ici
    // enverrait préparer une consultation qui n'existe peut-être pas.
    expect(referencingWindowAlert(null, NOW)).toBeNull()
    expect(referencingWindowAlert('', NOW)).toBeNull()
    expect(referencingWindowAlert('pas une date', NOW)).toBeNull()
  })

  it('n’alerte plus une fois la date passée', () => {
    expect(referencingWindowAlert(inDays(-1), NOW)).toBeNull()
  })

  it('se tait tant que la réouverture est au-delà de neuf mois', () => {
    expect(referencingWindowAlert(inDays(400), NOW)).toBeNull()
  })

  it('rend le jalon des neuf mois quand on vient d’y entrer', () => {
    expect(referencingWindowAlert(inDays(260), NOW)).toEqual(expect.objectContaining({ milestone: 9, daysAhead: 260 }))
  })

  it('rend UN seul jalon, le plus proche', () => {
    // Trois notifications pour une information seraient trois fois moins lues.
    expect(referencingWindowAlert(inDays(80), NOW)?.milestone).toBe(3)
    expect(referencingWindowAlert(inDays(150), NOW)?.milestone).toBe(6)
  })

  it('alerte encore le jour même de la réouverture', () => {
    expect(referencingWindowAlert(inDays(0), NOW)).toEqual(expect.objectContaining({ milestone: 3, daysAhead: 0 }))
  })
})
