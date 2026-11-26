import { screen } from '@testing-library/react'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { CockpitCoverage, CockpitCoverageAnomaly } from '@bellum/contracts'
import { PortfolioCoverageCard } from './PortfolioCoverageCard'

/**
 * #1572 — la ligne d'anomalie dit l'ÉTAT de la relation ; les parcours observés
 * disent pourquoi celui-là plutôt qu'un autre.
 *
 * Trois comptes affichant « Aucun échange, jamais » ne disaient pas lequel
 * ouvrir. Le fragment ajoute cette information — et seulement quand elle existe.
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

describe('PortfolioCoverageCard — les parcours observés sur la ligne', async () => {
  it('ajoute le fragment après la raison quand la mémoire marché couvre le compte', async () => {
    renderWithRouter(<PortfolioCoverageCard coverage={coverage([anomaly({ market_paths: 12 })])} />)

    expect(await screen.findByText(/12 parcours observés/)).toBeInTheDocument()
  })

  it('garde la RAISON — le fragment la complète, il ne la remplace pas', async () => {
    renderWithRouter(<PortfolioCoverageCard coverage={coverage([anomaly({ market_paths: 41 })])} />)

    const line = await screen.findByText(/41 parcours observés/)
    expect(line.textContent).toMatch(/·/)
    // La raison d'origine survit dans la même ligne : l'état de la relation prime.
    expect(line.textContent?.indexOf('41 parcours')).toBeGreaterThan(0)
  })

  it('n’affiche RIEN quand le compte n’est pas couvert — pas d’« inconnu », pas de tiret', async () => {
    renderWithRouter(<PortfolioCoverageCard coverage={coverage([anomaly({ market_paths: null })])} />)

    await screen.findByText('Thales')
    expect(screen.queryByText(/parcours observés/)).not.toBeInTheDocument()
    expect(screen.queryByText(/—/)).not.toBeInTheDocument()
  })

  it('n’affiche RIEN quand le champ est ABSENT — une API plus ancienne que le web', async () => {
    // Le cas qui casse un écran pendant un déploiement : le champ n'existe pas
    // du tout. La carte doit rendre exactement comme avant la fonctionnalité.
    renderWithRouter(<PortfolioCoverageCard coverage={coverage([anomaly()])} />)

    expect(await screen.findByText('Thales')).toBeInTheDocument()
    expect(screen.queryByText(/parcours observés/)).not.toBeInTheDocument()
  })

  it('n’écrit jamais « 0 parcours observés »', async () => {
    renderWithRouter(<PortfolioCoverageCard coverage={coverage([anomaly({ market_paths: null })])} />)

    await screen.findByText('Thales')
    expect(screen.queryByText(/0 parcours/)).not.toBeInTheDocument()
  })
})
