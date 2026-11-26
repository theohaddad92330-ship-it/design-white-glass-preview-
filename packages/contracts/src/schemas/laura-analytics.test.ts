import { describe, expect, it } from 'vitest'
import { computeLauraAnalytics, type LauraAnalyticsTrace } from './laura-analytics.js'

const HOUR = 60 * 60 * 1000
const NOW = new Date('2026-09-25T12:00:00.000Z').getTime()

function trace(over: Partial<LauraAnalyticsTrace> = {}): LauraAnalyticsTrace {
  return { reaction: null, created_at: NOW - HOUR, ...over }
}

describe('#2403.40-.47 — computeLauraAnalytics : huit noms, ce qu’on sait et ce qu’on ne sait pas', () => {
  it('« offered » compte CHAQUE trace — c’est la définition même d’une trace', () => {
    const summary = computeLauraAnalytics([trace(), trace(), trace()], 0, NOW)
    expect(summary.offered).toEqual({ state: 'measured', count: 3 })
  })

  it('rien proposé : « offered » reste MESURÉ à zéro — on a bien regardé, il n’y avait rien', () => {
    const summary = computeLauraAnalytics([], 0, NOW)
    expect(summary.offered).toEqual({ state: 'measured', count: 0 })
  })

  it('« accepted » compte les gestes UTILES (`acted`), rien d’autre', () => {
    const summary = computeLauraAnalytics(
      [trace({ reaction: 'acted' }), trace({ reaction: 'acted' }), trace({ reaction: 'refused' })],
      0,
      NOW,
    )
    expect(summary.accepted).toEqual({ state: 'measured', count: 2 })
  })

  it('« dismissed » réunit `refused` ET `closed_unread` — la même règle que le taux d’acceptation par surface', () => {
    const summary = computeLauraAnalytics(
      [trace({ reaction: 'refused' }), trace({ reaction: 'closed_unread' }), trace({ reaction: 'acted' })],
      0,
      NOW,
    )
    expect(summary.dismissed).toEqual({ state: 'measured', count: 2 })
  })

  it('« ignored » compte une trace SANS réaction, vieille de plus de vingt-quatre heures', () => {
    const summary = computeLauraAnalytics(
      [
        trace({ reaction: null, created_at: NOW - 25 * HOUR }),
        // Trop récente pour être qualifiée : elle n'a pas encore eu sa chance.
        trace({ reaction: null, created_at: NOW - 1 * HOUR }),
      ],
      0,
      NOW,
    )
    expect(summary.ignored).toEqual({ state: 'measured', count: 1 })
  })

  it('« disabled » est un DÉCOMPTE d’utilisateurs, transmis tel quel par l’appelant', () => {
    const summary = computeLauraAnalytics([], 7, NOW)
    expect(summary.disabled).toEqual({ state: 'measured', count: 7 })
  })

  it('« viewed », « converted_to_action » et « false_positive » restent NOMMÉS non mesurés — aucun signal ne les porte', () => {
    const summary = computeLauraAnalytics([trace({ reaction: 'acted' })], 0, NOW)
    expect(summary.viewed.state).toBe('unmeasured')
    expect(summary.converted_to_action.state).toBe('unmeasured')
    expect(summary.false_positive.state).toBe('unmeasured')
    if (summary.viewed.state === 'unmeasured') expect(summary.viewed.reason.length).toBeGreaterThan(10)
    if (summary.converted_to_action.state === 'unmeasured')
      expect(summary.converted_to_action.reason.length).toBeGreaterThan(10)
    if (summary.false_positive.state === 'unmeasured') expect(summary.false_positive.reason.length).toBeGreaterThan(10)
  })

  it('une réaction inconnue (trace corrompue) ne compte NULLE PART plutôt que de fausser un total', () => {
    const summary = computeLauraAnalytics([trace({ reaction: 'quelque_chose_de_jamais_ecrit' })], 0, NOW)
    expect(summary.accepted).toEqual({ state: 'measured', count: 0 })
    expect(summary.dismissed).toEqual({ state: 'measured', count: 0 })
    expect(summary.ignored).toEqual({ state: 'measured', count: 0 })
    // Elle reste comptée dans « offered » : elle a bien été PROPOSÉE.
    expect(summary.offered).toEqual({ state: 'measured', count: 1 })
  })
})
