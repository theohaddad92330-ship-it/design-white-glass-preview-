import { describe, expect, it } from 'vitest'
import type { HorizonForecast } from '@bellum/contracts'
import { atRiskMonthlyRevenue, securedMonthlyRevenue } from './kpis'

/**
 * #2408.64 / #2408.65 — REVENU MENSUEL SÉCURISÉ / REVENU À RISQUE.
 *
 * Deux dérivations, AUCUN calcul neuf : les deux lisent le prévisionnel par
 * horizon déjà servi à `/pilotage` (`ForecastHorizonsService`, #2425) —
 * `scenarios.downside` (le carnet MOINS ce qui est déclaré bloqué) et
 * `decisions.unblockMission` (le carnet dont le renouvellement est
 * justement déclaré bloqué). Ce fichier fige la LECTURE, jamais un second
 * moteur de calcul (GA-26).
 */
const forecast = (over: Partial<HorizonForecast> = {}): HorizonForecast =>
  ({
    horizon: 'month',
    window: { from: '2026-09-01', until: '2026-10-01' },
    components: [],
    scenarios: [],
    money: { revenue: { amounts: null }, invoicing: { amounts: null }, cash: { amounts: null } },
    gap: { causes: [] },
    decisions: [],
    capacity: null,
    ...over,
  }) as HorizonForecast

describe('securedMonthlyRevenue', () => {
  it('non mesuré : aucun prévisionnel chargé (pas de finance:read, ou requête en cours/échouée)', () => {
    expect(securedMonthlyRevenue(undefined)).toBeUndefined()
  })

  it('mesuré, sans ligne chiffrable : le scénario downside ne porte aucun montant', () => {
    expect(
      securedMonthlyRevenue(
        forecast({
          scenarios: [
            {
              scenario: 'downside',
              components: ['backlog'],
              amounts: null,
              hypotheses: [],
              deduplicated: 0,
              excluded: 0,
              withoutAmount: 0,
            },
          ],
        }),
      ),
    ).toBeNull()
  })

  it('lit le montant du scénario downside, jamais un second calcul', () => {
    expect(
      securedMonthlyRevenue(
        forecast({
          scenarios: [
            {
              scenario: 'committed',
              components: ['backlog'],
              amounts: [{ currency: 'EUR', amountCents: 900_000 }],
              hypotheses: [],
              deduplicated: 0,
              excluded: 0,
              withoutAmount: 0,
            },
            {
              scenario: 'downside',
              components: ['backlog'],
              amounts: [{ currency: 'EUR', amountCents: 700_000 }],
              hypotheses: [],
              deduplicated: 0,
              excluded: 1,
              withoutAmount: 0,
            },
          ],
        }),
      ),
    ).toEqual([{ currency: 'EUR', amountCents: 700_000 }])
  })
})

describe('atRiskMonthlyRevenue', () => {
  it('non mesuré : aucun prévisionnel chargé', () => {
    expect(atRiskMonthlyRevenue(undefined)).toBeUndefined()
  })

  it('mesuré, sans ligne chiffrable : aucune décision "unblockMission" cette fenêtre', () => {
    expect(atRiskMonthlyRevenue(forecast({ decisions: [] }))).toBeNull()
  })

  it('lit le montant de la décision unblockMission, jamais un second calcul', () => {
    expect(
      atRiskMonthlyRevenue(
        forecast({
          decisions: [
            { decision: 'chaseOverdue', count: 2, amounts: [{ currency: 'EUR', amountCents: 100_000 }] },
            { decision: 'unblockMission', count: 1, amounts: [{ currency: 'EUR', amountCents: 250_000 }] },
          ],
        }),
      ),
    ).toEqual([{ currency: 'EUR', amountCents: 250_000 }])
  })
})
