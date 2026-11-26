import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DiscoverQuickPassEntry } from '@bellum/contracts'
import { QuickPassAxes } from './QuickPassVerdict'

function entry(over: Partial<DiscoverQuickPassEntry> = {}): DiscoverQuickPassEntry {
  return {
    siren: '552100554',
    name: 'ACME',
    verdict: 'prudence',
    reason: 'reservesNamed',
    axes: [
      {
        axis: 'interest',
        state: 'positive',
        weight: 'decisive',
        measured: { score: 60, scoreMax: 70 },
        unevaluable: null,
      },
      { axis: 'access', state: null, weight: 'advisory', measured: null, unevaluable: 'accessNotDerivable' },
      { axis: 'signal', state: null, weight: 'advisory', measured: null, unevaluable: 'signalsNotSearched' },
      { axis: 'named_contact', state: null, weight: 'advisory', measured: null, unevaluable: 'notCollected' },
    ],
    axisCount: 4,
    evaluatedCount: 1,
    evaluatedAxes: ['interest'],
    unevaluableAxes: ['access', 'signal', 'named_contact'],
    unevaluableDecisiveAxes: [],
    attentionAxes: [],
    blockingAxes: [],
    ...over,
  }
}

// #3913 — « Axe pesé… je ne comprends rien à ce que ça veut dire » (retour
// bêta 08/10). Le fond ne bouge pas : les axes évalués ET ceux qui ne l'ont
// pas pu restent NOMMÉS (doctrine) — seul le JARGON de barème disparaît.
describe('QuickPassAxes — vocabulaire de commercial, même fond (#3913)', () => {
  it('ne dit jamais « axe pesé »', () => {
    render(<QuickPassAxes entry={entry()} />)
    const text = screen.getByTestId('quick-pass-axes').textContent ?? ''
    expect(text).not.toMatch(/axe pesé|axes pesés/i)
  })

  it('nomme quand même ce qui a été évalué', () => {
    render(<QuickPassAxes entry={entry()} />)
    expect(screen.getByText(/Ce qui compte/i)).toHaveTextContent('Intérêt')
  })

  it('nomme quand même ce qui n’a pas pu être évalué, avec sa raison', () => {
    render(<QuickPassAxes entry={entry()} />)
    const missing = screen.getByText(/Ce qui manque/i)
    expect(missing).toHaveTextContent('Accès')
    expect(missing).toHaveTextContent('Signal')
    expect(missing).toHaveTextContent('Contact nommé')
    expect(missing.textContent).toContain('ne se déduit pas')
  })

  it('en mots de commercial quand trop peu d’axes sont évaluables pour trancher', () => {
    render(
      <QuickPassAxes
        entry={entry({
          verdict: null,
          reason: 'notEnoughEvaluated',
          evaluatedAxes: [],
          unevaluableAxes: ['interest', 'access', 'signal', 'named_contact'],
          evaluatedCount: 0,
          axes: [
            { axis: 'interest', state: null, weight: 'decisive', measured: null, unevaluable: 'noScorableCriterion' },
            { axis: 'access', state: null, weight: 'advisory', measured: null, unevaluable: 'accessNotDerivable' },
            { axis: 'signal', state: null, weight: 'advisory', measured: null, unevaluable: 'signalsNotSearched' },
            { axis: 'named_contact', state: null, weight: 'advisory', measured: null, unevaluable: 'notCollected' },
          ],
        })}
      />,
    )
    expect(screen.getByText(/pas assez d.{1,2}éléments pour trancher/i)).toBeInTheDocument()
  })
})
