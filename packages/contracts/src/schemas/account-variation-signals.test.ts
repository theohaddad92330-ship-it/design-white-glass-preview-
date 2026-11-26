import { describe, expect, it } from 'vitest'
import { computeAccountVariationSignals } from './account-variation-signals.js'

const NOW = new Date('2026-10-15T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 10)
const byKey = (r: ReturnType<typeof computeAccountVariationSignals>) => Object.fromEntries(r.map(s => [s.key, s]))

describe('#3920.10 — les quatre signaux de variation d’un compte', () => {
  it('rend toujours les QUATRE signaux, dans l’ordre', () => {
    const r = computeAccountVariationSignals({}, NOW)
    expect(r.map(s => s.key)).toEqual(['job_offers_mom', 'headcount_6m', 'public_awards_12m', 'it_moves_6m'])
  })

  it('une source non lue = « non mesuré » avec sa raison — jamais 0', () => {
    const r = byKey(computeAccountVariationSignals({}, NOW))
    for (const key of ['job_offers_mom', 'headcount_6m', 'public_awards_12m', 'it_moves_6m'] as const) {
      expect(r[key]).toMatchObject({ status: 'not_measured' })
      expect(r[key]).not.toHaveProperty('current')
    }
    expect(r.headcount_6m).toMatchObject({ reason: 'no_history' })
  })

  it('offres mois/mois : 30 derniers jours contre les 30 précédents, base datée', () => {
    const dates = [1, 5, 10, 29, 31, 40, 59, 70].map(daysAgo) // 4 récentes, 3 précédentes, 1 hors fenêtre
    const s = byKey(computeAccountVariationSignals({ jobOfferDates: dates }, NOW)).job_offers_mom
    expect(s).toMatchObject({
      status: 'measured',
      current: 4,
      previous: 3,
      delta: 1,
      base: { windowDays: 30, compare: 'previous_period', asOf: '2026-10-15', source: 'job_offers' },
    })
    expect((s as { changePct: number | null }).changePct).toBeCloseTo(33.3, 1)
  })

  it('une base précédente à zéro : pas de pourcentage (jamais ∞ ni 0 %)', () => {
    const s = byKey(computeAccountVariationSignals({ jobOfferDates: [daysAgo(2)] }, NOW)).job_offers_mom
    expect(s).toMatchObject({ status: 'measured', current: 1, previous: 0, delta: 1, changePct: null })
  })

  it('une date illisible est ignorée, jamais comptée', () => {
    const s = byKey(computeAccountVariationSignals({ jobOfferDates: ['n/a', '', daysAgo(3)] }, NOW)).job_offers_mom
    expect(s).toMatchObject({ status: 'measured', current: 1 })
  })

  it('marchés gagnés : 12 mois contre les 12 mois précédents', () => {
    const dates = [10, 100, 300, 400, 500, 700].map(daysAgo)
    const s = byKey(computeAccountVariationSignals({ publicAwardDates: dates }, NOW)).public_awards_12m
    expect(s).toMatchObject({ status: 'measured', current: 3, previous: 3, delta: 0, base: { windowDays: 365 } })
  })

  it('mouvements de décideurs IT : 6 mois contre les 6 précédents', () => {
    const s = byKey(
      computeAccountVariationSignals({ itDecisionMakerMoveDates: [20, 90, 200].map(daysAgo) }, NOW),
    ).it_moves_6m
    expect(s).toMatchObject({ status: 'measured', current: 2, previous: 1, base: { windowDays: 180 } })
  })

  it('effectif : il faut une observation ancienne d’environ 6 mois ET une récente', () => {
    const ok = byKey(
      computeAccountVariationSignals(
        {
          headcountObservations: [
            { date: daysAgo(180), headcount: 100 },
            { date: daysAgo(5), headcount: 112 },
          ],
        },
        NOW,
      ),
    ).headcount_6m
    expect(ok).toMatchObject({
      status: 'measured',
      current: 112,
      previous: 100,
      delta: 12,
      base: { compare: 'six_months_ago' },
    })
    expect((ok as { changePct: number }).changePct).toBeCloseTo(12, 5)

    const tooRecent = byKey(
      computeAccountVariationSignals(
        {
          headcountObservations: [
            { date: daysAgo(30), headcount: 100 },
            { date: daysAgo(5), headcount: 112 },
          ],
        },
        NOW,
      ),
    ).headcount_6m
    expect(tooRecent).toMatchObject({ status: 'not_measured', reason: 'no_baseline' })
  })

  it('un effectif non positif ou non fini n’est pas une observation', () => {
    const r = byKey(
      computeAccountVariationSignals(
        {
          headcountObservations: [
            { date: daysAgo(180), headcount: 0 },
            { date: daysAgo(5), headcount: Number.NaN },
          ],
        },
        NOW,
      ),
    ).headcount_6m
    expect(r).toMatchObject({ status: 'not_measured' })
  })
})
