import { fireEvent, screen } from '@testing-library/react'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { CockpitCoverage, CockpitCoverageAnomaly } from '@bellum/contracts'
import { PortfolioCoverageCard } from './PortfolioCoverageCard'

/**
 * #1573.4 — LE BADGE « POTENTIEL STRUCTUREL FORT », SUR LA LIGNE D'ANOMALIE.
 *
 * `StructuralPotentialBadge.test.tsx` garde son propre contenu (refus de
 * date, d'un fait présent). Cette suite garde son BRANCHEMENT sur la ligne :
 * le badge n'apparaît QUE si le seuil est réellement franchi, et il vit HORS
 * du lien de navigation — un `<button>` niché dans un `<a>` est invalide.
 */

const PROVENANCE = {
  sources: ['bellum' as const],
  window_days: 30,
  population: 12,
  computed_at: '2026-09-06T09:00:00.000Z',
}

function anomaly(over: Partial<CockpitCoverageAnomaly> = {}): CockpitCoverageAnomaly {
  return {
    account_id: '11111111-1111-4111-8111-111111111111',
    company_name: 'Thales',
    kind: 'never_worked',
    since: null,
    logo_url: null,
    website: null,
    ...over,
  }
}

function coverage(anomalies: CockpitCoverageAnomaly[]): CockpitCoverage {
  return {
    followed: 6,
    without_next_action: 4,
    no_interaction_30d: 3,
    new_signals_7d: 0,
    never_worked: 3,
    anomalies,
    provenance: PROVENANCE,
  }
}

describe('PortfolioCoverageCard — le badge de potentiel structurel', () => {
  it('affiche le badge quand la couverture franchit réellement le seuil', async () => {
    renderWithRouter(<PortfolioCoverageCard coverage={coverage([anomaly({ market_paths: 41 })])} />)

    expect(await screen.findByRole('button', { name: /potentiel structurel fort/i })).toBeInTheDocument()
  })

  it('n’affiche PAS le badge sous le seuil (`market_paths: null`)', async () => {
    renderWithRouter(<PortfolioCoverageCard coverage={coverage([anomaly({ market_paths: null })])} />)

    await screen.findByText('Thales')
    expect(screen.queryByRole('button', { name: /potentiel structurel fort/i })).not.toBeInTheDocument()
  })

  it('n’affiche PAS le badge quand le champ est ABSENT — une API plus ancienne que le web', async () => {
    renderWithRouter(<PortfolioCoverageCard coverage={coverage([anomaly()])} />)

    await screen.findByText('Thales')
    expect(screen.queryByRole('button', { name: /potentiel structurel fort/i })).not.toBeInTheDocument()
  })

  it('le clic sur le badge ouvre le détail SANS déclencher la navigation de la ligne', async () => {
    renderWithRouter(<PortfolioCoverageCard coverage={coverage([anomaly({ market_paths: 41 })])} />)

    const badge = await screen.findByRole('button', { name: /potentiel structurel fort/i })
    fireEvent.click(badge)

    expect(await screen.findByText(/Bellum a observé/i)).toBeInTheDocument()
  })

  it('le déclencheur du badge n’est PAS un descendant du lien de navigation (HTML valide)', async () => {
    renderWithRouter(<PortfolioCoverageCard coverage={coverage([anomaly({ market_paths: 41 })])} />)

    const badge = await screen.findByRole('button', { name: /potentiel structurel fort/i })
    const link = await screen.findByRole('link', { name: /thales/i })
    expect(link.contains(badge)).toBe(false)
  })
})
