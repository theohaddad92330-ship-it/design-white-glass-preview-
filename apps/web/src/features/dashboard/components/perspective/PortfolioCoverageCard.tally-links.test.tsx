import { screen } from '@testing-library/react'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { CockpitCoverage } from '@bellum/contracts'
import { PortfolioCoverageCard } from './PortfolioCoverageCard'

/**
 * #2114.56/.60 — « un clic ouvre la liste propriétaire filtrée ». Sur les cinq
 * tuiles de couverture, SEULES deux portent un filtre RÉEL côté `/accounts`
 * (`ACCOUNT_LIST_HEADLINE_FILTERS` — `packages/contracts/src/schemas/account.ts:496`,
 * même patron que `sinceLastVisitLineHref`) : « sans prochaine action » et
 * « nouveaux signaux ». Les trois autres (suivis, silencieux, jamais
 * travaillés) n'ont AUCUN filtre serveur — les rendre cliquables ouvrirait une
 * liste NON filtrée, exactement ce que la doctrine « un objet sans écran où
 * atterrir ne se promet pas cliquable » refuse.
 */

const PROVENANCE = {
  sources: ['bellum' as const],
  window_days: 30,
  population: 12,
  computed_at: '2026-09-06T09:00:00.000Z',
}

function coverage(): CockpitCoverage {
  return {
    followed: 6,
    without_next_action: 4,
    no_interaction_30d: 3,
    new_signals_7d: 2,
    never_worked: 3,
    anomalies: [],
    provenance: PROVENANCE,
  }
}

describe('PortfolioCoverageCard — les tuiles filtrées', () => {
  it('« sans prochaine action » ouvre /accounts?headline=withoutNextAction', async () => {
    renderWithRouter(<PortfolioCoverageCard coverage={coverage()} />)
    const label = await screen.findByText('Sans prochaine action')
    const link = label.closest('a')
    expect(link).not.toBeNull()
    expect(link).toHaveAttribute('href', '/accounts?headline=withoutNextAction')
  })

  it('« nouveau signal » ouvre /accounts?headline=newSignals7d', async () => {
    renderWithRouter(<PortfolioCoverageCard coverage={coverage()} />)
    const label = await screen.findByText('Nouveau signal')
    const link = label.closest('a')
    expect(link).not.toBeNull()
    expect(link).toHaveAttribute('href', '/accounts?headline=newSignals7d')
  })

  it('« suivis », « sans échange 30 j » et « jamais travaillés » restent NON cliquables — aucun filtre serveur', async () => {
    renderWithRouter(<PortfolioCoverageCard coverage={coverage()} />)
    expect((await screen.findByText('Suivis')).closest('a')).toBeNull()
    expect(screen.getByText('Sans échange 30 j').closest('a')).toBeNull()
    expect(screen.getByText('Jamais travaillés').closest('a')).toBeNull()
  })
})
