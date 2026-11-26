import { describe, expect, it } from 'vitest'
import { dueDateForPhase, horizonForPhase, PLAN_HORIZONS } from './plan-horizons.js'

const PLAN_DATE = new Date('2026-08-02T17:42:00.000Z')

describe('les horizons d’un plan d’action (§30)', () => {
  it('les quatre horizons du rapport, dans l’ordre', () => {
    expect(PLAN_HORIZONS).toEqual(['today', 'week', 'month', 'quarter'])
    expect([0, 1, 2, 3].map(horizonForPhase)).toEqual(PLAN_HORIZONS)
  })

  it('une échéance tombe à minuit — un plan se compte en jours', () => {
    // Garder l'heure du run ferait apparaître « dans 6 jours et 3 heures » à un
    // commercial qui ne raisonne qu'en jours ouvrés.
    const due = dueDateForPhase(1, PLAN_DATE)
    expect(due.toISOString()).toBe('2026-08-09T00:00:00.000Z')
  })

  it('un plan à six phases a quatre horizons, pas six', () => {
    // Déborder inventerait des échéances de plus en plus lointaines pour des
    // actions que le plan situait toutes dans le même trimestre.
    expect(horizonForPhase(4)).toBe('quarter')
    expect(horizonForPhase(9)).toBe('quarter')
    expect(dueDateForPhase(9, PLAN_DATE)).toEqual(dueDateForPhase(3, PLAN_DATE))
  })

  it('un rang absurde retombe sur aujourd’hui, jamais sur une date invalide', () => {
    expect(horizonForPhase(-1)).toBe('today')
    expect(horizonForPhase(Number.NaN)).toBe('today')
    expect(Number.isNaN(dueDateForPhase(Number.NaN, PLAN_DATE).getTime())).toBe(false)
  })

  it('l’échéance est déterministe — même plan, même date', () => {
    // Une échéance demandée au modèle changerait d'un run à l'autre sur le même
    // dossier, et deux commerciaux liraient deux plans différents.
    expect(dueDateForPhase(2, PLAN_DATE)).toEqual(dueDateForPhase(2, PLAN_DATE))
  })
})
