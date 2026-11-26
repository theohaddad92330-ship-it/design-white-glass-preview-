import { describe, expect, it } from 'vitest'
import { depuisCombienDeTemps, libelleTransition } from './incident-timeline-panel.logic'

// #2445.12 — la vue de triage : depuis combien de temps un incident est ouvert.
describe('depuisCombienDeTemps', () => {
  const now = new Date('2026-09-29T12:00:00.000Z')

  it('moins d’une heure : en minutes', () => {
    expect(depuisCombienDeTemps('2026-09-29T11:15:00.000Z', now)).toBe('depuis 45 min')
  })

  it('moins d’un jour : en heures', () => {
    expect(depuisCombienDeTemps('2026-09-29T07:00:00.000Z', now)).toBe('depuis 5 h')
  })

  it('au-delà : en jours', () => {
    expect(depuisCombienDeTemps('2026-09-26T12:00:00.000Z', now)).toBe('depuis 3 j')
  })

  it('une date illisible ne dit rien — jamais « depuis 0 »', () => {
    expect(depuisCombienDeTemps('pas une date', now)).toBeNull()
  })
})

// #2445.12 (épopée #2766) — le libellé d'UNE transition de la chronologie.
describe('libelleTransition', () => {
  it('`degraded` se lit comme le début d’une panne', () => {
    expect(libelleTransition('degraded')).toBe('a cessé de répondre')
  })

  it('`recovered` se lit comme un rétablissement', () => {
    expect(libelleTransition('recovered')).toBe('s’est rétablie')
  })
})
