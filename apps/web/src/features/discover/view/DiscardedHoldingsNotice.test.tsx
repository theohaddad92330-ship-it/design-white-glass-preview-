import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'
import { DiscardedHoldingsNotice } from './DiscardedHoldingsNotice'

const row = (name: string, qualification?: Record<string, unknown>): DiscoverCandidate =>
  ({ siren: name, name, qualification }) as unknown as DiscoverCandidate

/**
 * #3983.1 — une holding écartée au profit de sa filiale figure dans la liste des écartées,
 * avec sa raison. Sans holding écartée : aucune ligne (pas de « 0 écartée »).
 */
describe('DiscardedHoldingsNotice', () => {
  it('nomme la holding écartée et sa filiale retenue', () => {
    render(
      <DiscardedHoldingsNotice
        candidates={[
          row('Groupe Aurélys (démo)', {
            verdict: 'excluded',
            code: 'holding_subsidiary_in_zone',
            reason: 'Holding dont le siège est hors de la zone',
            otherCodes: [],
            subsidiaries: [{ name: 'Pharmatek Santé (démo)' }],
          }),
          row('Pharmatek Santé (démo)'),
        ]}
      />,
    )
    expect(screen.getByText('Groupe Aurélys (démo)')).toBeInTheDocument()
    expect(screen.getByText(/Holding — sa filiale Pharmatek Santé \(démo\) est retenue/)).toBeInTheDocument()
  })

  it('ne rend rien sans holding écartée', () => {
    const { container } = render(
      <DiscardedHoldingsNotice
        candidates={[row('A', { verdict: 'excluded', code: 'natural_person', reason: 'x', otherCodes: [] })]}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
