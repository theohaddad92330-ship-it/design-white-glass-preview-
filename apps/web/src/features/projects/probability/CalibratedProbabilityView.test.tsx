import { backtestDealProbability, calibrateDealProbability, type CalibratedProbability } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CalibratedProbabilityView } from './CalibratedProbabilityView'
import { ProbableQuarterPanelView } from './ProbableQuarterPanel'

/**
 * #4016 L1 (décision Louis 11/10/2026) — une probabilité s'affiche, CALIBRÉE :
 * son chiffre, son intervalle, sa méthode, ses axes, et ce qui n'a pas pu être
 * évalué NOMMÉ. Garde GA-26 (réécrite le 11/10) : jamais un chiffre nu.
 */
const won = { outcome: 'won' as const, highestStage: null }
const calibrated = calibrateDealProbability({
  stage: 'negotiation',
  history: [won, won, won, { outcome: 'lost', highestStage: 'negotiation' }, won],
  shared: null,
})

const manyDeals = (n: number, outcome: 'won' | 'lost') =>
  Array.from({ length: n }, () => ({ outcome, highestStage: 'negotiation' as const }))
const MEASURED = backtestDealProbability([...manyDeals(8, 'won'), ...manyDeals(4, 'lost')])
const NOT_MEASURED = backtestDealProbability([])

describe('CalibratedProbabilityView', () => {
  it('rend le chiffre AVEC son intervalle, sa méthode et ses axes', () => {
    render(<CalibratedProbabilityView probability={calibrated} />)
    // Beta(5, 2) : 71 %.
    expect(screen.getByText('71 %')).toBeInTheDocument()
    expect(screen.getByText(/entre \d+ % et \d+ %/)).toBeInTheDocument()
    expect(screen.getByText(/calibrée sur les issues réelles/i)).toBeInTheDocument()
    expect(screen.getByText(/4 gagnées, 1 perdue/)).toBeInTheDocument()
  })

  it('NOMME l’axe non évaluable — il sort du calcul, il ne disparaît pas', () => {
    render(<CalibratedProbabilityView probability={calibrated} />)
    expect(screen.getByText(/base commune : non évaluable/i)).toBeInTheDocument()
  })

  it('« non mesuré » n’est jamais 0 %', () => {
    const vide = calibrateDealProbability({ stage: 'negotiation', history: [], shared: null })
    render(<CalibratedProbabilityView probability={vide} />)
    expect(document.body.textContent).not.toMatch(/(^|\D)0 %/)
    expect(screen.getByText(/pas assez d’affaires closes/i)).toBeInTheDocument()
  })

  // #3928 point 6 (recette prod R4b, vu en passant sur /projects) — « non
  // mesuré » s'affichait deux fois : le libellé fixe d'`UnknownValue` PUIS sa
  // raison, qui répétait elle-même « Non mesuré — » devant le vrai motif.
  it('ne répète pas « non mesuré » — un seul libellé, suivi de SA raison', () => {
    const vide = calibrateDealProbability({ stage: 'negotiation', history: [], shared: null })
    render(<CalibratedProbabilityView probability={vide} />)
    const text = screen.getByText(/pas assez d’affaires closes/i).textContent ?? ''
    expect(text.toLowerCase().match(/non mesuré/g)).toHaveLength(1)
  })

  it('SAIT DIRE NON — une probabilité nue ne s’affiche pas', () => {
    const nue = { ...calibrated, axes: [], unevaluable_axes: [] } as CalibratedProbability
    const { container } = render(<CalibratedProbabilityView probability={nue} />)
    expect(container.textContent).not.toMatch(/%/)
  })
})

describe('ProbableQuarterPanelView', () => {
  it('rend le CA probable du trimestre, son intervalle, et compte à part ce qui n’est pas chiffrable', () => {
    render(
      <ProbableQuarterPanelView
        data={{
          method: 'beta_binomial_stage_v1',
          quarter: { from: '2026-10-01', until: '2027-01-01' },
          revenue: {
            totals: [
              { currency: 'EUR', expected_cents: 71_428_57, low_cents: 50_000_00, high_cents: 90_000_00, deals: 1 },
            ],
            without_amount: 0,
            without_probability: 1,
          },
          calibration: MEASURED,
          deals: [
            {
              opportunity_id: 'o-1',
              label: 'Supervision applicative 24/7',
              stage: 'negotiation',
              amount_cents: 100_000_00,
              currency: 'EUR',
              expected_close_on: '2026-11-15',
              closing_probability: calibrated,
            },
          ],
        }}
      />,
    )
    expect(screen.getByText(/CA probable du trimestre/i)).toBeInTheDocument()
    expect(screen.getByText('Supervision applicative 24/7')).toBeInTheDocument()
    expect(screen.getByText(/1 affaire sans probabilité mesurée/i)).toBeInTheDocument()
  })

  it('aucun total chiffrable → « non mesuré », jamais 0 €', () => {
    render(
      <ProbableQuarterPanelView
        data={{
          method: 'beta_binomial_stage_v1',
          quarter: { from: '2026-10-01', until: '2027-01-01' },
          revenue: { totals: null, without_amount: 0, without_probability: 0 },
          calibration: NOT_MEASURED,
          deals: [],
        }}
      />,
    )
    expect(screen.queryByText(/0\s?€/)).not.toBeInTheDocument()
    expect(screen.getByText(/aucune affaire datée dans les trois mois à venir/i)).toBeInTheDocument()
  })

  // #4016.1c — le calibrage mesuré a posteriori est lisible, avec sa référence.
  it('affiche l’écart de Brier du rétro-test AVEC sa référence, et la courbe de fiabilité', () => {
    const data = {
      method: 'beta_binomial_stage_v1' as const,
      quarter: { from: '2026-10-01', until: '2027-01-01' },
      revenue: { totals: null, without_amount: 0, without_probability: 0 },
      calibration: MEASURED,
      deals: [],
    }
    render(<ProbableQuarterPanelView data={data} />)
    expect(screen.getByText(/rétro-test sur 12 affaires closes/i)).toBeInTheDocument()
    expect(screen.getByText(/contre 0,22 pour un calcul qui prédirait toujours le taux de base/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Annoncé autour de \d+ %, observé \d+ %/).length).toBeGreaterThan(0)
  })

  it('SAIT DIRE NON — sans assez d’affaires closes : « non mesuré », jamais un écart à 0', () => {
    render(
      <ProbableQuarterPanelView
        data={{
          method: 'beta_binomial_stage_v1',
          quarter: { from: '2026-10-01', until: '2027-01-01' },
          revenue: { totals: null, without_amount: 0, without_probability: 0 },
          calibration: NOT_MEASURED,
          deals: [],
        }}
      />,
    )
    expect(screen.getByText(/calibrage non mesuré/i)).toBeInTheDocument()
    expect(screen.queryByText(/écart de Brier/i)).not.toBeInTheDocument()
  })
})
