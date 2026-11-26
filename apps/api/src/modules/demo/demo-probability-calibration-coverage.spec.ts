import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  backtestDealProbability,
  calibrateDealProbability,
  calibratedProbabilitySchema,
  calibrationBacktestSchema,
  quarterWindow,
} from '@bellum/contracts'
import { DEMO_PROBABILITY_CALIBRATION_COVERAGE } from './demo-coverage'
import { DEMO_DELIVERY_CLIENT, DEMO_PROBABILITY_CALIBRATION } from './demo-dataset'

/**
 * #4016 L1 (craft rule 9) — la salle de démonstration montre une probabilité
 * CALIBRÉE MESURÉE, pas « non mesuré » : sinon le panneau « CA probable du
 * trimestre » serait livré et vide devant un prospect.
 */
describe('démo — la probabilité calibrée sort mesurée (#4016 L1)', () => {
  const { openDeal, closedDeals } = DEMO_PROBABILITY_CALIBRATION
  const history = [
    // L'affaire gagnée historique de la salle (`DEMO_DELIVERY_CLIENT.project`) compte aussi.
    { outcome: 'won' as const, highestStage: null },
    ...closedDeals.map(deal => ({
      outcome: deal.outcome,
      highestStage: deal.reached,
    })),
  ]

  it('sème des issues RÉELLES gagnées ET perdues — une calibration sans perte serait 100 %', () => {
    expect(DEMO_DELIVERY_CLIENT.project.stage).toBe('won')
    expect(closedDeals.some(deal => deal.outcome === 'won')).toBe(true)
    expect(closedDeals.some(deal => deal.outcome === 'lost')).toBe(true)
  })

  it('l’affaire ouverte reçoit une probabilité mesurée, avec son intervalle et ses axes', () => {
    const p = calibrateDealProbability({ stage: openDeal.stage, history, shared: null })
    expect(calibratedProbabilitySchema.safeParse(p).success).toBe(true)
    expect(p.value).not.toBeNull()
    expect(p.axes.find(axis => axis.key === 'workspace_history')?.evaluable).toBe(true)
  })

  // #4016.1c (règle 9) — le calibrage mesuré a posteriori (Brier) sort lui aussi mesuré en salle de démo.
  it('le calibrage mesuré (rétro-test, écart de Brier) sort mesuré, avec sa référence', () => {
    const backtest = backtestDealProbability(history)
    expect(calibrationBacktestSchema.safeParse(backtest).success).toBe(true)
    expect(backtest.brier).not.toBeNull()
    expect(backtest.baseline_brier).not.toBeNull()
    expect(backtest.evaluated).toBeGreaterThanOrEqual(5)
  })

  it('l’affaire ouverte tombe dans les trois mois à venir, quel que soit le jour de la visite', () => {
    const today = new Date()
    const close = new Date(today.getTime() + openDeal.expected_close_in_days * 86_400_000).toISOString().slice(0, 10)
    const { from, until } = quarterWindow(today)
    expect(close >= from && close < until).toBe(true)
  })

  it('le semis les écrit vraiment, avec leur parcours au journal des transitions', () => {
    const source = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    expect(source).toContain('DEMO_PROBABILITY_CALIBRATION')
    expect(source).toMatch(/seedProbabilityCalibration\(/)
    expect(source).toContain("'opportunity', $2")
  })

  it('est classée SEEDÉE dans demo-coverage, avec sa raison', () => {
    expect(DEMO_PROBABILITY_CALIBRATION_COVERAGE.state).toBe('seede')
    expect(DEMO_PROBABILITY_CALIBRATION_COVERAGE.reason).toContain('#4016 L1')
  })
})
