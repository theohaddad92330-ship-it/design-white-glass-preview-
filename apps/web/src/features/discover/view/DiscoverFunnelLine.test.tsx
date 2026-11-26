import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DiscoverFunnelLine } from './DiscoverFunnelLine'

describe('DiscoverFunnelLine (#4419)', () => {
  it('dit entrés, retenus et chaque critère qui a écarté', () => {
    render(<DiscoverFunnelLine query={{ funnel: { entered: 128, kept: 3, rejected: { city: 94, trade: 31 } } }} />)
    expect(screen.getByTestId('discover-funnel')).toHaveTextContent(
      '128 trouvés · 3 retenus — 94 hors ville, 31 hors métier',
    )
  })

  it('un critère à 0 ne fait aucune ligne, et sans « entrés » on ne dit que les retenus', () => {
    render(<DiscoverFunnelLine query={{ funnel: { kept: 2, rejected: { city: 0, zone: 5 } } }} />)
    const text = screen.getByTestId('discover-funnel').textContent ?? ''
    expect(text).toContain('2 retenus — 5 hors zone')
    expect(text).not.toMatch(/ville|trouvés|\b0\b/)
  })

  it('sans entonnoir, rien', () => {
    const { container } = render(<DiscoverFunnelLine query={{}} />)
    expect(container).toBeEmptyDOMElement()
  })

  // #4631.6 — la recherche simple mentionne ce que l'élargissement de zone a AJOUTÉ (« + 14 par l'élargissement »).
  it('#4631.6 — « + N par l’élargissement » quand des comptes viennent de l’élargissement de zone', () => {
    render(
      <DiscoverFunnelLine query={{ funnel: { entered: 128, kept: 20, rejected: { city: 94 } } }} widenedCount={14} />,
    )
    expect(screen.getByTestId('discover-funnel')).toHaveTextContent('94 hors ville + 14 par l’élargissement')
  })

  it('#4631.6 — aucun élargissement (0 ou absent) : aucune mention, jamais « + 0 »', () => {
    render(<DiscoverFunnelLine query={{ funnel: { entered: 128, kept: 3, rejected: {} } }} widenedCount={0} />)
    expect(screen.getByTestId('discover-funnel')).not.toHaveTextContent('élargissement')
  })

  // Lot 790 (F) — coupée par le délai AVANT la vérification : « 0 trouvés · 0 retenus » serait un 0 non mesuré.
  it('recherche coupée par le délai avant la vérification : aucune ligne « 0 trouvés · 0 retenus »', () => {
    const { container } = render(
      <DiscoverFunnelLine
        query={{ funnel: { entered: 0, kept: 0, rejected: {} }, skillSearch: { deadlineCut: true, notAttempted: 150 } }}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('coupée par le délai mais avec des comptes retenus : la ligne reste', () => {
    render(
      <DiscoverFunnelLine
        query={{ funnel: { entered: 30, kept: 4, rejected: {} }, skillSearch: { deadlineCut: true } }}
      />,
    )
    expect(screen.getByTestId('discover-funnel')).toHaveTextContent('30 trouvés · 4 retenus')
  })
})
